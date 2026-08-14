/**
 * Demo token verification shared by every auth-gated function.
 *
 * A demo token is issued only by `demo-session` after a correct access code.
 * It carries a synthetic subject, never the real portfolio owner, so a demo
 * session can read the engines but can never write into a real user's rows.
 */

export const DEMO_PREFIX = "edemo.";
/** Fixed synthetic subject for demo sessions. Owns no real data. */
export const DEMO_SUBJECT = "00000000-0000-4000-8000-0000000de770";

const enc = new TextEncoder();

function b64urlDecode(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function hmacKey() {
  const secret = Deno.env.get("DEMO_SESSION_SECRET");
  if (!secret) return null;
  return await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

export function isDemoToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(DEMO_PREFIX);
}

/** Returns the demo payload when the token is authentic and unexpired. */
export async function verifyDemoToken(token: string): Promise<{ owner: string; exp: number } | null> {
  if (!isDemoToken(token)) return null;
  const parts = token.slice(DEMO_PREFIX.length).split(".");
  if (parts.length !== 2) return null;
  const [body, hex] = parts;
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const key = await hmacKey();
  if (!key) return null;
  const mac = Uint8Array.from(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const ok = await crypto.subtle.verify("HMAC", key, mac, enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (payload?.demo !== true) return null;
    if (typeof payload?.exp !== "number" || payload.exp <= Date.now()) return null;
    return { owner: String(payload.sub), exp: payload.exp };
  } catch {
    return null;
  }
}