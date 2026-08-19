# Spec — named views (presets) on the `/swe/comp` board

## Why

`/swe/comp` is the landing board. Today a reader who wants the credibility lens has to
leave for `/swe/scorecard`, and the speed lens lives on `/speed/efficiency` and
`/speed/cloud`. The board should offer those lenses in place.

A prior design review rejected the obvious alternative — one merged board with a column
picker. Fifteen columns plus a picker is worse for every kind of reader, triples the i18n
surface, and a single-maintainer static site cannot carry it. **A column picker is out of
scope and must not be built.** What ships instead is three fixed, named column sets over
the same table and the same data.

## The data is already there

Every field the presets need already exists on the comp cell, emitted by
`projectCompIndexFromScorecardRows` in `src/lib/publicBundle.ts`. No new data source, no
fetch, no change to `publicBundle.ts`:

- `coverage` ← `n` / `n_exam`
- `solved_per_hour`, `agentic_tok_s`, `med_wall`, `sec_per_solved`, `speed_credibility`,
  `agency`, `usage` — all present on the cell.

Map them in the existing row mapper (`mapCompRow` in `src/views/SweComp.vue`).

## The three presets

Exact column key sequences. Do not add, drop, or reorder.

- **overview** (default) — `publisher, model, operator, harness, machine, n, eff, secSolved, usage, agency`
- **scorecard** — `publisher, model, operator, machine, n, coverage, eff, agency, usage`
- **throughput** — `publisher, model, operator, machine, eff, secSolved, perHour, tokS, medWall`

`overview` MUST equal today's main-table column list exactly, so the landing page is
unchanged on load. New columns to add to the pool: `coverage`, `perHour`, `tokS`,
`medWall`.

In **throughput**, `secSolved` and `perHour` must carry the existing
`speedCredibilityBadge(...)` chip already imported in `SweComp.vue`. A speed number
without its credibility flag is exactly what this project's eval discipline forbids.

## Selection

- Route **query**, not a new path: `#/swe/comp?view=overview|scorecard|throughput`.
- **`src/router.ts` must not change.** No new route, no renamed path — existing hash URLs
  are pasted throughout the project's notes.
- Missing, empty, or unrecognized `view` ⇒ `overview`. Never error, never blank.
- Switching updates the query with `router.replace`, so the back button is not spammed.
- UI: a small segmented control above the table, following the repo's existing component
  and Tailwind idiom.

## Structure

A new `src/lib/compPresets.ts` exports the preset table as plain data:

```ts
export const COMP_PRESET_IDS = ['overview', 'scorecard', 'throughput'] as const
export type CompPresetId = (typeof COMP_PRESET_IDS)[number]
export const COMP_PRESETS: Record<CompPresetId, readonly string[]> = { /* ... */ }
export function resolveCompPreset(raw: unknown): CompPresetId  // unknown -> 'overview'
```

`SweComp.vue` filters its real column definitions through the active preset's key list and
renders them in that order. A preset table that exists but does not change the rendered
columns is a failed implementation.

## Must not break

- Fold behaviour (`useFoldSort`, `groupByCanonicalModel`, the variant sub-table,
  `foldCols`) is unchanged. The sub-table is **not** re-columned by presets.
- Model links (`modelPageHref`) keep working.
- `mobileHide` flags and the mobile card layout keep working in every preset.
- `/swe/scorecard`, `/speed/efficiency`, `/speed/cloud` stay routed and untouched. This
  adds a lens; it retires no board.
- i18n: every new user-visible string needs BOTH the `en` and `zh` entry in
  `src/lib/i18n.ts`. Only add keys; do not edit or remove existing ones.

## Tests

In `tests/comp-presets.test.mjs`, `node:test`, matching the source-reading style of the
existing `tests/*.test.mjs`:

1. `COMP_PRESETS.overview` equals the exact sequence above (landing-page no-change guarantee).
2. All three presets exist with exactly the sequences above.
3. `resolveCompPreset` maps `undefined`, `''`, and `'nonsense'` to `'overview'`.
4. `SweComp.vue` imports from `@/lib/compPresets` and filters its column list through it.
5. `src/router.ts` still declares `path: '/swe/comp'` and gains no new route.

No existing test may be weakened, skipped, or deleted.

## Verification

`npm test` fully green (existing 80 plus the new ones) and `npx vue-tsc -b` with no error.
