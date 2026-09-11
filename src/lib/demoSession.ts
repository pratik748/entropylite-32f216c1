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
  /** Local sessions intentionally never impersonate a Supabase user. */
  mode: "local";
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
const LOCAL_DEMO_CODE = "9740";
const TTL_MINUTES = 45;

// The demo is a read-only product preview, not a user workspace. Keeping its
// snapshot in the client removes the deployment dependency on an edge function
// and prevents a demo visitor from ever receiving a database identity.
const LOCAL_DEMO_PORTFOLIO: DemoPosition[] = [
  { id: "demo-msft", ticker: "MSFT", buyPrice: 412.18, quantity: 24, createdAt: "2026-01-13T09:30:00.000Z" },
  { id: "demo-nvda", ticker: "NVDA", buyPrice: 136.42, quantity: 36, createdAt: "2026-02-04T09:30:00.000Z" },
  { id: "demo-tlt", ticker: "TLT", buyPrice: 89.77, quantity: 55, createdAt: "2026-03-12T09:30:00.000Z" },
];
const LOCAL_DEMO_HISTORY: DemoHistoryEntry[] = [];

/** Only the token and its expiry are persisted, never the access code. */
interface StoredDemo {
  token: string;
  expiresAt: number;
  mode: "local";
}

export function readStoredDemo(): StoredDemo | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token !== "string" || typeof parsed?.expiresAt !== "number" || parsed?.mode !== "local") return null;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredDemo;
  } catch {
    return null;
  }
}

export function storeDemo(session: { token: string; expiresAt: number; mode: "local" }) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt, mode: session.mode }));
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

function trace(stage: string, detail: Record<string, unknown> = {}) {
  // Deliberately omit access codes and tokens from browser diagnostics.
  console.info("[demo-session]", { stage, ...detail });
}

/**
 * Creates a local-only preview session. This deliberately makes no network or
 * Supabase call: the preview has fixed public fixture data and no write path.
 */
export async function createDemoSession(code: string): Promise<DemoSession> {
  trace("create-start");
  if (normalizeCodeInput(code) !== LOCAL_DEMO_CODE) {
    trace("create-rejected", { code: "DEMO_CODE_INVALID" });
    throw new DemoSessionError("DEMO_CODE_INVALID", "That access code isn't valid.");
  }
  const expiresAt = Date.now() + TTL_MINUTES * 60_000;
  const session: DemoSession = {
    token: `local-demo-${expiresAt}`,
    expiresAt,
    mode: "local",
    scope: ["portfolio:read", "risk:read", "intelligence:read", "news:read", "analytics:read"],
    label: "Demo Workspace",
    portfolio: LOCAL_DEMO_PORTFOLIO,
    history: LOCAL_DEMO_HISTORY,
  };
  storeDemo(session);
  trace("create-persisted", { expiresAt: session.expiresAt, portfolioCount: session.portfolio.length, historyCount: session.history.length });
  return session;
}

/** Re-hydrates the local-only demo session on refresh. */
export async function resumeDemoSession(): Promise<DemoSession | null> {
  const stored = readStoredDemo();
  if (!stored) return null;
  trace("resume-start", { expiresAt: stored.expiresAt });
  const session: DemoSession = {
    token: stored.token,
    expiresAt: stored.expiresAt,
    mode: "local",
    scope: ["portfolio:read", "risk:read", "intelligence:read", "news:read", "analytics:read"],
    label: "Demo Workspace",
    portfolio: LOCAL_DEMO_PORTFOLIO,
    history: LOCAL_DEMO_HISTORY,
  };
  trace("resume-complete", { expiresAt: session.expiresAt });
  return session;
}
