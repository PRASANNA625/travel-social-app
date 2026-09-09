# Triply — Step 4: Smart Travel Matching ❤️ — Design Spec

## Goal

Make Travel Buddies matching (Step 2) smarter by adding age proximity as a new scoring signal — closer ages score higher — without fabricating matches for users who share nothing real.

## Scope

This is a single, focused enhancement to the existing `getBuddyMatches()` scoring function. It adds one new signal (age proximity) to the existing formula (shared interests, shared travel modes, location text-match, shared past-trip modes/destinations). No new API fields, no new UI, no new endpoint, no new dependency.

**Branch note:** `buddies.service.ts` only exists on the still-open `travel-buddies` branch (PR #1), not yet on `master`. This work branches directly off `travel-buddies` rather than waiting for that PR to merge; its own PR will need a one-time rebase onto `master` once Travel Buddies lands.

## Current State (for reference)

`getBuddyMatches()` (`backend/src/modules/buddies/buddies.service.ts`) currently scores each candidate:

```ts
const rawScore =
  sharedInterests.length * 15 +
  sharedModesCount * 10 +
  (locationMatch ? 15 : 0) +
  Math.min(sharedTripModes, 3) * 10 +
  Math.min(sharedDestinations, 3) * 10;

const hasStrongSignal = sharedInterests.length > 0 || sharedModesCount > 0;

compatibilityPercent: hasStrongSignal ? Math.min(100, rawScore) : null,
```

`User.age` (`Int?`, nullable) already exists on the schema and is already part of `publicUserSelect` — every candidate object already carries `age`. Only the `viewer` lookup's `select` is missing it.

## Design

### Signal: age proximity

Add an `ageBonus` term to `rawScore`, computed from `Math.abs(viewer.age - candidate.age)`:

| Age difference | Bonus |
|---|---|
| ≤ 1 year | +10 |
| 2–5 years | +5 |
| > 5 years, or either user's age is unset | +0 |

This mirrors the existing formula's style exactly: plain tiered point values, not a continuous/decaying curve — consistent with `locationMatch`'s flat `+15`/`+0` and every other term in the formula.

### Gating stays unchanged

`hasStrongSignal` (which decides whether `compatibilityPercent` shows a real number vs. `null` + the "N shared interests" text fallback) is **not** changed to include age. It remains `sharedInterests.length > 0 || sharedModesCount > 0`. Age proximity is purely a secondary booster added to `rawScore` once real signal already exists — it can never, on its own, cause `compatibilityPercent` to be non-null. Two same-age strangers with zero shared interests/modes still get `compatibilityPercent: null`, preserving the "no fake/random matching scores" rule established in Step 2.

### Missing age handling

If either `viewer.age` or `candidate.age` is `null`/`undefined`, `ageBonus` is `0` — never penalizes, never fabricates, matches the existing pattern already used for `locationMatch` when either party's `location` is unset.

## Global Constraints

- No new npm dependencies.
- No new API response fields — `age` was already selectable but unused; it stays a `publicUserSelect` field, not newly exposed.
- No UI changes — `BuddyCard`, `TravelBuddiesScreen`, `ConnectionRequestsScreen` are untouched. The only observable change is that `compatibilityPercent`'s number may shift slightly (up) when interests/modes already overlap and ages are close.
- `compatibilityPercent` must remain `null` (never a fabricated number) whenever `hasStrongSignal` is false, exactly as today.
- Follow the existing black-box smoke-test convention for backend verification.

## Testing Plan

Extend `backend/scripts/smoke-test-buddies.mjs` (on the `travel-buddies` branch) with one new scenario: two users sharing an interest, with ages set close together (e.g. 1 year apart) vs. a third user sharing the same interest but with a large age gap (e.g. 20+ years) — assert the close-age candidate's `compatibilityPercent` is strictly higher than the large-age-gap candidate's, all else equal. Also assert a candidate with zero shared interests/modes but a very close age still gets `compatibilityPercent: null` (age alone never unlocks a score).

Typecheck (`tsc --noEmit`) on `backend` only — no mobile changes in this feature.
