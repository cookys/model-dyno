// Click-to-sort state for the sub-table inside an expanded folded row.
//
// Five boards fold cells to one row per canonical model and list the folded routes in
// an expansion. Each of those expansions grew its own <th> markup and its own (or no)
// ordering, so "can I rank these by pass rate" had five different answers. The rule
// lives here once: every column sorts, numeric columns open descending and text
// columns A→Z, and ordering itself defers to sortVariants so a missing value sinks in
// BOTH directions rather than riding an arrow-flip to the top.
import { ref, type Ref } from 'vue'
import { sortVariants, type VariantSortDir } from '@/lib/variantSort'

export interface FoldColumn {
  key: string
  label: string
  /** Right-aligned, and opens descending — best-first is how numbers read. */
  num?: boolean
  /** Return null for a value that must not rank (e.g. a partial exam's pass rate). */
  sortVal: (row: any) => unknown
}

export interface FoldSort {
  sortKey: Ref<string>
  sortDir: Ref<VariantSortDir>
  toggle: (col: FoldColumn) => void
  arrow: (key: string) => string
  ariaSort: (key: string) => 'ascending' | 'descending' | 'none'
  sortRows: <T>(rows: readonly T[]) => T[]
}

export function useFoldSort(
  columns: () => FoldColumn[],
  defaultKey: string,
  defaultDir: VariantSortDir = 'desc',
): FoldSort {
  const sortKey = ref(defaultKey)
  const sortDir = ref<VariantSortDir>(defaultDir)

  const toggle = (col: FoldColumn) => {
    if (sortKey.value === col.key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = col.key
      sortDir.value = col.num ? 'desc' : 'asc'
    }
  }

  return {
    sortKey,
    sortDir,
    toggle,
    arrow: (key) => (sortKey.value !== key ? '' : sortDir.value === 'asc' ? '↑' : '↓'),
    ariaSort: (key) =>
      sortKey.value !== key ? 'none' : sortDir.value === 'asc' ? 'ascending' : 'descending',
    sortRows: <T,>(rows: readonly T[]) => {
      const col = columns().find((c) => c.key === sortKey.value)
      return sortVariants(rows, col ? col.sortVal : null, sortDir.value)
    },
  }
}
