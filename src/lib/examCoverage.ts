/**
 * Exam spec (n_exam) vs receipt (n_graded) — drives ExamCoverageChip.
 */
export type ExamCoverageKind = 'full' | 'owed' | 'thin'

export interface ExamCoverageState {
  kind: ExamCoverageKind
  nGraded: number
  nExam: number
  owed: number
}

export function examCoverageState(
  nGraded: number | null | undefined,
  nExam: number | null | undefined,
  owed: number | null | undefined,
  comparableMin = 30,
): ExamCoverageState | null {
  const graded = nGraded ?? 0
  const exam = nExam ?? 0
  if (exam <= 0) return null
  const gap = owed ?? Math.max(0, exam - graded)
  if (graded >= exam) {
    return { kind: 'full', nGraded: graded, nExam: exam, owed: 0 }
  }
  if (graded < comparableMin) {
    return { kind: 'thin', nGraded: graded, nExam: exam, owed: gap }
  }
  return { kind: 'owed', nGraded: graded, nExam: exam, owed: gap }
}

/** Chip visible only when receipt ≠ exam spec (and not full). */
export function showExamCoverageChip(state: ExamCoverageState | null): boolean {
  return state != null && state.kind !== 'full'
}
