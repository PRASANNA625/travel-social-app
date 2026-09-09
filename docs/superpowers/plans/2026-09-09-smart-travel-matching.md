# Smart Travel Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add age proximity as a new secondary scoring signal to Travel Buddies matching, so closer-in-age candidates rank higher when real shared-interest/mode signal already exists — without ever fabricating a match from age alone.

**Architecture:** A single, focused change to the existing `getBuddyMatches()` scoring function in `backend/src/modules/buddies/buddies.service.ts` — add `age` to the viewer's Prisma `select`, compute a tiered age-proximity bonus per candidate (candidates already carry `age` via the existing `publicUserSelect`), and fold it into the existing `rawScore` calculation. The `hasStrongSignal` gate that decides whether `compatibilityPercent` is a number or `null` is left completely unchanged.

**Tech Stack:** Express + Prisma (backend only — no mobile changes in this feature). Backend testing follows this repo's only convention: a plain-Node black-box smoke-test script, extending the existing `backend/scripts/smoke-test-buddies.mjs` — no test framework.

**Spec:** [docs/superpowers/specs/2026-09-09-smart-travel-matching-design.md](../specs/2026-09-09-smart-travel-matching-design.md)

**Branch note:** `backend/src/modules/buddies/buddies.service.ts` and `backend/scripts/smoke-test-buddies.mjs` only exist on the `travel-buddies` branch (PR #1 is still open, not yet merged to `master`). This plan's worktree must branch from `travel-buddies`, not `master`.

## Global Constraints

- No new npm dependencies.
- No new API response fields — `age` was already selectable via `publicUserSelect` but unused in scoring; it does not become newly exposed by this change.
- No UI/mobile changes whatsoever — this plan touches `backend/` only.
- `hasStrongSignal` (`sharedInterests.length > 0 || sharedModesCount > 0`) must remain the sole gate for whether `compatibilityPercent` is a number vs. `null` — age proximity must never unlock a compatibility % on its own.
- Age bonus tiers: age difference ≤ 1 year → +10; 2–5 years → +5; > 5 years or either user's age unset → +0.
- Follow the existing black-box smoke-test convention (plain ESM + `fetch`, homegrown `assert()` helper, run against a live dev server) — no Jest/Vitest/supertest.

---

### Task 1: Add age-proximity scoring to `getBuddyMatches`

**Files:**
- Modify: `backend/src/modules/buddies/buddies.service.ts`
- Modify: `backend/scripts/smoke-test-buddies.mjs`

**Interfaces:**
- Consumes: `prisma` (`../../config/prisma`, already imported in this file), `publicUserSelect` (`../users/users.service`, already imported — already includes `age`), the existing `getBuddyMatches(viewerId, filters)` function this task modifies in place.
- Produces: no new exported names — `getBuddyMatches`'s existing signature, return shape (`{ items, total, page, pageSize }`), and every existing field on each item are unchanged. The only observable difference is that `compatibilityPercent`'s numeric value may be slightly higher when the viewer and a candidate are close in age AND already share a real interest/mode signal.

- [ ] **Step 1: Add `age` to the viewer's select**

Open `backend/src/modules/buddies/buddies.service.ts`. Find this block inside `getBuddyMatches`:

```ts
  const viewer = await prisma.user.findUniqueOrThrow({
    where: { id: viewerId },
    select: { interests: true, preferredModes: true, location: true },
  });
```

Change it to:

```ts
  const viewer = await prisma.user.findUniqueOrThrow({
    where: { id: viewerId },
    select: { interests: true, preferredModes: true, location: true, age: true },
  });
```

- [ ] **Step 2: Add an `ageBonus` helper function**

Add this directly above the existing `function overlapCount<T>(a: T[], b: T[]): number {` function:

```ts
function ageProximityBonus(ageA: number | null, ageB: number | null): number {
  if (ageA === null || ageB === null) return 0;
  const diff = Math.abs(ageA - ageB);
  if (diff <= 1) return 10;
  if (diff <= 5) return 5;
  return 0;
}
```

- [ ] **Step 3: Fold the bonus into `rawScore`**

Find the scoring block inside the `candidates.map((c) => {...})` callback:

```ts
    const rawScore =
      sharedInterests.length * 15 +
      sharedModesCount * 10 +
      (locationMatch ? 15 : 0) +
      Math.min(sharedTripModes, 3) * 10 +
      Math.min(sharedDestinations, 3) * 10;
```

Change it to:

```ts
    const ageBonus = ageProximityBonus(viewer.age, c.age);

    const rawScore =
      sharedInterests.length * 15 +
      sharedModesCount * 10 +
      (locationMatch ? 15 : 0) +
      Math.min(sharedTripModes, 3) * 10 +
      Math.min(sharedDestinations, 3) * 10 +
      ageBonus;
```

Do not touch the `hasStrongSignal` line directly below it — it must remain exactly:

```ts
    const hasStrongSignal = sharedInterests.length > 0 || sharedModesCount > 0;
```

This is the gate that keeps age from ever unlocking a compatibility % on its own — `ageBonus` only ever adds to `rawScore`, and `rawScore` is only surfaced as `compatibilityPercent` when `hasStrongSignal` is already true from real interest/mode overlap.

- [ ] **Step 4: Extend the smoke test — closer age scores higher (with real shared signal)**

Open `backend/scripts/smoke-test-buddies.mjs`. Add this new scenario directly after the existing `// --- Zero-signal candidate: no percentage, text fallback only ---` block (which ends with `console.log("✓ zero-signal candidates get compatibilityPercent: null instead of a fabricated score");`), and before the `// --- Connect flow: ... ---` block:

```js
  // --- Age proximity: closer age should score higher than a large age gap, all else equal ---
  const agePivot = await registerUser("age-pivot-buddies");
  const closeAge = await registerUser("close-age-buddies");
  const farAge = await registerUser("far-age-buddies");

  await requestOk("PATCH", "/users/me", {
    token: agePivot.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 30 },
  });
  await requestOk("PATCH", "/users/me", {
    token: closeAge.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 30 },
  });
  await requestOk("PATCH", "/users/me", {
    token: farAge.token,
    body: { interests: ["Photography"], preferredModes: ["TREK"], age: 55 },
  });

  const agePivotMatches = await requestOk("GET", "/buddies/matches", { token: agePivot.token });
  const closeAgeMatch = agePivotMatches.items.find((m) => m.id === closeAge.user.id);
  const farAgeMatch = agePivotMatches.items.find((m) => m.id === farAge.user.id);
  assert(!!closeAgeMatch, "closeAge should appear in agePivot's matches given the shared interest/mode");
  assert(!!farAgeMatch, "farAge should appear in agePivot's matches given the shared interest/mode");
  assert(
    closeAgeMatch.compatibilityPercent > farAgeMatch.compatibilityPercent,
    `same shared interest/mode, but a 0-year age gap should score higher than a 25-year gap: got ${closeAgeMatch.compatibilityPercent} vs ${farAgeMatch.compatibilityPercent}`
  );
  console.log("✓ age proximity boosts compatibility score when real shared-interest/mode signal already exists");
```

- [ ] **Step 5: Extend the smoke test — age alone never unlocks a percentage**

Add this directly after the block from Step 4, still before the `// --- Connect flow: ... ---` block:

```js
  // --- Age alone (with zero shared interests/modes) must never unlock a compatibility % ---
  const ageOnlyViewer = await registerUser("age-only-viewer-buddies");
  const ageOnlyMatch = await registerUser("age-only-match-buddies");
  await requestOk("PATCH", "/users/me", { token: ageOnlyViewer.token, body: { age: 30 } });
  await requestOk("PATCH", "/users/me", { token: ageOnlyMatch.token, body: { age: 30 } });

  const ageOnlyMatches = await requestOk("GET", "/buddies/matches", { token: ageOnlyViewer.token });
  const ageOnlyResult = ageOnlyMatches.items.find((m) => m.id === ageOnlyMatch.user.id);
  if (ageOnlyResult) {
    assert(
      ageOnlyResult.compatibilityPercent === null,
      "two users with the same age but zero shared interests/modes must still get compatibilityPercent: null - age alone must never unlock a score"
    );
  }
  console.log("✓ age proximity alone (zero shared interests/modes) never unlocks a compatibility %");
```

(This assertion is wrapped in `if (ageOnlyResult)`, matching the existing "zero-signal candidate" scenario's own defensive pattern a few lines above — on a shared dev database, a same-age zero-signal stranger isn't guaranteed to land in the 150-candidate pool, so the test only asserts the invariant when the pair happens to be visible to each other, exactly like the pre-existing `strangerMatch` check does.)

- [ ] **Step 6: Run the smoke test against a live dev server**

In one terminal: `cd backend && npm run dev`
In another terminal: `cd backend && node scripts/smoke-test-buddies.mjs`

Expected: all `✓` lines print in order (including the two new ones), then `All Travel Buddies smoke tests passed.`, exit code 0. If it fails, read the assertion message.

- [ ] **Step 7: Typecheck and commit**

```bash
cd backend && npx tsc -p tsconfig.json --noEmit
git add backend/src/modules/buddies/buddies.service.ts backend/scripts/smoke-test-buddies.mjs
git commit -m "Add age proximity as a secondary matching signal"
```

---

## Post-implementation summary (for the final report to the user)

After this single task is complete and verified, report back to the user covering:
- The exact scoring change (tiered age-proximity bonus: ≤1yr → +10, 2-5yr → +5, >5yr or unset → +0, added to `rawScore`).
- Confirmation that `hasStrongSignal`/`compatibilityPercent`'s gating logic is byte-for-byte unchanged — age can never fabricate a match on its own, verified by the new smoke test assertion.
- Confirmation that no API shape, UI, or mobile code changed — this is a pure backend scoring refinement.
- A reminder that this branch stacks on top of the still-open `travel-buddies` branch (PR #1), so its own PR will need a rebase onto `master` once Travel Buddies merges, before it can merge too.
