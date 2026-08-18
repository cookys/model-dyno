// Sorting for the rows INSIDE a folded row's variant sub-table.
//
// The sub-table used to be frozen at "fastest first" — a hard-coded perMin desc in the
// view that built the rows. That is the wrong default to be stuck with: the whole point
// of the fold is comparing the spread, and which axis the spread matters on depends on
// the question (accuracy for "is thinking worth it", solve time for "can I ship it").
// So the order lives here, driven by a clicked header, and every caller shares the same
// null and tie handling as the outer DataTable: nulls sink to the bottom in BOTH
// directions, so flipping a column never promotes an unmeasured cell to the top.

export type VariantSortDir = 'asc' | 'desc'

const isBlank = (v: unknown) =>
  v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))

/** Compare two sort values, nulls last regardless of direction. */
export function compareVariantValues(a: unknown, b: unknown, dir: VariantSortDir): number {
  const aBlank = isBlank(a)
  const bBlank = isBlank(b)
  if (aBlank && bBlank) return 0
  if (aBlank) return 1
  if (bBlank) return -1
  const sign = dir === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * sign
}

/** Stable sort of variant rows by one accessor. Never mutates the input. */
export function sortVariants<T>(
  rows: readonly T[],
  sortVal: ((r: T) => unknown) | null,
  dir: VariantSortDir,
): T[] {
  if (!sortVal) return [...rows]
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => compareVariantValues(sortVal(x.row), sortVal(y.row), dir) || x.i - y.i)
    .map((e) => e.row)
}
