# Foresight — the EntropyLite operating layer

Foresight is the native intelligence layer of EntropyLite: an orchestrator
that understands analyst intent, routes it through the platform's existing
deterministic engines and edge functions, operates the interface, and
explains results in natural language.

**It is the orchestrator of truth.** Every quantitative statement must
originate from a deterministic EntropyLite engine or a cited data source.
The language model plans, coordinates, explains, and navigates — it never
substitutes for financial computation.

## Architecture

```
┌─ Browser ─────────────────────────────────────────────────────────┐
│  ForesightSurface (docked console: ledger, evidence, approvals)   │
│        │                                                          │
│  ForesightRuntime (src/foresight/runtime.ts)                      │
│   ├── ToolRegistry ──── client tools ──► src/lib/* engines        │
│   │                 ──── UI tools ─────► uiBus ► React components │
│   │                 ──── server tools ─► governedInvoke ► edge fns│
│   ├── Confirmation gate (registry-declared, runtime-enforced)     │
│   ├── FactLedger (provenance) + numeric verification              │
│   ├── ForesightSession (entity slots, turn ledger)                │
│   └── Research memory (localStorage, LRU)                         │
│        │ decide / respond / verify                                │
└────────┼──────────────────────────────────────────────────────────┘
         ▼
  supabase/functions/foresight-plan  ──►  _shared/callAI.ts
  (planner / explainer / verifier roles)   (existing Mistral lanes)
```

Zero new infrastructure: one edge function on the existing Supabase project,
speaking to the AI lanes that already power the rest of the platform.

### One turn

1. **Decide** — `foresight-plan` (role `decide`) receives the utterance, the
   generated tool manifest, compact session context, live UI targets, and the
   holdings digest. It returns either a direct answer, one clarifying
   question, or a **plan graph**: nodes `{id, tool, params, after, reason}`
   with `{"$ref": "n1.path"}` data-flow references. Multi-task utterances
   become multiple goals covered by independent branches of one graph.
2. **Execute** — the runtime (application code, deterministic) validates
   every node's params against the registry schema, topologically executes
   the graph with independent nodes in parallel, resolves `$ref`s, streams
   each step to the surface, and records `FactRecord`s that tools emit.
3. **Verify** — a deterministic numeric scan rejects any figure in the
   answer that does not trace to the fact ledger (rounding-tolerant,
   percent/fraction aware). Multi-step runs additionally get an LLM audit
   (role `verify`). Failed nodes trigger at most two repair replans.
4. **Respond** — the explainer (role `respond`) writes prose **only from the
   fact ledger**, selects evidence highlights, and the runtime persists a
   research finding.

### Confirmation gate

Tools declare `permission: "read" | "confirm"` in the registry. `confirm`
tools **never execute inside the loop** — `runtime.executeNode` stages a
`PendingAction` bound to `(tool, validated params, nonce)` and surfaces an
approval card. Only `confirmPending(nonce)` — a user click — executes it.
The planner cannot bypass this: the check reads the registry, not the plan.
Registration of a `confirm` tool without a `confirmationPreview` throws.

### Tool registry

`src/foresight/registry.ts`. Tools self-register at import time
(`src/foresight/tools/index.ts` is the switchboard). Each declares name,
description, category, parameter schema (`src/foresight/schema.ts` —
validation + manifest generation from one declaration), permission, and an
`execute` that wraps an **existing** engine or edge function. The planner
manifest is generated from whatever registered — adding a capability is one
`registerTool` call, no prompt edits, no workflow wiring.

Catalog (v1): `symbol.resolve`, `market.{quote,history,overview,fx}`,
`news.{fetch,sentiment}`, `portfolio.{snapshot,performance,risk,stress_test,optimize,what_changed}`,
`compare.assets`, `intel.{analyze_stock,company,macro,geopolitical,causal_effects,monte_carlo,portfolio,brief,filings}`,
`discover.assets`, `knowledge.query`, `memory.{search,recent,note}`,
`ui.{navigate,open_module,focus_position,highlight,workbench_pin,workbench_clear}`,
and confirm-gated `state.{add_position,update_position,close_position,watch_ticker,unwatch_ticker,set_alert_prefs,forget_research}`.

### UI operating layer

`src/foresight/uiBus.ts` is the typed control plane. Components own their
state transitions and subscribe to events (`Index.tsx`: navigate/focus;
`AugmentDashboard`: open_module). Every `PanelWrapper` self-registers a
highlight target (`panel.<title-slug>`), so the whole terminal is
addressable by `ui.highlight`; `Spotlight.tsx` renders a restrained focus
frame with a caption. `ui.workbench_pin` composes a temporary workspace of
structured result cards inside the surface.

Surface entry points: **⌘J**, the Foresight header button, and the ⌘K
command palette.

### Provenance & trust

- Engines already emit `MetricValue` (value + source + calculation + sample
  size + confidence). Tools map these into the fact ledger via
  `metricToFact`, so confidence grades and assumptions ride through to the
  answer and the Evidence disclosure.
- The explainer prompt receives the ledger as its only source of numbers;
  the deterministic scan then flags any unsupported figure in the UI
  ("Unverified figures: …").
- Failures are reported as failures; optimizers that don't converge return
  "no allocation asserted", never a silent fallback.

### Performance & cost

- All server tools route through `governedInvoke` — existing TTL tiers,
  inflight dedup, and AI cooldowns apply; cached steps are labeled.
- Client analytics run in-browser on already-fetched history.
- Independent graph nodes run in `Promise.all`; the surface streams steps —
  the terminal never blocks.
- Planner calls reuse the existing Mistral key rotation; the verifier uses
  the small model.

## Extending

1. Create/extend a module under `src/foresight/tools/` and call
   `registerTool` — schema + description are the planner's entire interface.
2. State-changing? Set `permission: "confirm"` and write an exact
   `confirmationPreview`. The gate does the rest.
3. New UI capability? Add an event to `UIBusEvents`, subscribe in the owning
   component, expose a `ui.*` tool.
4. Add a test in `src/foresight/foresight.test.ts` for anything touching
   validation, gating, or provenance.
