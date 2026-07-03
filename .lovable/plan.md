# Portfolio Sentinel

Goal: never let another CRWD-style 63% drop slip past silently. Every holding is monitored on the server, re-analyzed on a schedule, and the user is emailed the moment a risk trigger fires.

## 1. Email infrastructure (prerequisite)

Lovable Emails needs a verified sender domain. I'll:
1. Check current domain status.
2. If none, show the setup dialog — you complete DNS once, and every subsequent alert flows automatically.
3. Scaffold **app (transactional)** email templates — one branded `portfolio-risk-alert` template with sections for the 5 trigger types.

No third-party service, no API keys to paste.

## 2. New database tables

```text
portfolio_watch          — one row per (user, ticker) with entry price, peak, thresholds,
                           last_analysis_at, last_price, last_alert_at per trigger type
risk_alerts              — append-only log of every fired alert (type, ticker, payload,
                           email_status) for audit + in-UI history
alert_preferences        — per-user email on/off, drawdown %, cooldown minutes
```
All RLS-scoped to `auth.uid()`, service_role full access for the cron worker.

## 3. Portfolio sentinel edge function

`portfolio-sentinel` (scheduled every 15 min via pg_cron, but each holding only *re-analyzes* every 4h unless a >3% move is detected):

For every active watch row:
1. Fetch latest quote (market-data).
2. **Fast triggers** (every run, cheap):
   - Drawdown vs entry (default -8%, user-configurable)
   - Drawdown vs peak (trailing -12%)
   - Max-profit ceiling hit (uses the same `computeMaxProfitFromAnalysis` logic already in `useSellNotifications`, moved server-side)
   - Corporate actions: detect stock split / large gap (>25% overnight, Yahoo `splitFactor`) → alert with "verify — likely split/dividend, not loss"
3. **Slow triggers** (every 4h OR after >3% intraday move):
   - Re-run `direct-profit` for a fresh consensus verdict
   - Compare to stored `last_verdict`; if flip BUY→SELL with conviction ≥2/3, fire alert
   - Update `last_analysis_at`
4. **Staleness**: if `last_analysis_at` > 24h, fire nag alert + trigger refresh.
5. Per-trigger cooldown (default 4h) to prevent spam.
6. Enqueue email via `send-transactional-email` with idempotency key `alert-{ticker}-{type}-{bucket}`.

## 4. Cron

`pg_cron` job every 15 min → `portfolio-sentinel`. Uses queue infrastructure from `setup_email_infra`, so retries + DLQ are free.

## 5. UI additions (minimal)

- **Alert Center** panel in Augment dashboard: list of `risk_alerts` (dismissible, filter by ticker).
- **Portfolio Panel**: small bell icon per holding → opens threshold sheet (custom drawdown %, mute).
- **Header**: unread alert count badge.

## 6. What's explicitly out of scope

- SMS/push (email only, per your answer).
- Auto-executing sells (alerts only — you decide the trade).
- Backfilling alerts for positions added before this feature.

## Technical notes

- Corporate actions use Yahoo Finance `events` field on the chart endpoint + a heuristic (>25% overnight w/ no news = probable split).
- Consensus flip uses the existing `ensemble.ts` gate; no new math.
- Cost: ~15 quote calls/user/hour + 6 full re-analyses/day/holding — well within existing rate budget.
- Test with: `bunx vitest run` + `curl_edge_functions` against `portfolio-sentinel`.

Approve to build. I'll start with steps 1 (domain check) and 2 (migration) in parallel, then wire the sentinel and templates.