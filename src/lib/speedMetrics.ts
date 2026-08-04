/**
 * plan 052 — pass-conditioned primary speed helpers (shared across COMP / scorecard / speed/*).
 *
 * Primary solve time: med_wall_pass (median wall among passed tasks).
 * Exam-cost s/✓:      sec_per_solved_all / sec_per_solved (= sum(all wall)/n_pass).
 * Pass throughput:    solved_per_hour_pass when present, else 3600/mean_wall_pass.
 */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type SpeedCarrier = {
  med_wall_pass?: number | null
  mean_wall_pass?: number | null
  sec_per_solved?: number | null
  sec_per_solved_all?: number | null
  solved_per_hour?: number | null
  solved_per_hour_all?: number | null
  solved_per_hour_pass?: number | null
  med_wall?: number | null
  speed_credibility?: { verdict?: string; flags?: string[] } | null
}

/** Primary UI solve time (seconds). Prefer pass median; never invent from exam-cost. */
export function medWallPassOf(c: SpeedCarrier): number | null {
  return num(c.med_wall_pass)
}

/**
 * Display primary: med_wall_pass when published; fall back to exam-cost only for
 * legacy cells (pre-052) so the board is not blank.
 */
export function primarySolveSecOf(c: SpeedCarrier): number | null {
  const m = medWallPassOf(c)
  if (m !== null) return m
  return examCostSecOf(c)
}

/** Exam-cost s/✓ = sum(all walls)/n_passed (includes fails). */
export function examCostSecOf(c: SpeedCarrier): number | null {
  return num(c.sec_per_solved_all ?? c.sec_per_solved)
}

/** Pass-conditioned throughput (solved/hour). */
export function solvedPerHourPassOf(c: SpeedCarrier): number | null {
  const direct = num(c.solved_per_hour_pass)
  if (direct !== null) return direct
  const mean = num(c.mean_wall_pass)
  if (mean !== null && mean > 0) return 3600 / mean
  return null
}

/**
 * Primary throughput for ranking/display: pass-conditioned when available,
 * else legacy exam-cost solved_per_hour (pre-052 cells).
 */
export function primarySolvedPerHourOf(c: SpeedCarrier): number | null {
  const p = solvedPerHourPassOf(c)
  if (p !== null) return p
  return num(c.solved_per_hour_all ?? c.solved_per_hour)
}

export function primarySolvedPerMinOf(c: SpeedCarrier): number | null {
  const h = primarySolvedPerHourOf(c)
  return h === null ? null : h / 60
}

export function hasPassSpeed(c: SpeedCarrier): boolean {
  return medWallPassOf(c) !== null
}
