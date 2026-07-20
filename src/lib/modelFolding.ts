import type { CompCell, NormCell, SweCell } from '@/lib/store'

export interface CanonicalModelRecord {
  model?: string | null
  cell?: string | null
  profile?: string | null
  source?: string | null
  harness?: string | null
  operator?: string | null
  machine?: string | null
  canonical_version?: string | null
  identity?: {
    canonical_model?: string | null
  } | null
}

export interface FoldedGroup<T> {
  key: string
  canonicalModel: string | null
  representative: T
  records: T[]
}

export type ChooseBest<T> = (current: T, candidate: T) => T

export const normalizeCanonicalModel = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase()

export const recordCanonicalModel = (record: CanonicalModelRecord): string | null => {
  const canonical = record.identity?.canonical_model
  return typeof canonical === 'string' && canonical.trim() ? canonical.trim() : null
}

const stableRowFingerprint = (record: CanonicalModelRecord): string => {
  const parts = [
    record.model,
    record.cell,
    record.profile,
    record.source,
    record.harness,
    record.operator,
    record.machine,
    record.canonical_version,
  ]
  return parts.map((v) => (v == null || v === '' ? '?' : String(v))).join('|')
}

export const canonicalFoldKey = (
  record: CanonicalModelRecord,
  options: { rowKey?: string | number } = {},
): string => {
  const canonical = recordCanonicalModel(record)
  if (canonical) return `canonical:${normalizeCanonicalModel(canonical)}`
  return `row:${options.rowKey ?? stableRowFingerprint(record)}`
}

export function groupByCanonicalModel<T extends CanonicalModelRecord>(
  records: readonly T[],
  chooseBest: ChooseBest<T>,
  rowKey?: (record: T, index: number) => string | number,
): FoldedGroup<T>[] {
  const groups = new Map<string, FoldedGroup<T>>()

  records.forEach((record, index) => {
    const canonical = recordCanonicalModel(record)
    const key = canonicalFoldKey(record, {
      rowKey: canonical ? undefined : `${index}:${rowKey ? rowKey(record, index) : stableRowFingerprint(record)}`,
    })
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        key,
        canonicalModel: canonical,
        representative: record,
        records: [record],
      })
      return
    }

    existing.records.push(record)
    existing.representative = chooseBest(existing.representative, record)
  })

  return Array.from(groups.values())
}

export const variantCount = <T>(group: FoldedGroup<T>): number =>
  Math.max(0, group.records.length - 1)

const num = (value: unknown, fallback = -Infinity): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const comparableRank = (record: { comparable?: boolean }): number =>
  record.comparable === false ? 0 : 1

const compareDesc = (a: number, b: number): number =>
  a === b ? 0 : (a > b ? 1 : -1)

const compareAscNullable = (a: unknown, b: unknown): number => {
  const av = num(a, Infinity)
  const bv = num(b, Infinity)
  if (av === bv) return 0
  return av < bv ? 1 : -1
}

const sweRate = (record: SweCell): number =>
  num(record.headline, num((record as { effective?: number }).effective))

const sweWilsonLow = (record: SweCell): number => {
  const ci = record.headline_ci || (record as { ci?: [number, number] }).ci
  return Array.isArray(ci) ? num(ci[0]) : sweRate(record)
}

export const chooseBestScorecardCell: ChooseBest<SweCell> = (current, candidate) => {
  const checks = [
    compareDesc(comparableRank(candidate), comparableRank(current)),
    compareDesc(sweWilsonLow(candidate), sweWilsonLow(current)),
    compareDesc(sweRate(candidate), sweRate(current)),
    compareDesc(num(candidate.n_graded), num(current.n_graded)),
    compareDesc(num(candidate.solved_per_hour), num(current.solved_per_hour)),
  ]
  return checks.find((v) => v !== 0)! > 0 ? candidate : current
}

export const chooseBestCompCell: ChooseBest<CompCell> = (current, candidate) => {
  const checks = [
    compareDesc(comparableRank(candidate), comparableRank(current)),
    compareDesc(num(candidate.ci_lo), num(current.ci_lo)),
    compareDesc(num(candidate.acc), num(current.acc)),
    compareDesc(num(candidate.n), num(current.n)),
    compareDesc(num(candidate.solved_per_hour), num(current.solved_per_hour)),
    compareAscNullable(candidate.sec_per_solved, current.sec_per_solved),
  ]
  return checks.find((v) => v !== 0)! > 0 ? candidate : current
}

export const chooseBestNormCell: ChooseBest<NormCell> = (current, candidate) => {
  const currentLo = Array.isArray(current.ci) ? num(current.ci[0]) : -Infinity
  const candidateLo = Array.isArray(candidate.ci) ? num(candidate.ci[0]) : -Infinity
  const checks = [
    compareDesc(comparableRank(candidate), comparableRank(current)),
    compareDesc(candidateLo, currentLo),
    compareDesc(num(candidate.pass_rate), num(current.pass_rate)),
    compareDesc(num(candidate.coverage), num(current.coverage)),
  ]
  return checks.find((v) => v !== 0)! > 0 ? candidate : current
}
