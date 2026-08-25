import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET_KEYS = {
  MISTRAL_API_KEY: "workspace-one-secret",
  MISTRAL_API_KEY_2: "workspace-two-secret",
  MISTRAL_API_KEY_3: "workspace-three-secret",
};

type Env = Record<string, string | undefined>;

type MockRoute = {
  tokenIncludes?: string;
  urlIncludes?: string;
  status?: number;
  text?: string;
  body?: unknown;
};

const opts = {
  systemPrompt: "system",
  userPrompt: "user",
  skipHardening: true,
};

function installDenoEnv(env: Env) {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) => env[key],
    },
  });
}

function jsonResponse(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    json: async () => (typeof payload === "string" ? { choices: [{ message: { content: payload } }] } : payload),
    text: async () => text,
  } as Response;
}

function errorResponse(status: number, text = "provider error") {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  } as Response;
}

function mockFetch(routes: MockRoute[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization || "");
    const route = routes.find((candidate) => {
      const tokenMatch = !candidate.tokenIncludes || auth.includes(candidate.tokenIncludes);
      const urlMatch = !candidate.urlIncludes || url.includes(candidate.urlIncludes);
      return tokenMatch && urlMatch;
    });
    calls.push(auth.replace(/^Bearer /, ""));
    if (!route) return errorResponse(500, "unmatched route");
    if (route.status && route.status >= 400) return errorResponse(route.status, route.text);
    return jsonResponse(route.body ?? route.text ?? "ok");
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

async function importCallAI(env: Env) {
  vi.resetModules();
  installDenoEnv(env);
  return await import("../../supabase/functions/_shared/callAI.ts");
}

async function runCallAI(env: Env, routes: MockRoute[]) {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const fetchState = mockFetch(routes);
  const mod = await importCallAI(env);
  const result = await mod.callAI(opts);
  return { result, logs: [...info.mock.calls, ...warn.mock.calls].flat().map(String), ...fetchState };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("callAI Mistral workspace failover", () => {
  it("uses workspace 1 when it succeeds", async () => {
    const { result, calls } = await runCallAI(SECRET_KEYS, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, text: "workspace-1-ok" },
    ]);

    expect(result).toMatchObject({ text: "workspace-1-ok", provider: "mistral" });
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY]);
  });

  it.each([429, 402, 401])("fails over to workspace 2 after workspace 1 returns %s", async (status) => {
    const { result, calls, logs } = await runCallAI(SECRET_KEYS, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_2, text: "workspace-2-ok" },
    ]);

    expect(result.text).toBe("workspace-2-ok");
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY_2]);
    expect(logs.join("\n")).toContain("failover → mistral-workspace-2");
  });

  it("returns workspace 2 result when workspace 1 fails and workspace 2 succeeds", async () => {
    const { result, calls } = await runCallAI(SECRET_KEYS, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 500 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_2, text: "workspace-2-after-500" },
    ]);

    expect(result.text).toBe("workspace-2-after-500");
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY_2]);
  });

  it("attempts workspace 3 when workspaces 1 and 2 fail", async () => {
    const { result, calls } = await runCallAI(SECRET_KEYS, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 429 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_2, status: 402 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_3, text: "workspace-3-ok" },
    ]);

    expect(result.text).toBe("workspace-3-ok");
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY_2, SECRET_KEYS.MISTRAL_API_KEY_3]);
  });

  it("uses existing emergency fallback after all three Mistral workspaces fail", async () => {
    const { result, calls } = await runCallAI({ ...SECRET_KEYS, GOOGLE_GEMINI_KEY: "gemini-secret" }, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 429 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_2, status: 402 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_3, status: 401 },
      { urlIncludes: "generativelanguage.googleapis.com", body: { candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }] } },
    ]);

    expect(result).toMatchObject({ text: "gemini-ok", provider: "mistral" });
    expect(calls.slice(0, 3)).toEqual([SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY_2, SECRET_KEYS.MISTRAL_API_KEY_3]);
  });

  it("does not cascade malformed 400 requests through all workspaces", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { calls } = mockFetch([{ tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 400 }]);
    const mod = await importCallAI(SECRET_KEYS);

    await expect(mod.callAI(opts)).rejects.toMatchObject({ classification: "REQUEST_ERROR" });
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY]);
    expect([...info.mock.calls, ...warn.mock.calls].flat().join("\n")).toContain("no workspace cascade");
  });

  it("skips a missing workspace 2 key cleanly", async () => {
    const { result, calls } = await runCallAI({ MISTRAL_API_KEY: SECRET_KEYS.MISTRAL_API_KEY, MISTRAL_API_KEY_3: SECRET_KEYS.MISTRAL_API_KEY_3 }, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 429 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_3, text: "workspace-3-ok" },
    ]);

    expect(result.text).toBe("workspace-3-ok");
    expect(calls).toEqual([SECRET_KEYS.MISTRAL_API_KEY, SECRET_KEYS.MISTRAL_API_KEY_3]);
  });

  it("preserves the existing no-provider error when all AI providers are missing", async () => {
    mockFetch([]);
    const mod = await importCallAI({});

    await expect(mod.callAI(opts)).rejects.toThrow("No AI providers configured");
  });

  it("never writes API keys to logs", async () => {
    const { logs } = await runCallAI(SECRET_KEYS, [
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, status: 429 },
      { tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY_2, text: "workspace-2-ok" },
    ]);

    const logText = logs.join("\n");
    expect(logText).toContain("mistral-workspace-1");
    expect(logText).toContain("mistral-workspace-2");
    expect(logText).not.toContain(SECRET_KEYS.MISTRAL_API_KEY);
    expect(logText).not.toContain(SECRET_KEYS.MISTRAL_API_KEY_2);
    expect(logText).not.toContain(SECRET_KEYS.MISTRAL_API_KEY_3);
  });

  it("keeps callAIParallel compatible with existing callers", async () => {
    mockFetch([{ tokenIncludes: SECRET_KEYS.MISTRAL_API_KEY, text: "parallel-ok" }]);
    const mod = await importCallAI(SECRET_KEYS);

    await expect(mod.callAIParallel(opts)).resolves.toEqual([{ text: "parallel-ok", provider: "mistral" }]);
  });
});
