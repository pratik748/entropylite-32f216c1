import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  applyDigits,
  clearStoredDemo,
  createDemoSession,
  DemoSessionError,
  hasStoredDemo,
  isCompleteCode,
  normalizeCodeInput,
  readStoredDemo,
  resumeDemoSession,
  storeDemo,
} from "./demoSession";

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
    const session = await createDemoSession("9740");
    expect(session.mode).toBe("local");
    expect(session.portfolio.length).toBeGreaterThan(0);
    expect(readStoredDemo()?.token).toBe(session.token);
    expect(hasStoredDemo()).toBe(true);
  });

  it("reports an invalid code category and stores nothing", async () => {
    await expect(createDemoSession("1111")).rejects.toMatchObject({ code: "DEMO_CODE_INVALID" } satisfies Partial<DemoSessionError>);
    expect(hasStoredDemo()).toBe(false);
  });

  it("normalizes input before local validation and never requests a demo API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createDemoSession("97-401x")).resolves.toMatchObject({ mode: "local" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an elapsed token as no session", () => {
    storeDemo({ token: "tok.old", expiresAt: Date.now() - 1000, mode: "local" });
    expect(readStoredDemo()).toBeNull();
    expect(hasStoredDemo()).toBe(false);
  });

  it("rehydrates the local portfolio on refresh without a network request", async () => {
    const exp = Date.now() + 60_000;
    storeDemo({ token: "tok.abc", expiresAt: exp, mode: "local" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const s = await resumeDemoSession();
    expect(s?.portfolio.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
