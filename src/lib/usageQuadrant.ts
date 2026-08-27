/**
 * Usage quadrant buckets — same thresholds as SweComp / usageOf (plan 052).
 * Pure classification; labels live in the Vue layer.
 */
import type { SweCell } from './store'

export type UsageBucket = 'allround' | 'pair' | 'background' | 'lowacc'

const USE_THRESH = { good: 0.50, top: 0.70, fastSec: 300 }

export function classifyUsageBucket(
  acc: number | null,
  medWallPassSec: number | null,
): UsageBucket | null {
  if (acc === null) return null
  const good = acc >= USE_THRESH.good
  const fast = medWallPassSec !== null && medWallPassSec < USE_THRESH.fastSec
  if (!good) return 'lowacc'
  if (fast && acc >= USE_THRESH.top) return 'allround'
  if (fast) return 'pair'
  return 'background'
}

export interface UsageQuadrantRow {
  canonical: string
  cell: SweCell
  acc: number
  medWallPass: number | null
  solvedPerHour: number | null
  bucket: UsageBucket
  nGraded: number
}

export function usageQuadrantRows(cells: SweCell[]): UsageQuadrantRow[] {
  return cells
    .filter((c) => c.comparable === true && (c.n_graded ?? 0) >= 30 && c.headline != null)
    .map((c) => {
      const acc = c.headline!
      const medWallPass = c.med_wall_pass ?? c.med_wall ?? null
      const bucket = classifyUsageBucket(acc, medWallPass)!
      return {
        canonical: c.identity?.canonical_model ?? c.model,
        cell: c,
        acc,
        medWallPass,
        solvedPerHour: c.solved_per_hour ?? null,
        bucket,
        nGraded: c.n_graded ?? 0,
      }
    })
}

export function usageQuadrantByBucket(rows: UsageQuadrantRow[]): Record<UsageBucket, UsageQuadrantRow[]> {
  const out: Record<UsageBucket, UsageQuadrantRow[]> = {
    allround: [],
    pair: [],
    background: [],
    lowacc: [],
  }
  for (const r of rows) out[r.bucket].push(r)
  for (const k of Object.keys(out) as UsageBucket[]) {
    out[k].sort((a, b) => b.acc - a.acc || (b.solvedPerHour ?? 0) - (a.solvedPerHour ?? 0))
  }
  return out
}
