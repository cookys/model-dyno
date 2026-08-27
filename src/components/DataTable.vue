<script setup lang="ts" generic="T extends Record<string, any>">
import { ref, computed, h, onMounted, onUnmounted } from 'vue'
import { useI18n } from '@/lib/i18n'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

export interface Column<RowType> {
  key: string
  label: string
  /** Header hover/help text. If omitted, DataTable falls back to table.tip.<key>. */
  description?: string
  num?: boolean
  sortVal?: (row: RowType) => any
  render?: (row: RowType, index: number) => any
  /** Hide this column below the `md` breakpoint (mobile). The value stays reachable
   *  via the row's expand-detail grid, so wide boards don't force a 10-column
   *  horizontal scroll on a phone. Keep the model name + the headline metric visible. */
  mobileHide?: boolean
  /** Hide this column below the `xl` breakpoint (anything narrower than a full-width
   *  desktop, i.e. < 1280px). Use on the widest boards (COMP / SCORECARD): the capped
   *  `max-w-6xl` content area isn't wide enough for all 10 columns until ~xl, so revealing
   *  them at `lg` (1024) would still inner-scroll. Value stays in the expand-detail grid. */
  tabletHide?: boolean
}

export interface DetailField<RowType> {
  key: string
  label: string
  value?: (row: RowType) => any
  href?: (row: RowType) => string | null
  hrefKey?: string
  wide?: boolean
}

interface ResolvedDetailField {
  key: string
  label: string
  value: any
  href: string | null
  wide: boolean
}

const { t } = useI18n()

const props = defineProps<{
  columns: Column<T>[]
  rows: T[]
  expandable?: boolean
  defaultSort?: string | null
  defaultDir?: 'asc' | 'desc'
  rowIdKey: keyof T
  fixedLayout?: boolean
  detailFields?: DetailField<T>[]
  detailIncludeRest?: boolean
  highlightRowId?: any
}>()

// Track the mobile breakpoint so the expand-detail row's colspan matches the number
// of VISIBLE columns. mobileHidden columns are display:none on mobile, so a colspan
// counting all columns makes table-fixed think there are more columns than rendered
// → it divides the width across the phantom columns and collapses the real ones.
const isMobile = ref(false)   // < md (767)
const isMid = ref(false)      // md..<xl (768–1279): mobileHide cols show, tabletHide cols hidden
let mqM: MediaQueryList | null = null
let mqT: MediaQueryList | null = null
const onMqM = (e: MediaQueryListEvent | MediaQueryList) => { isMobile.value = e.matches }
const onMqT = (e: MediaQueryListEvent | MediaQueryList) => { isMid.value = e.matches }
onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mqM = window.matchMedia('(max-width: 47.99rem)')
    mqT = window.matchMedia('(min-width: 48rem) and (max-width: 79.99rem)')
    isMobile.value = mqM.matches
    isMid.value = mqT.matches
    mqM.addEventListener('change', onMqM)
    mqT.addEventListener('change', onMqT)
  }
})
onUnmounted(() => {
  if (mqM) mqM.removeEventListener('change', onMqM)
  if (mqT) mqT.removeEventListener('change', onMqT)
})

// Responsive hide class for a column, mirroring the colspan math below. tabletHide
// hides through mobile..<xl (xl:table-cell reveals at 1280), so it wins over mobileHide.
const hideClass = (c: Column<T>) =>
  c.tabletHide ? 'hidden xl:table-cell' : (c.mobileHide ? 'hidden md:table-cell' : '')

const columnDescription = (c: Column<T>) => {
  if (c.description) return c.description
  const key = `table.tip.${c.key}`
  const text = t(key)
  return text === key ? c.label : text
}

// number of columns the expand-detail / empty cell must span (visible data cols + expand).
// MUST match the columns actually rendered at the current breakpoint, or table-fixed
// (mobile) divides width across phantom columns and table-auto (≥md) mis-spans the row.
const fullColspan = computed(() => {
  const visibleData = props.columns.filter(c => {
    if (isMobile.value) return !c.mobileHide && !c.tabletHide
    if (isMid.value) return !c.tabletHide
    return true
  }).length
  return visibleData + (props.expandable ? 1 : 0)
})

const sortKey = ref<string | null>(props.defaultSort ?? null)
const sortDir = ref<'asc' | 'desc'>(props.defaultDir ?? 'desc')
const expandedRows = ref<Set<any>>(new Set())
const viewMode = ref<Record<string, 'grid' | 'json'>>({}) // keyed by row ID

const toggleExpand = (rowId: any) => {
  const next = new Set(expandedRows.value)
  if (next.has(rowId)) {
    next.delete(rowId)
  } else {
    next.add(rowId)
    if (!viewMode.value[rowId]) {
      viewMode.value[rowId] = 'grid'
    }
  }
  expandedRows.value = next
}

const toggleViewMode = (rowId: any) => {
  viewMode.value[rowId] = viewMode.value[rowId] === 'json' ? 'grid' : 'json'
}

