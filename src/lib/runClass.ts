/**
 * plan 053 — board run-class (exam coverage) SSOT for dashboard presentation.
 *
 * Coverage: FULL | PARTIAL | EMPTY (| FROZEN feed-level).
 * OWED is orthogonal (badge + incomplete section), not a coverage peer.
 * Rankable = FULL ∧ owed∈{null,0} ∧ ¬frozen.
 */

export type CoverageClass = 'FULL' | 'PARTIAL' | 'EMPTY' | 'FROZEN'
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
}): CoverageClass {
  if (opts.frozen) return 'FROZEN'
  const n = opts.nGraded
  if (n <= 0) return 'EMPTY'
  if (n < opts.comparableMin) return 'PARTIAL'
  return 'FULL'
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
  if (opts.coverage === 'EMPTY' || opts.coverage === 'FROZEN') return 'hide'
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
  opts: { comparableMin: number; nExam: number },
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

  let coverage: CoverageClass
  if (frozen) {
    coverage = 'FROZEN'
  } else if (c.comparable === false) {
    coverage = n <= 0 ? 'EMPTY' : 'PARTIAL'
  } else if (c.comparable === true) {
    // Backend asserts full coverage; still report EMPTY if n==0
    coverage = n <= 0 ? 'EMPTY' : 'FULL'
  } else {
    coverage = coverageClass({
      nGraded: n,
      comparableMin: opts.comparableMin,
      frozen: false,
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
