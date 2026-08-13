/**
 * Vue wiring for the ranking-board filters. All the decisions live in `modelFilter.ts`
 * (pure, unit-tested); this file only binds them to the route so every board behaves the
 * same way and the filter survives a reload / shared link.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  type ActiveFilter,
  type FilterableRecord,
  filterRows,
  readFilters,
  setFilterQuery,
} from '@/lib/modelFilter'

export function useBoardFilter() {
  const route = useRoute()
  const router = useRouter()

  const filters = computed<ActiveFilter[]>(() => readFilters(route.query))
  const active = computed<ActiveFilter | null>(() => filters.value[0] ?? null)

  /** Replace the active filter level (see setFilterQuery: clicking a vendor widens). */
  const applyFilter = (filter: ActiveFilter | null) => {
    router.push({ path: route.path, query: setFilterQuery(route.query, filter) as never })
  }

  const filterByPublisher = (publisher: string | null | undefined) => {
    if (!publisher || !publisher.trim()) return
    applyFilter({ kind: 'publisher', value: publisher.trim() })
  }

  const clearFilter = () => applyFilter(null)

  /** Narrow a board's rows. `pick` reaches the filterable record inside a view-model row. */
  const applyTo = <T>(rows: readonly T[], pick?: (row: T) => FilterableRecord | null | undefined) =>
    filterRows(rows, filters.value, pick)

  return { filters, active, applyFilter, filterByPublisher, clearFilter, applyTo }
}