const handleSort = (col: Column<T>) => {
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = col.key
    sortDir.value = col.num ? 'desc' : 'asc'
  }
  // Collapse open detail rows on re-sort
  expandedRows.value = new Set()
}

const getSortVal = (col: Column<T>, row: T) => {
  return col.sortVal ? col.sortVal(row) : row[col.key]
}

const sortedRows = computed(() => {
  const activeCol = props.columns.find(c => c.key === sortKey.value)
  if (!activeCol) return props.rows

  const result = [...props.rows]
  result.sort((a, b) => {
    let va = getSortVal(activeCol, a)
    let vb = getSortVal(activeCol, b)

    if (va === undefined || va === null) va = activeCol.num ? -Infinity : ''
    if (vb === undefined || vb === null) vb = activeCol.num ? -Infinity : ''

    if (activeCol.num) {
      const na = Number(va)
      const nb = Number(vb)
      return sortDir.value === 'asc' ? na - nb : nb - na
    } else {
      const sa = String(va)
      const sb = String(vb)
      const cmp = sa.localeCompare(sb)
      return sortDir.value === 'asc' ? cmp : -cmp
    }
  })

  return result
})

const renderCell = (col: Column<T>, row: T, index: number) => {
  if (!col.render) {
    return row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '—'
  }
  const rendered = col.render(row, index)
  if (typeof rendered === 'object' && rendered !== null) {
    return () => rendered
  }
  return () => h('span', String(rendered))
}

const isHttpUrl = (v: any) => typeof v === 'string' && /^https?:\/\//.test(v)
const shortUrl = (v: string) => v.replace(/^https?:\/\/(www\.)?/, '')

const configuredDetailFields = (row: T): ResolvedDetailField[] => {
  const result: ResolvedDetailField[] = []
  for (const field of props.detailFields || []) {
    const raw = field.value ? field.value(row) : row[field.key]
    if (raw === undefined || raw === null || raw === '') continue
    result.push({
      key: field.key,
      label: field.label,
      value: raw,
      href: field.href ? field.href(row) : null,
      wide: field.wide === true,
    })
  }
  return result
}

const configuredDetailKeys = computed(() => {
  const keys = new Set<string>()
  for (const field of props.detailFields || []) {
    keys.add(field.key)
    if (field.hrefKey) keys.add(field.hrefKey)
  }
  return keys
})

const getRecordFields = (row: T, excludeKeys = new Set<string>()) => {
  // Extract fields, excluding internal carriers: anything `_`-prefixed (e.g. `_rec`,
  // which holds the WHOLE raw record object — dumping it stringified blew out the
  // table-fixed layout on expand) and `__`-prefixed Vue/helper props.
  const result: { key: string; value: any }[] = []
  const target = (row as any).__record || row
  for (const [k, v] of Object.entries(target)) {
    if (excludeKeys.has(k)) continue
    if (k.startsWith('_')) continue
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'object') continue // never dump nested objects/arrays into the grid
    result.push({ key: k, value: v })
  }
  return result
}
</script>

