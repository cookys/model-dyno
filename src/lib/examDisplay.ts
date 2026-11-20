import type { ExamVersionInfo } from '@/lib/store'

/** Compact exam alias, e.g. SWE34 from n_tasks or "34t-…" version id. */
export function examAlias(
  nTasks: number | null | undefined,
  version?: string | null,
): string | null {
  if (nTasks != null && nTasks > 0) return `SWE${nTasks}`
  const m = version?.match(/(\d+)t-/i)
  if (m) return `SWE${m[1]}`
  return version ? 'SWE' : null
}

/** Public-subset size for an exam scope: largest graded count among its partial cells. */
export function subsetDenomForExam(
  cells: readonly { n_graded?: number | null; comparable?: boolean | null }[],
): number {
  let max = 0
  for (const c of cells) {
    if (c.comparable === true) continue
    const n = c.n_graded ?? 0
    if (n > max) max = n
  }
  return max
}

/** Visible badge for a non-full-exam (subset) receipt, e.g. 子集(25/26 題). */
export function subsetCoverageLabel(
  nGraded: number | null | undefined,
  denom: number,
  zh: boolean,
): string | null {
  const n = nGraded ?? 0
  if (denom <= 0 || n <= 0) return null
  return zh ? `子集(${n}/${denom} 題)` : `subset (${n}/${denom})`
}

/** Semver tail from producer label, e.g. "cookys-frontier v1.1.1" → "v1.1.1". */
export function examSemver(label: string | null | undefined): string | null {
  if (!label) return null
  const m = label.match(/v\d+(?:\.\d+)*/i)
  return m ? m[0] : null
}

export function examTooltip(
  meta: ExamVersionInfo | null,
  version: string | null | undefined,
  zh: boolean,
): string {
  if (meta) {
    const parts = [
      meta.label,
      meta.name,
      version,
      meta.n_tasks != null ? `${meta.n_tasks} ${zh ? '題' : 'tasks'}` : null,
      meta.date,
    ].filter(Boolean)
    return parts.join(' · ')
  }
  return version ?? ''
}
