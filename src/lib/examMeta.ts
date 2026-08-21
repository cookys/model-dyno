/**
 * plan 053 — durable exam-size SSOT for board views.
 *
 * Prefer fields emitted by producers (competitiveness / scorecard / public feed):
 *   n_exam | current_exam_n_tasks | n_canon + comparable_min
 *
 * Do NOT invent n_exam from max(cell.n) — that confuses a large partial with the
 * true exam size and drifts when the exam grows or shrinks.
 */

import { resolveDisplayFloor } from './runClass'

export type ExamMetaCarrier = {
  n_exam?: number | null
  n_canon?: number | null
  n_tasks?: number | null
  current_exam_n_tasks?: number | null
  comparable_min?: number | null
  /** Graded-task floor below which a cell is TRIVIAL and hidden. See runClass. */
  display_floor?: number | null
}

function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null
}

/**
 * Resolve { nExam, comparableMin, displayFloor } from an index / meta object.
 * `fallbackNExam` is only used when producers forgot both n_exam and n_canon
 * (should be rare after plan 053 emit); pass 0 to refuse inventing.
 */
export function resolveExamMeta(
  carrier: ExamMetaCarrier | null | undefined,
  opts: { fallbackNExam?: number } = {},
): { nExam: number; comparableMin: number; displayFloor: number } {
  const nExam =
    positiveInt(carrier?.n_exam)
    ?? positiveInt(carrier?.current_exam_n_tasks)
    ?? positiveInt(carrier?.n_canon)
    ?? positiveInt(carrier?.n_tasks)
    ?? positiveInt(opts.fallbackNExam)
    ?? 0

  const comparableMin =
    positiveInt(carrier?.comparable_min)
    ?? (nExam > 0 ? Math.max(1, Math.round(0.9 * nExam)) : 1)

  return {
    nExam: nExam || comparableMin,
    comparableMin,
    displayFloor: resolveDisplayFloor(carrier?.display_floor),
  }
}
