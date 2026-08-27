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
