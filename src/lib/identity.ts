import type { SharedSweCell, SweCell } from '@/lib/store'

export interface CanonicalModelCarrier {
  model?: string | null
  identity?: {
    canonical_model?: string | null
  } | null
}

export interface OwnerCarrier {
  owner?: string | null
}

export interface OwnerSweGroups {
  scorecard: SweCell[]
  shared: SharedSweCell[]
}

const normalizeModelAlias = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase()

export const canonicalModelKey = (value: string | null | undefined): string =>
  normalizeModelAlias(value)

const normalizeOwnerId = (ownerId: string | null | undefined): string =>
  (ownerId ?? '').trim()

const hasCanonicalModelMatch = (aliasKey: string, cell: CanonicalModelCarrier): boolean => {
  if (aliasKey === '') return false
  // Match on canonical_model first; fall back to the raw `cell.model` for SWE rows that carry no
  // identity.canonical_model — BOTH strictly exact-after-lowercase (no substring, no suffix stripping),
  // so a variant (e.g. "-abliterated") never false-merges onto a different model.
  const canonicalKey = canonicalModelKey(cell.identity?.canonical_model)
  if (canonicalKey !== '' && aliasKey === canonicalKey) return true
  const modelKey = canonicalModelKey(cell.model)
  return modelKey !== '' && aliasKey === modelKey
}

export const matchSweCellsByModelAlias = (
  alias: string,
  cells: readonly SweCell[]
): SweCell[] => {
  const key = canonicalModelKey(alias)
  if (!key) return []
  return cells.filter((c) => hasCanonicalModelMatch(key, c as CanonicalModelCarrier))
}

export const matchSweCellsByOwner = (
  ownerId: string,
  scorecardCells: readonly SweCell[],
  shared: readonly SharedSweCell[]
): OwnerSweGroups => {
  const key = normalizeOwnerId(ownerId)
  if (!key) {
    return { scorecard: [], shared: [] }
  }
  const scorecard = scorecardCells.filter((c) => normalizeOwnerId((c as OwnerCarrier).owner) === key)
  const sharedCells = shared.filter((c) => normalizeOwnerId((c as OwnerCarrier).owner) === key)
  return {
    scorecard,
    shared: sharedCells
  }
}
