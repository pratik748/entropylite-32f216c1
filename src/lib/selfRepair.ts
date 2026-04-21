/**
 * Self-Repair Department
 * ---------------------------------------------------------------
 * Generic resilience wrapper for edge-function calls. Handles:
 *   1. Transient network / 5xx / timeout with exponential backoff
 *   2. Silent retry on soft-failure payloads from the server
 *      ({ softFailure: true } response)
 *   3. Stale-cache rehydration when every attempt fails
 *   4. Structured repair trail the UI can surface as an "Auto-Repair"
 *      badge so the user never just sees an empty panel.
 *
 * The goal: no module should ever render "Something went wrong" for
 * transient backend hiccups. It should self-heal and show last-good.
 */

export interface RepairResult<T> {
  data: T | null;
  /** True if any repair action had to run (backend auto-heal or client retry). */
  autoRepaired: boolean;
  /** Human-readable chain of repair steps, server + client combined. */
  repairTrail: string[];
  /** True if we ended up serving the stale cache because all live attempts failed. */
  servedFromStaleCache: boolean;
  /** Final error message if even stale cache was unavailable. */
  error?: string;
}

export interface RunWithRepairOptions<T> {
  /** Async operation to run — typically a governedInvoke() call. */
  run: () => Promise<{ data: T | null; error: { message: string } | null }>;
  /** Optional: how many client-side retries to attempt. Default 2. */
  maxRetries?: number;
  /** Optional: base backoff in ms (exponential). Default 1500ms. */
  baseBackoffMs?: number;
  /** Optional: predicate to decide if a successful payload is actually usable. */
  isUsable?: (data: T) => boolean;
  /** Optional: stale cache provider (returns last-good payload if available). */
  staleCache?: () => T | null;
  /** Optional label used in console + repairTrail entries. */
  label?: string;
}

function backoff(attempt: number, base: number): number {
  const jitter = Math.random() * 400;
  return Math.min(15_000, base * Math.pow(2, attempt) + jitter);
}

/**
 * runWithRepair
 * ---------------------------------------------------------------
 * Executes `run` with automatic retry and stale-cache fallback.
 * Never throws — always returns a RepairResult.
 */
export async function runWithRepair<T>({
  run,
  maxRetries = 2,
  baseBackoffMs = 1500,
  isUsable,
  staleCache,
  label = "self-repair",
}: RunWithRepairOptions<T>): Promise<RepairResult<T>> {
  const trail: string[] = [];
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await run();

      if (error) {
        lastError = error.message || "unknown error";
        trail.push(`[${label}] attempt ${attempt + 1}: ${lastError.slice(0, 120)}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoff(attempt, baseBackoffMs)));
          continue;
        }
        break;
      }

      // Merge server-side repair trail if the function emitted one.
      const serverTrail = (data as any)?.repairTrail;
      if (Array.isArray(serverTrail) && serverTrail.length > 0) {
        trail.push(...serverTrail.map((t: string) => `[server] ${t}`));
      }
      const softFail = (data as any)?.softFailure === true;
      const autoRepaired = (data as any)?.autoRepaired === true || softFail;

      // Soft failure → retry before giving up.
      if (softFail && attempt < maxRetries) {
        trail.push(`[${label}] soft-failure signaled by server — retrying`);
        await new Promise((r) => setTimeout(r, backoff(attempt, baseBackoffMs)));
        continue;
      }

      // Usable payload check — if caller says "no", treat like a soft failure.
      if (data && isUsable && !isUsable(data)) {
        trail.push(`[${label}] payload failed usability check on attempt ${attempt + 1}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoff(attempt, baseBackoffMs)));
          continue;
        }
        // Exhausted — fall through to stale cache.
        break;
      }

      return {
        data,
        autoRepaired,
        repairTrail: trail,
        servedFromStaleCache: false,
      };
    } catch (e: any) {
      lastError = e?.message || String(e);
      trail.push(`[${label}] exception attempt ${attempt + 1}: ${lastError.slice(0, 120)}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoff(attempt, baseBackoffMs)));
      }
    }
  }

  // All live attempts failed — serve stale cache if available.
  if (staleCache) {
    const stale = staleCache();
    if (stale) {
      trail.push(`[${label}] live calls exhausted — served from last-good cache`);
      return {
        data: stale,
        autoRepaired: true,
        repairTrail: trail,
        servedFromStaleCache: true,
      };
    }
  }

  return {
    data: null,
    autoRepaired: true,
    repairTrail: trail,
    servedFromStaleCache: false,
    error: lastError || "Unable to reach service",
  };
}