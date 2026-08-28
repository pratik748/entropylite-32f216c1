/**
 * Demo session client. The server is the sole authority: the four-digit code is
 * posted to the `demo-session` function, which validates it and returns a
 * short-lived signed token plus the read-only demo portfolio context.
 *
 * The code itself is never persisted. Only the signed token + expiry live in
 * sessionStorage (cleared when the tab closes).
 */

export interface DemoPosition {
  id: string;
  ticker: string;
  buyPrice: number;
  quantity: number;
  analysis?: any;
  createdAt?: string;
}

export interface DemoHistoryEntry {
  id: string;
  ticker: string;
  timestamp: number;
  suggestion: string;
  currentPrice: number;
  buyPrice: number;
  confidence: number;
}

export interface DemoSession {
  token: string;
  expiresAt: number;
  scope: string[];
  label: string;
  portfolio: DemoPosition[];
  history: DemoHistoryEntry[];
}

export type DemoFailureCode =
  | "DEMO_CODE_INVALID"
  | "DEMO_SESSION_CREATE_FAILED"
  | "DEMO_SESSION_NOT_FOUND"
  | "DEMO_SESSION_EXPIRED"
  | "DEMO_DATA_LOAD_FAILED"
  | "AUTH_STATE_NOT_READY"
  | "DATABASE_ERROR"
  | "NETWORK_ERROR";

export class DemoSessionError extends Error {
  constructor(
    public readonly code: DemoFailureCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DemoSessionError";
  }
}

const STORAGE_KEY = "entropy.demo.session";

/** Only the token and its expiry are persisted, never the access code. */
interface StoredDemo {
  token: string;
  expiresAt: number;
}

export function readStoredDemo(): StoredDemo | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token !== "string" || typeof parsed?.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredDemo;
  } catch {
    return null;
  }
}

export function storeDemo(session: { token: string; expiresAt: number }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }));
  } catch {
    /* private mode, session stays in memory only */
  }
}

export function clearStoredDemo() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when a non-expired demo token is present. Cheap, synchronous. */
export function hasStoredDemo(): boolean {
  return readStoredDemo() !== null;
}

/* ── code input helpers (pure, unit-tested) ── */

/** Keeps digits only and caps at four, used for typing and pasting alike. */
export function normalizeCodeInput(value: string): string {
  return (value || "").replace(/\D/g, "").slice(0, 4);
}

/** Spreads a pasted/typed string across the four digit cells from `startIndex`. */
export function applyDigits(current: string[], incoming: string, startIndex: number): string[] {
  const digits = normalizeCodeInput(incoming);
  const next = [...current];
  for (let i = 0; i < digits.length && startIndex + i < 4; i++) next[startIndex + i] = digits[i];
  return next;
}

export function isCompleteCode(cells: string[]): boolean {
  return cells.length === 4 && cells.every((c) => /^\d$/.test(c));
}

/* ── server calls ── */

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-session`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function trace(stage: string, detail: Record<string, unknown> = {}) {
  // Deliberately omit access codes and tokens from browser diagnostics.
  console.info("[demo-session]", { stage, ...detail });
}

async function post(body: Record<string, unknown>) {
  const action = body.action === "resume" ? "resume" : "create";
  if (!import.meta.env.VITE_SUPABASE_URL || !ANON) {
    trace("configuration-missing", { action, hasUrl: !!import.meta.env.VITE_SUPABASE_URL, hasAnonKey: !!ANON });
    throw new DemoSessionError("DEMO_SESSION_CREATE_FAILED", "Demo service is not configured.");
  }

  let res: Response;
  trace("request-start", { action, url: FN_URL });
  try {
    res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    trace("request-network-error", { action, message: error instanceof Error ? error.message : String(error) });
    throw new DemoSessionError("NETWORK_ERROR", "Could not reach the demo service.");
  }
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  trace("response-received", { action, status: res.status, category: payload?.code ?? null });
  if (!res.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Demo workspace is unavailable right now.";
    const code = typeof payload?.code === "string" ? payload.code : "DEMO_SESSION_CREATE_FAILED";
    throw new DemoSessionError(code as DemoFailureCode, message, res.status);
  }
  return payload;
}

/** Exchanges a four-digit access code for a restricted demo session. */
export async function createDemoSession(code: string): Promise<DemoSession> {
  trace("create-start");
  const data = await post({ action: "create", code: normalizeCodeInput(code) });
  if (!data?.token || typeof data.expiresAt !== "number") {
    trace("create-invalid-response", { hasToken: !!data?.token, hasExpiry: typeof data?.expiresAt === "number" });
    throw new DemoSessionError("DEMO_SESSION_CREATE_FAILED", "Demo service returned an invalid session.");
  }
  const session: DemoSession = {
    token: data.token,
    expiresAt: data.expiresAt,
    scope: data.scope ?? [],
    label: data.label ?? "Demo Workspace",
    portfolio: data.portfolio ?? [],
    history: data.history ?? [],
  };
  storeDemo(session);
  trace("create-persisted", { expiresAt: session.expiresAt, portfolioCount: session.portfolio.length, historyCount: session.history.length });
  return session;
}

/** Re-hydrates a stored demo token on reload. Returns null when expired/invalid. */
export async function resumeDemoSession(): Promise<DemoSession | null> {
  const stored = readStoredDemo();
  if (!stored) return null;
  trace("resume-start", { expiresAt: stored.expiresAt });
  try {
    const data = await post({ action: "resume", token: stored.token });
    return {
      token: stored.token,
      expiresAt: data.expiresAt ?? stored.expiresAt,
      scope: data.scope ?? [],
      label: data.label ?? "Demo Workspace",
      portfolio: data.portfolio ?? [],
      history: data.history ?? [],
    };
  } catch (error) {
    trace("resume-failed", { code: error instanceof DemoSessionError ? error.code : "UNKNOWN" });
    clearStoredDemo();
    return null;
  }
}
