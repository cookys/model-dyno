// Named views for the /swe/comp board.
//
// The board is the landing page, and a reader arrives with one of three questions:
// which model solves the tasks, is that number credible, and what does it cost in time.
// Answering the second and third used to mean leaving for /swe/scorecard,
// /speed/efficiency or /speed/cloud. A preset re-columns THIS table instead — same
// rows, same folding, same comp cells, a different set of columns over them.
//
// Deliberately NOT a column picker: a design review rejected one merged board with
// user-configurable columns (fifteen columns plus a picker reads worse for every kind
// of reader and triples the i18n surface). Three fixed sets, named, and that is all.
// The rationale lives in docs/comp-named-views.md.
//
// The key sequences below are the contract — `tests/comp-presets.test.mjs` asserts them
// verbatim, and `overview` must stay equal to the board's historical column list so the
// landing page does not change on load.

export const COMP_PRESET_IDS = ['overview', 'scorecard', 'throughput'] as const

export type CompPresetId = (typeof COMP_PRESET_IDS)[number]

export const COMP_PRESETS: Record<CompPresetId, readonly string[]> = {
  // What the board has always shown. Changing this changes the landing page.
  overview: ['publisher', 'model', 'operator', 'harness', 'machine', 'n', 'eff', 'secSolved', 'usage', 'agency'],
  // Credibility lens: did it run the whole exam, and is the number the model or the harness.
  scorecard: ['publisher', 'model', 'operator', 'machine', 'n', 'coverage', 'eff', 'agency', 'usage'],
  // Cost lens: what the accuracy costs in wall time and tokens.
  throughput: ['publisher', 'model', 'operator', 'machine', 'eff', 'secSolved', 'perHour', 'tokS', 'medWall'],
}

export const DEFAULT_COMP_PRESET: CompPresetId = 'overview'

/**
 * `?view=` → preset id. Anything unrecognized — absent, empty, a typo, an array from a
 * repeated query param — resolves to the default rather than erroring or blanking the
 * board, because this route is reachable from links pasted anywhere.
 */
export function resolveCompPreset(raw: unknown): CompPresetId {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return DEFAULT_COMP_PRESET
  const key = value.trim().toLowerCase()
  return (COMP_PRESET_IDS as readonly string[]).includes(key)
    ? (key as CompPresetId)
    : DEFAULT_COMP_PRESET
}

/** Order a board's column pool by the preset, dropping anything the preset omits. */
export function applyCompPreset<T extends { key: string }>(
  columns: readonly T[],
  preset: CompPresetId,
): T[] {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const out: T[] = []
  for (const key of COMP_PRESETS[preset]) {
    const col = byKey.get(key)
    if (col) out.push(col)
  }
  return out
}
