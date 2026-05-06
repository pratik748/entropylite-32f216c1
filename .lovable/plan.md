# Faster sign-in + remove visible Lovable branding

Two separate problems, fixed together.

---

## Part 1 — Why login feels slow, and what we'll change

Today's flow on `/dashboard`:

```text
1. AuthGate mounts
2. getSession() round-trip   ──► waits before showing anything
3. User sees AuthPage, clicks "Continue with Google"
4. Broker call to oauth.lovable.app  (cold, ~300–800ms)
5. Redirect to Google consent
6. Redirect back to /dashboard
7. AuthGate re-mounts → getSession() AGAIN
8. Finally Index renders
```

The visible "spinning forever" comes mostly from steps 2, 4 and 7. Fixes:

1. **Optimistic AuthGate** — render the auth UI immediately, only show the loading splash for the brief moment after a known redirect (when URL has `code=` / `#access_token`). Right now every cold visit waits on `getSession()` even when there is no session.
2. **Cache the session locally** — read `localStorage` for an existing Supabase session synchronously on first paint, so returning users skip the splash entirely. `onAuthStateChange` then reconciles in the background.
3. **Preconnect to OAuth + Supabase hosts** — add `<link rel="preconnect">` and `<link rel="dns-prefetch">` in `index.html` for the OAuth broker host and the Supabase project host, so the TLS handshake is warm before the user clicks the button.
4. **Disable button immediately, no second await** — the OAuth handler already redirects; remove the `setLoading(null)` after the redirect path so the spinner stays until the browser actually navigates (prevents the "I clicked but nothing happened" feel).
5. **Drop the logo preload-then-decode chain on AuthPage** — load the logo with `fetchpriority="high"` and `decoding="async"` so the page is interactive before the image finishes.

Expected result: returning users land on `/dashboard` with no splash; new sign-ins shave roughly 300–600 ms off the click→Google redirect.

> Note: the actual OAuth round-trip through Google is outside our control. We can only remove the local overhead before and after.

---

## Part 2 — Remove every visible "Lovable" / "gpt-engineer" trace

Audit found these public leaks:

| Where | What leaks | Fix |
|---|---|---|
| `src/components/Header.tsx` (logo `<img src>`) | `/lovable-uploads/9357bd58-...jpg` | Move the logo file to `public/brand/entropy-mark.jpg` and update the two `<img src>`s. |
| `index.html` `og:image` + `twitter:image` | `storage.googleapis.com/gpt-engineer-file-uploads/...` | Re-host the social card under `public/brand/social-card.webp` and point both meta tags to `https://entropylite.in/brand/social-card.webp`. |
| `src/index.css` line 591 | `#lovable-badge { display:none }` selector | Rename selector to a neutral `#edit-badge` (kept as defensive hide; the badge is already disabled via publish settings). |
| Other `/lovable-uploads/...` references project-wide | Any image still served from that path | Sweep the codebase, copy each referenced asset into `public/brand/` (or `src/assets/`) and rewrite the paths. |
| Built JS bundle | `@lovable.dev/cloud-auth-js` import string | Cannot be removed without breaking managed OAuth. **Acceptable** — it only appears inside minified JS, not in any user-facing URL or UI. |
| Network tab during sign-in | Request to `oauth.lovable.app` | Inherent to managed Google OAuth. Flagged below as a trade-off. |

### One real trade-off to decide

The managed OAuth broker call to `oauth.lovable.app` is visible to anyone who opens DevTools → Network during sign-in. Two options:

- **Keep managed OAuth** (recommended): faster to ship, no Google Cloud setup, branding leak is only visible to people inspecting network traffic.
- **Switch to bring-your-own Google OAuth**: requires creating a Google Cloud OAuth client and pasting client ID/secret into Cloud → Auth → Google. Network requests then go to `*.supabase.co` instead of `oauth.lovable.app`. Still not your own domain, but no "lovable" string.

I'll proceed with managed OAuth unless you say otherwise — switching later is a 5-minute config change, no code rewrite.

---

## Files I will touch

- `src/App.tsx` — optimistic AuthGate, synchronous session bootstrap
- `src/pages/AuthPage.tsx` — remove premature `setLoading(null)`, image priority hints
- `index.html` — preconnect/dns-prefetch hints, swap social-image URLs
- `src/components/Header.tsx` — swap logo src to neutral path
- `src/index.css` — rename badge selector
- `public/brand/` (new folder) — host logo + social card under our own domain
- Sweep + rewrite any other `/lovable-uploads/...` references found

No database, edge function, or auth-provider changes required.
