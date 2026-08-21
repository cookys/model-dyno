/**
 * plan 053 — board run-class (exam coverage) SSOT for dashboard presentation.
 *
 * Coverage: FULL | PARTIAL | EMPTY (| FROZEN feed-level | TRIVIAL below the floor).
 * OWED is orthogonal (badge + incomplete section), not a coverage peer.
 * Rankable = FULL ∧ owed∈{null,0} ∧ ¬frozen.
 *
 * TRIVIAL — a run with so few graded tasks that it carries no signal at all
 * (bake-off smoke runs, aborted starts). It is NOT "a small partial": a partial
 * is an incomplete attempt at the exam worth showing as incomplete, whereas a
 * 3-of-34 row only adds noise to the incomplete section. Hidden, not ranked.
 *
 * The floor is a CURATION threshold, not a statistical cliff — there is no n at
 * which noise suddenly becomes signal. `DEFAULT_DISPLAY_FLOOR` is where the
 * board draws the line; producers override it by stamping `display_floor` in
 * feed meta (plan 053: producers stamp, UI reads), so it can be retuned without
 * a frontend deploy. Raising it hides more rows; setting it to 0 disables the
 * class entirely and restores pre-floor behaviour.
 */

export type CoverageClass = 'FULL' | 'PARTIAL' | 'EMPTY' | 'FROZEN' | 'TRIVIAL'

/**
 * Below 6 graded tasks a cell cannot separate itself from any other cell: at
 * n=3 even a perfect score has a Wilson lower bound near chance. Chosen against
 * the 2026-08 board, where it hides 18 rows (13 bake-off smoke runs + 5 aborted
 * starts) and leaves every full-scale run — including the 34-task cells that
 * also happen to live under `bake-off-*` profile names — untouched.
 */
export const DEFAULT_DISPLAY_FLOOR = 6
export type BoardSection = 'main' | 'incomplete' | 'hide'

export type RunClassCarrier = {
  n?: number | null
  n_graded?: number | null
  comparable?: boolean | null
  owed?: number | null
  frozen?: boolean | null
  n_exam?: number | null
  n_canon?: number | null
}

export function coverageClass(opts: {
  nGraded: number
  comparableMin: number
  frozen?: boolean
  displayFloor?: number | null
}): CoverageClass {
  if (opts.frozen) return 'FROZEN'
  const n = opts.nGraded
  if (n <= 0) return 'EMPTY'
  if (n < effectiveFloor(opts.displayFloor, opts.comparableMin)) return 'TRIVIAL'
  if (n < opts.comparableMin) return 'PARTIAL'
  return 'FULL'
}

/** `null`/absent means "producer did not stamp one" → default. 0 disables. */
export function resolveDisplayFloor(v: number | null | undefined): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)
  return DEFAULT_DISPLAY_FLOOR
}

/**
 * The floor is meaningless above the comparability threshold: at or above
 * `comparableMin` a cell is FULL by definition, so TRIVIAL must never be able to
 * swallow it. Clamping also keeps small exams working — a 1-task toy bench has
 * comparableMin=1, where an unclamped floor of 6 would hide every possible run.
 */
function effectiveFloor(displayFloor: number | null | undefined, comparableMin: number): number {
  const floor = resolveDisplayFloor(displayFloor)
  const cap = Number.isFinite(comparableMin) && comparableMin > 0 ? comparableMin : floor
  return Math.min(floor, cap)
}

export function isRankable(opts: {
  coverage: CoverageClass
  owed?: number | null
}): boolean {
  if (opts.coverage !== 'FULL') return false
  if (opts.owed != null && opts.owed > 0) return false
  return true
}

export function boardSection(opts: {
  coverage: CoverageClass
  owed?: number | null
}): BoardSection {
  if (opts.coverage === 'EMPTY' || opts.coverage === 'FROZEN' || opts.coverage === 'TRIVIAL') return 'hide'
  if (isRankable(opts)) return 'main'
  return 'incomplete'
}

/** Graded count from COMP (n) or scorecard (n_graded). */
export function gradedN(c: RunClassCarrier): number {
  const n = c.n ?? c.n_graded
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

export function examN(c: RunClassCarrier, fallback: number): number {
  const e = c.n_exam ?? c.n_canon
  if (typeof e === 'number' && Number.isFinite(e) && e > 0) return e
  return fallback
}

/**
 * Prefer backend comparable when set; else derive from n vs comparableMin.
 * owed>0 always demotes out of rankable (current-exam boards).
 */
export function classifyCell(
  c: RunClassCarrier,
  opts: { comparableMin: number; nExam: number; displayFloor?: number | null },
): {
  coverage: CoverageClass
  rankable: boolean
  section: BoardSection
  n: number
  nExam: number
  owed: number | null
} {
  const n = gradedN(c)
  const nExam = examN(c, opts.nExam)
  const owed = typeof c.owed === 'number' && c.owed > 0 ? c.owed : null
  const frozen = !!c.frozen

  const floor = effectiveFloor(opts.displayFloor, opts.comparableMin)

  let coverage: CoverageClass
  if (frozen) {
    coverage = 'FROZEN'
  } else if (n <= 0) {
    coverage = 'EMPTY'
  } else if (n < floor) {
    // Ahead of the backend `comparable` override on purpose: every smoke run
    // already carries comparable=false, so checking that first would classify
    // these as PARTIAL and the floor would silently do nothing.
    coverage = 'TRIVIAL'
  } else if (c.comparable === false) {
    coverage = 'PARTIAL'
  } else if (c.comparable === true) {
    coverage = 'FULL'
  } else {
    coverage = coverageClass({
      nGraded: n,
      comparableMin: opts.comparableMin,
      frozen: false,
      displayFloor: floor,
    })
  }

  const rankable = isRankable({ coverage, owed })
  const section = boardSection({ coverage, owed })
  return { coverage, rankable, section, n, nExam, owed }
}

export function partitionBySection<T>(
  rows: readonly T[],
  sectionOf: (row: T) => BoardSection,
): { main: T[]; incomplete: T[] } {
  const main: T[] = []
  const incomplete: T[] = []
  for (const row of rows) {
    const s = sectionOf(row)
    if (s === 'main') main.push(row)
    else if (s === 'incomplete') incomplete.push(row)
    // hide: drop
  }
  return { main, incomplete }
}