<template>
  <div class="rounded-md border border-border bg-card overflow-hidden">
    <!-- single-axis: the page scrolls vertically (no inner max-height box); only
         wide tables scroll horizontally inside this one container. -->
    <div class="overflow-x-auto scrollbar-thin">
      <!-- Keep the table capped to the container width. Letting content pick the
           desktop width makes translated headers and long model labels create
           page-level horizontal scrollbars. Hidden columns remain available in
           the expand-detail row. -->
      <Table :class="['runs relative w-full', props.fixedLayout ? 'table-fixed' : 'table-auto']">
        <TableHeader class="bg-card border-b border-border">
          <TableRow>
            <TableHead v-if="expandable" class="w-10 p-0 text-center" :title="t('table.detailsTip')">
              <span class="sr-only">{{ t('table.details') }}</span>
            </TableHead>
            <TableHead
              v-for="col in columns"
              :key="col.key"
              scope="col"
              tabindex="0"
              :title="columnDescription(col)"
              :aria-label="`${col.label}: ${columnDescription(col)}`"
              :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              :class="[
                'cursor-pointer select-none font-semibold text-muted-foreground hover:text-foreground transition-colors py-3 px-3 whitespace-normal break-words min-w-0',
                col.num ? 'text-right' : 'text-left',
                hideClass(col)
              ]"
              @click="handleSort(col)"
              @keydown.enter.prevent="handleSort(col)"
              @keydown.space.prevent="handleSort(col)"
            >
              <div :class="['flex items-center gap-1 min-w-0', col.num ? 'justify-end' : 'justify-start']">
                <span class="min-w-0 break-words leading-tight">{{ col.label }}</span>
                <span v-if="sortKey === col.key" class="shrink-0 text-primary font-bold text-[10px]">
                  {{ sortDir === 'asc' ? '▲' : '▼' }}
                </span>
                <span v-else class="shrink-0 text-muted-foreground/30 text-[10px] font-normal">⇅</span>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="(row, i) in sortedRows" :key="row[rowIdKey]">
            <!-- Main Row -->
            <TableRow
              :class="[
                'hover:bg-muted/40 transition-colors',
                row.__stale ? 'opacity-40 text-muted-foreground' : '',
                row[rowIdKey] === props.highlightRowId ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
              ]"
            >
              <TableCell v-if="expandable" class="w-10 p-0 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  :title="expandedRows.has(row[rowIdKey]) ? t('table.collapseRow') : t('table.expandRow')"
                  :aria-expanded="expandedRows.has(row[rowIdKey])"
                  :aria-label="expandedRows.has(row[rowIdKey]) ? t('table.collapseRow') : t('table.expandRow')"
                  @click="toggleExpand(row[rowIdKey])"
                >
                  <span class="text-sm font-mono select-none" aria-hidden="true">
                    {{ expandedRows.has(row[rowIdKey]) ? '▾' : '▸' }}
                  </span>
                </Button>
              </TableCell>
              <TableCell
                v-for="col in columns"
                :key="col.key"
                :class="[
                  'py-2.5 px-3 font-normal tracking-wide align-top',
                  col.num ? 'text-right font-mono whitespace-nowrap' : 'text-left whitespace-normal break-words',
                  hideClass(col)
                ]"
              >
                <template v-if="typeof renderCell(col, row, i) === 'function'">
                  <component :is="renderCell(col, row, i)" />
                </template>
                <template v-else>
                  {{ renderCell(col, row, i) }}
                </template>
              </TableCell>
            </TableRow>

            <!-- Expanded Details Row -->
            <TableRow v-if="expandable && expandedRows.has(row[rowIdKey])" class="bg-muted/20 border-b border-border">
              <TableCell :colspan="fullColspan" class="p-4 bg-muted/60">
                <div class="space-y-3">
                  <div class="flex items-center justify-between border-b border-border/40 pb-2">
                    <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {{ t('table.runDetails') }}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-7 text-xs px-2.5 bg-card"
                      @click="toggleViewMode(row[rowIdKey])"
                    >
                      {{ viewMode[row[rowIdKey]] === 'json' ? t('table.showKeyValue') : t('table.showRawJson') }}
                    </Button>
                  </div>

                  <template v-if="viewMode[row[rowIdKey]] === 'grid'">
                    <!-- Curated detail cards: the first-class expansion pattern for fields
                         that explain the row (route, weights, engine, provenance). -->
                    <div
                      v-if="$slots.detail"
                      class="text-xs text-foreground/90"
                    >
                      <slot name="detail" :row="row" />
                    </div>

                    <div
                      v-if="configuredDetailFields(row).length"
                      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs text-foreground/90"
                    >
                      <div
                        v-for="field in configuredDetailFields(row)"
                        :key="field.key"
                        :class="[
                          'flex flex-col min-w-0 overflow-hidden bg-card p-2.5 rounded border border-border/60 hover:border-border transition-colors',
                          field.wide ? 'sm:col-span-2' : ''
                        ]"
                      >
                        <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                          {{ field.label }}
                        </span>
                        <a
                          v-if="field.href || isHttpUrl(field.value)"
                          class="mt-1 truncate text-brand hover:underline text-xs font-mono"
                          :href="String(field.href || field.value)"
                          target="_blank"
                          rel="noreferrer"
                          :title="String(field.href || field.value)"
                        >
                          {{ shortUrl(String(field.value)) }}
                        </a>
                        <span v-else class="mt-1 truncate text-foreground text-xs font-mono" :title="String(field.value)">
                          {{ field.value }}
                        </span>
                      </div>
                    </div>

                    <!-- Remaining raw metadata. This keeps every board inspectable while
                         letting page-specific high-signal fields set the visual hierarchy. -->
                    <div
                      v-if="props.detailIncludeRest !== false"
                      class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs text-foreground/90 font-mono"
                    >
                      <div
                        v-for="field in getRecordFields(row, configuredDetailKeys)"
                        :key="field.key"
                        class="flex flex-col min-w-0 overflow-hidden bg-card/60 p-2 rounded border border-border/40 hover:border-border/80 transition-colors"
                      >
                        <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                          {{ field.key }}
                        </span>
                        <a
                          v-if="isHttpUrl(field.value)"
                          class="mt-0.5 truncate text-brand hover:underline text-xs"
                          :href="String(field.value)"
                          target="_blank"
                          rel="noreferrer"
                          :title="String(field.value)"
                        >
                          {{ shortUrl(String(field.value)) }}
                        </a>
                        <span v-else class="mt-0.5 truncate text-foreground text-xs" :title="String(field.value)">
                          {{ field.value }}
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- JSON View -->
                  <pre
                    v-else
                    class="bg-zinc-950 dark:bg-zinc-950/40 p-4 rounded-md border border-border text-[11px] font-mono leading-relaxed text-emerald-500 dark:text-emerald-400 overflow-x-auto max-h-[300px] scrollbar-thin shadow-inner"
                  >{{ JSON.stringify(row.__record || row, null, 2) }}</pre>
                </div>
              </TableCell>
            </TableRow>
          </template>

          <TableRow v-if="rows.length === 0">
            <TableCell :colspan="fullColspan" class="text-center py-8 text-muted-foreground text-sm">
              {{ t('table.noData') }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
