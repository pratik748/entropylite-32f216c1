

# Fix Cadence — make it actually publish

The page is empty because `cadence_entries` has zero rows. The pg_cron job is scheduled at 06:00 UTC daily but `cadence-generate` has **no edge function logs at all**, so either it's never fired successfully or it's crashing on cold start. There's also no way to manually seed the first entry.

## What I'll do

### 1. Make the generator runnable on demand

Update `supabase/functions/cadence-generate/index.ts`:
- Add a proper HTTP entry that accepts both the cron payload and a manual `?force=true` (or POST with `{ admin_key }`) to generate immediately, including overwriting today's entry.
- Wrap the whole pipeline in a top-level try/catch that **always** writes a log line and returns a clean JSON error (currently a thrown error in `callAIParallel` or the image step likely kills the function before any log flushes).
- Add `console.log` checkpoints at every stage (topic picked → research done → critic done → image done → row inserted) so the next failure is diagnosable from `edge_function_logs`.
- Make the diagram step **non-fatal**: if `gemini-2.5-flash-image` fails or times out, save the entry with `image_url = null` instead of aborting the whole run. The page already handles `image: null`.
- Tighten the `callAIParallel` usage: race only 2 fast providers (Cloudflare + Mistral) for research, then a single critic pass via Gemini Flash for synthesis. Current 3-provider race + critic is ~45–60s and likely hitting the 60s edge timeout.

### 2. Seed the database immediately (manual one-shot)

After the generator is hardened, manually invoke `cadence-generate` once via the curl edge-function tool to publish today's entry. The page stops being empty within ~30s.

### 3. Verify cron actually fires

- Check `cron.job_run_details` for the `cadence-daily` job to see if past runs fired and what they returned (right now we don't know — could be auth failure, network, or the function crashing).
- If the cron call returns a non-2xx, switch the cron command to use the **service-role key** instead of the anon key so it bypasses any future RLS / rate-limit surprises, and add a `?force=true` query param so each daily run overwrites if today already exists.
- Schedule a second safety run at 06:15 UTC that retries only if no entry exists for today.

### 4. Frontend: add an "auto-recover" path

Update `src/pages/CadencePage.tsx`:
- If `fetchAllEntries()` returns 0 rows AND the user is on the page, fire a one-time `supabase.functions.invoke('cadence-generate')` from the client and re-fetch on success. This means the very first visitor self-heals the page even if cron has never fired. Guarded by sessionStorage so it only attempts once per session.
- Replace the static "First entry inbound" block with a live "Generating today's entry…" state during that self-heal call.

### 5. Add a tiny status footer

On the index page, show the timestamp of the most recent entry + the next scheduled run time, so the failure mode is visible if it ever happens again.

## Files affected

- **Edited**: `supabase/functions/cadence-generate/index.ts` (hardening + non-fatal image + force flag + checkpoints)
- **Edited**: `src/pages/CadencePage.tsx` (self-heal invoke + status footer)
- **Migration**: replace the `cadence-daily` cron job → use service-role key, add `force=true`, add 06:15 UTC retry job
- **Manual op (no file change)**: invoke `cadence-generate` once after deploy to seed today's entry

## Out of scope

- No schema changes (tables are already correct).
- No change to the Cadence index/entry page visual design.
- No change to any other module — pure repair of the Cadence generator + page bootstrap.

