/**
 * Exam version selection for Ranking / Pick-for-me boards.
 * Pure helpers — no Vue — so unit tests can exercise the defaulting rules.
 */

export type ExamVersionPick = {
  version: string
  current?: boolean
}

export type ExamPickCell = {
  canonical_version?: string | null
  comparable?: boolean | null
}

export function orderedExamVersions<T extends ExamVersionPick>(versions: T[]): T[] {
  if (!versions.length) return []
  const current = versions.find((v) => v.current)
  if (!current) return versions
  return [current, ...versions.filter((v) => v.version !== current.version)]
}

/**
 * Default exam for Ranking / Pick-for-me.
 * Explicit ?exam= wins. Otherwise prefer a version that still has full-exam
 * (comparable) rows — a newly marked current_exam that only carries subset
 * receipts must not empty the default ranking board.
 */
export function pickSelectedExam(
  query: string | null,
  versions: ExamVersionPick[],
  currentExam: string | null | undefined,
  cells?: readonly ExamPickCell[] | null,
): string | null {
  const candidate = query && query.trim() ? query.trim() : null
  if (candidate && versions.some((v) => v.version === candidate)) {
    return candidate
  }

  const versionSet = new Set(versions.map((v) => v.version))
  if (cells?.length) {
    const fullCounts = new Map<string, number>()
    for (const c of cells) {
      const v = c.canonical_version
      if (!v || !versionSet.has(v) || c.comparable !== true) continue
      fullCounts.set(v, (fullCounts.get(v) || 0) + 1)
    }
    if (fullCounts.size) {
      if (currentExam && fullCounts.has(currentExam)) return currentExam
      const marked = versions.find((v) => v.current && fullCounts.has(v.version))
      if (marked) return marked.version
      let best: string | null = null
      let bestN = -1
      for (const v of versions) {
        const n = fullCounts.get(v.version) || 0
        if (n > bestN) {
          best = v.version
          bestN = n
        }
      }
      if (best) return best
    }
  }

  const current = currentExam && versions.find((v) => v.version === currentExam)
    ? currentExam
    : versions.find((v) => v.current)?.version || null

  if (current) return current

  if (versions.length) return versions[0].version
  return null
}

export function isArchivedExam(selected: string | null, currentExam: string | null | undefined): boolean {
  if (!selected) return false
  if (!currentExam) return false
  return selected !== currentExam
}
