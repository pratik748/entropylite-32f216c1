

# CLANK Historical Learning Loop

## Overview
Add a database-backed learning system that records constraint activation events and uses historical outcomes to dynamically adjust confidence scores. This creates a feedback loop where CLANK gets smarter over time.

## Database Changes

**New table: `clank_activation_events`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL) — for RLS
- `constraint_id` (text) — matches registry ID
- `activated_at` (timestamptz, default now())
- `clank_score_at_activation` (numeric) — snapshot of overall score
- `activation_probability` (numeric) — probability when recorded
- `observed_price_impact` (numeric, nullable) — % move after event
- `observed_volume_impact` (numeric, nullable) — $B forced volume
- `observed_vol_change` (numeric, nullable) — vol points change
- `outcome_accuracy` (numeric, nullable) — 0-1, how accurate the prediction was
- `notes` (text, nullable)

RLS: users can CRUD their own rows only.

**New table: `clank_confidence_overrides`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `constraint_id` (text, NOT NULL)
- `adjusted_confidence` (numeric) — learned confidence score
- `sample_count` (integer, default 0)
- `last_updated` (timestamptz, default now())
- UNIQUE(user_id, constraint_id)

RLS: users can CRUD their own rows only.

## New Hook: `useClankLearning`

- Fetches `clank_confidence_overrides` for the logged-in user on mount
- Provides `recordActivation(constraintId, clankScore, probability)` — inserts event row
- Provides `recordOutcome(eventId, priceImpact, volumeImpact, volChange)` — updates event, recalculates confidence override using weighted average of historical accuracy
- Provides `getAdjustedConfidence(constraintId)` — returns override or default
- Confidence update formula: `newConf = (oldConf * (n-1) + observedAccuracy) / n`

## Changes to `clank-engine.ts`

- `evaluateConstraints` gains an optional `confidenceOverrides: Record<string, number>` parameter
- When present, overrides the static `confidenceScore` from the registry with the learned value

## Changes to `ClankEngine.tsx`

- Wire `useClankLearning` hook
- Pass adjusted confidences into `evaluateConstraints`
- Add a "Learning" tab/section showing:
  - Activation history table (date, constraint, predicted vs observed impact, accuracy)
  - Per-constraint learned confidence vs default confidence comparison
  - A "Record Activation" button on each constraint card (when status is "approaching" or "critical")
  - An "Update Outcome" form on recorded events to enter observed results
  - Event count and learning progress indicator

## UI Design
- Compact mobile-friendly table for history
- Badge showing sample count per constraint
- Color-coded accuracy (green >0.7, yellow 0.4-0.7, red <0.4)

