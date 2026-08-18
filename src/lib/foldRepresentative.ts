// Which member of a folded group the collapsed row shows.
//
// A folded row stands for several routes but can only display one. Picking that one by
// a fixed rule — "the fastest", "the most accurate" — contradicts the reader the moment
// they rank by a different column: the board orders rows by a number that is not the
// number on screen, and the row that wins is not the row being shown. So the cover
// follows the active sort.
//
// Two invariants every board needs and none of them should re-derive:
//   * comparability wins FIRST, in both directions — otherwise flipping the arrow
//     promotes a cell that sat a partial exam and happens to hold a freak number;
//   * a column that cannot rank cells (or a tie) falls through to the board's own
//     existing preference, so behaviour with no sort applied is unchanged.
import type { ChooseBest } from '@/lib/modelFolding'

export interface SortAwareChooserOptions<T> {
  /** The active column's value for a cell, or null when this column cannot rank. */
  activeValue: (cell: T) => number | string | null
  direction: () => 'asc' | 'desc'
  /** Higher wins. Typically comparable-vs-partial. Return 0 to defer. */
  rankFirst?: (cell: T) => number
  /** The board's pre-existing representative rule, used for ties. */
  fallback: ChooseBest<T>
}

export function sortAwareChooser<T>(opts: SortAwareChooserOptions<T>): ChooseBest<T> {
  return (current: T, candidate: T): T => {
    if (opts.rankFirst) {
      const rank = opts.rankFirst(candidate) - opts.rankFirst(current)
      if (rank !== 0) return rank > 0 ? candidate : current
    }
    const a = opts.activeValue(candidate)
    const b = opts.activeValue(current)
    if (a !== null && b !== null && a !== b) {
      const candidateIsSmaller = typeof a === 'number' && typeof b === 'number'
        ? a < b
        : String(a).localeCompare(String(b), undefined, { numeric: true }) < 0
      return (opts.direction() === 'asc') === candidateIsSmaller ? candidate : current
    }
    return opts.fallback(current, candidate)
  }
}
