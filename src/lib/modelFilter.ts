/**
 * Ranking-board row filters — narrow a board to one model, or to a whole vendor family.
 *
 * Two levels, because they answer different questions:
 *   • `model`     — exact `identity.canonical_model`. "Show me this model's routes."
 *                   Already how `?model=` behaved before this module existed.
 *   • `publisher` — the vendor that released the model. "Show me everything xAI has."
 *                   This is the family level: grok-4.5 / 4.6 / 4.6-xhigh / build /
 *                   composer-2.5 all sit under xAI.
 *
 * Family is keyed on PUBLISHER, not on a name prefix. A prefix match would be a string
 * heuristic that silently mis-groups; publisher is a registry-owned field that already
 * travels in the feed.
 *
 * ⚠ Publisher is "who ships it", not "whose weights". `grok-composer-2.5` is published by
 * xAI but is built on Moonshot's Kimi-K2.5 checkpoint, so it appears under xAI. That is
 * correct for "what can this vendor sell me" and wrong for "same lineage" — the board has
 * no lineage field today, so do not read this filter as a lineage claim.
 *
 * Pure module on purpose: no vue import, so tests can transpile and import it directly.
 */

export type FilterKind = 'model' | 'publisher'

export interface FilterableRecord {
  publisher?: string | null
  identity?: { canonical_model?: string | null } | null
}

export interface ActiveFilter {
  kind: FilterKind
  value: string
}

export const MODEL_QUERY_KEY = 'model'
export const PUBLISHER_QUERY_KEY = 'publisher'

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const queryString = (value: unknown): string | null => {
  // vue-router hands back string | string[] | null; take the first usable string.
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

export const recordPublisher = (record: FilterableRecord): string | null => {
  const p = record.publisher
  return typeof p === 'string' && p.trim() ? p.trim() : null
}

export const recordModel = (record: FilterableRecord): string | null => {
  const m = record.identity?.canonical_model
  return typeof m === 'string' && m.trim() ? m.trim() : null
}

/**
 * Read every active filter from a route query. Both keys may be present; they compose as
 * AND rather than one silently overriding the other. In practice a model has exactly one
 * publisher, so the pair is redundant rather than contradictory — but "both apply" is a
 * rule a reader can predict, and a precedence rule is not.
 */
export function readFilters(query: Record<string, unknown> | null | undefined): ActiveFilter[] {
  if (!query) return []
  const out: ActiveFilter[] = []
  const model = queryString(query[MODEL_QUERY_KEY])
  if (model) out.push({ kind: 'model', value: model })
  const publisher = queryString(query[PUBLISHER_QUERY_KEY])
  if (publisher) out.push({ kind: 'publisher', value: publisher })
  return out
}

export function matchesFilter(record: FilterableRecord, filter: ActiveFilter): boolean {
  const wanted = norm(filter.value)
  if (!wanted) return true
  if (filter.kind === 'publisher') return norm(recordPublisher(record)) === wanted
  return norm(recordModel(record)) === wanted
}

export function matchesAllFilters(
  record: FilterableRecord,
  filters: readonly ActiveFilter[],
): boolean {
  return filters.every((f) => matchesFilter(record, f))
}

/**
 * Filter a board's rows. `pick` extracts the filterable record from a row when the row is
 * a view-model wrapper rather than the raw cell (the ranking views build display rows and
 * keep the source cell on a `_rec`-style field).
 */
export function filterRows<T>(
  rows: readonly T[],
  filters: readonly ActiveFilter[],
  pick: (row: T) => FilterableRecord | null | undefined = (row) => row as unknown as FilterableRecord,
): T[] {
  if (!filters.length) return rows.slice()
  return rows.filter((row) => {
    const rec = pick(row)
    return rec ? matchesAllFilters(rec, filters) : false
  })
}

/**
 * Query patch that activates one filter and clears the other level, so clicking a vendor
 * while a single model is pinned WIDENS to the family instead of producing an
 * always-empty model AND publisher intersection.
 */
export function setFilterQuery(
  query: Record<string, unknown>,
  filter: ActiveFilter | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...query }
  delete next[MODEL_QUERY_KEY]
  delete next[PUBLISHER_QUERY_KEY]
  if (!filter) return next
  next[filter.kind === 'publisher' ? PUBLISHER_QUERY_KEY : MODEL_QUERY_KEY] = filter.value
  return next
}

/** Distinct publishers present in a board, for a "jump to vendor" affordance. */
export function publishersOf(records: readonly FilterableRecord[]): string[] {
  const seen = new Map<string, string>()
  for (const r of records) {
    const p = recordPublisher(r)
    if (p && !seen.has(norm(p))) seen.set(norm(p), p)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}
