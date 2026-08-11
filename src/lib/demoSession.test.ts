import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  applyDigits,
  clearStoredDemo,
  createDemoSession,
  hasStoredDemo,
  isCompleteCode,
  normalizeCodeInput,
  readStoredDemo,
  resumeDemoSession,
  storeDemo,
} from "./demoSession";

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe("demo code input", () => {
  it("keeps digits only and caps at four", () => {
    expect(normalizeCodeInput("9a7-4 0 1")).toBe("9740");
    expect(normalizeCodeInput("")).toBe("");
  });

  it("spreads a pasted code across all cells", () => {
    expect(applyDigits(["", "", "", ""], "9740", 0)).toEqual(["9", "7", "4", "0"]);
  });

  it("writes a single digit at the focused cell", () => {
    expect(applyDigits(["9", "", "", ""], "7", 1)).toEqual(["9", "7", "", ""]);
  });

  it("recognises a complete code", () => {
    expect(isCompleteCode(["9", "7", "4", "0"])).toBe(true);
    expect(isCompleteCode(["9", "7", "4", ""])).toBe(false);
  });
});

describe("demo session lifecycle", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => clearStoredDemo());

  it("stores a token after a valid code and exposes the portfolio", async () => {
    const exp = Date.now() + 30 * 60_000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          demo: true,
          token: "tok.abc",
          expiresAt: exp,
          scope: ["portfolio:read"],
          label: "Demo Workspace",
          portfolio: [{ id: "1", ticker: "AAPL", buyPrice: 100, quantity: 2 }],
          history: [],
        })
      )
    );

    const session = await createDemoSession("9740");
    expect(session.portfolio).toHaveLength(1);
    expect(readStoredDemo()?.token).toBe("tok.abc");
    expect(hasStoredDemo()).toBe(true);
  });

  it("surfaces the server message for an invalid code and stores nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "That access code isn't valid." }, 401)));
    await expect(createDemoSession("1111")).rejects.toThrow(/isn't valid/);
    expect(hasStoredDemo()).toBe(false);
  });

  it("never sends a non-numeric or over-length code to the server", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createDemoSession("97-401x")).rejects.toBeTruthy();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.code).toBe("9740");
  });

  it("treats an elapsed token as no session", () => {
    storeDemo({ token: "tok.old", expiresAt: Date.now() - 1000 });
    expect(readStoredDemo()).toBeNull();
    expect(hasStoredDemo()).toBe(false);
  });

  it("clears the stored token when resume is rejected as expired", async () => {
    storeDemo({ token: "tok.abc", expiresAt: Date.now() + 60_000 });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Demo session expired" }, 401)));
    expect(await resumeDemoSession()).toBeNull();
    expect(hasStoredDemo()).toBe(false);
  });

  it("rehydrates the portfolio on resume", async () => {
    const exp = Date.now() + 60_000;
    storeDemo({ token: "tok.abc", expiresAt: exp });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ demo: true, expiresAt: exp, scope: [], label: "Demo Workspace", portfolio: [], history: [{ id: "h1" }] })
      )
    );
    const s = await resumeDemoSession();
    expect(s?.history).toHaveLength(1);
  });
});