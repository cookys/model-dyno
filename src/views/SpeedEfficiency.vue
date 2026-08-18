<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch, h } from 'vue'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardSpeedComp, speedLoading as loading } from '@/lib/store'
import type { CompCell } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { num } from '@/components/CellHelpers'
import { groupByCanonicalModel, recordCanonicalModel } from '@/lib/modelFolding'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { foldedRoutesBadge } from '@/components/CellHelpers'
import { classifyCell, partitionBySection } from '@/lib/runClass'
import { resolveExamMeta } from '@/lib/examMeta'
import { primarySolveSecOf, primarySolvedPerHourOf, examCostSecOf } from '@/lib/speedMetrics'
import { useBoardFilter } from '@/lib/useBoardFilter'
import { publishersOf } from '@/lib/modelFilter'
import BoardFilterBanner from '@/components/BoardFilterBanner.vue'

const { t } = useI18n()
const boardFilter = useBoardFilter()
let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)
const detailContainer = ref<HTMLDivElement | null>(null)
const selectedKey = ref<string | null>(null)
const detailFlash = ref(false)
let detailFlashTimer: ReturnType<typeof setTimeout> | null = null

const examName = computed(() => dashboardSpeedComp.value?.exam ?? '—')

/** plan 053: exam size SSOT from COMP index (not max(cell.n)). */
const examMeta = computed(() => resolveExamMeta(dashboardSpeedComp.value))

const rankDesc = (value: unknown): number => num(value) ?? -Infinity
const rankAsc = (value: unknown): number => num(value) ?? Infinity
const comparableRank = (record: CompCell): number =>
  classifyCell(record, examMeta.value).rankable ? 1 : 0

const compareDesc = (a: number, b: number): number => {
  if (a === b) return 0
  return a > b ? 1 : -1
}

const compareAsc = (a: number, b: number): number => {
  if (a === b) return 0
  return a < b ? 1 : -1
}

// Speed-efficiency is a speed page, so its representative is not the scorecard
// representative. Full runs win first; among equal run status, the fastest route wins.
const chooseFastestEfficiencyCell = (current: CompCell, candidate: CompCell): CompCell => {
  const checks = [
    compareDesc(comparableRank(candidate), comparableRank(current)),
    // plan 052: rank by pass-conditioned throughput / solve time, not fail-taxed s/✓
    compareDesc(rankDesc(primarySolvedPerHourOf(candidate)), rankDesc(primarySolvedPerHourOf(current))),
    compareAsc(rankAsc(primarySolveSecOf(candidate)), rankAsc(primarySolveSecOf(current))),
    compareDesc(rankDesc(candidate.ci_lo), rankDesc(current.ci_lo)),
    compareDesc(rankDesc(candidate.acc), rankDesc(current.acc)),
    compareDesc(rankDesc(candidate.n), rankDesc(current.n)),
  ]
  return checks.find((v) => v !== 0)! > 0 ? candidate : current
}

const eligibleCells = computed(() =>
  (dashboardSpeedComp.value?.cells || []).filter((c) => primarySolvedPerHourOf(c) !== null && !c.frozen)
)

/** Vendors present as a registry `publisher`. The chart's `vendor` field falls back to
 * operator/local/harness for rows the registry deliberately leaves publisher-less (local
 * abliterations/merges — never guess a vendor); those buckets are not offered, since a
 * filter on them would empty the board rather than narrow it.
 *
 * This is an explicit control rather than a click on the colour legend: Vega-Lite legends
 * are non-interactive unless a selection is bound to them, so a legend click never reaches
 * the view's click handler (verified in-browser on the live site — label and swatch both
 * dead). It is also simply easier to find. */
const vendorOptions = computed(() => publishersOf(eligibleCells.value))
const activeVendor = computed(() =>
  boardFilter.active.value?.kind === 'publisher' ? boardFilter.active.value.value : null
)

// Filter BEFORE folding so the representative is chosen within the family, not globally.
const throughputGroups = computed(() =>
  groupByCanonicalModel(
    boardFilter.applyTo(eligibleCells.value),
    chooseFastestEfficiencyCell,
    (c) => `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
  )
)

const routeRank = (a: CompCell, b: CompCell): number => {
  const checks = [
    compareDesc(comparableRank(a), comparableRank(b)),
    compareDesc(rankDesc(primarySolvedPerHourOf(a)), rankDesc(primarySolvedPerHourOf(b))),
    compareAsc(rankAsc(primarySolveSecOf(a)), rankAsc(primarySolveSecOf(b))),
    compareDesc(rankDesc(a.ci_lo), rankDesc(b.ci_lo)),
    compareDesc(rankDesc(a.acc), rankDesc(b.acc)),
    compareDesc(rankDesc(a.n), rankDesc(b.n)),
  ]
  return -(checks.find((v) => v !== 0) ?? 0)
}

// One implementation for both the per-row expansion and the chart-driven panel; they
// showed the same thing built two ways before, which is how they drift apart.
const mapRoutes = (records: readonly CompCell[], representative: CompCell | null | undefined) =>
  records
    .slice()
    .sort(routeRank)
    .map((c) => ({
      key: `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
      route: c.cell,
      // The config axes, so a reader does not have to parse the cell slug to find out
      // what a row IS. These are validated against benchmarks/swe-personal/eval-tags.toml
      // and derived from each run's own recorded request, not from its filename.
      tags: (c as any).tags || {},
      provider: c.publisher || c.operator || '—',
      harness: c.harness || c.access_label || '—',
      machine: c.machine || 'cloud',
      run: classifyCell(c, examMeta.value).rankable ? t('cloud.run.full') : t('cloud.run.partial'),
      comparable: classifyCell(c, examMeta.value).rankable,
      shown: c === representative,
      n: `${c.passed}/${c.n}`,
      perHour: primarySolvedPerHourOf(c),
      sec: primarySolveSecOf(c),
      secAll: examCostSecOf(c),
      acc: num(c.acc),
    }))

// One canonical-model representative per row. Full-exam cells win before partials;
// within the same run status, the page shows the fastest solving-throughput route.
// plan 053: fold then partition into main (rankable) vs incomplete.
const allRows = computed(() =>
  throughputGroups.value
    .map((group) => {
      const c = group.representative
      const cls = classifyCell(c, examMeta.value)
      return {
        key: group.key,
        label: (c.identity && c.identity.canonical_model) || c.model || c.cell,
        perHour: primarySolvedPerHourOf(c),
        acc: num(c.acc) !== null ? +(c.acc * 100).toFixed(0) : null,
        sec: primarySolveSecOf(c),
        secAll: examCostSecOf(c),
        comparable: cls.rankable,
        run: cls.rankable ? t('cloud.run.full') : t('cloud.run.partial'),
        vendor: c.publisher || c.operator || (c.machine ? 'local' : c.harness || '—'),
        machine: c.machine || 'cloud',
        n: `${c.passed}/${c.n}`,
        nRaw: c.n,
        route: c.cell,
        routes: group.records.length,
        // Every row carries its own routes, so the table can expand any number of them
        // at once. Previously the only way to see a model's routes was to click its
        // point on the chart, which showed exactly one at a time and left the complete
        // rows with no table at all.
        routeRows: mapRoutes(group.records, c),
        variantCount: Math.max(0, group.records.length - 1),
        canonical: recordCanonicalModel(c) || c.cell,
        selected: selectedKey.value === group.key,
        _section: cls.section,
        _nGraded: cls.n,
        _nExam: cls.nExam,
        _owed: cls.owed,
      }
    })
    .filter((r) => r.perHour !== null)
)

const mainRows = computed(() =>
  partitionBySection(allRows.value, (r) => r._section).main
    .slice()
    .sort((a, b) => (b.perHour as number) - (a.perHour as number))
)
const incompleteRows = computed(() => {
  const inc = partitionBySection(allRows.value, (r) => r._section).incomplete
  return [...inc].sort((a, b) => (b.nRaw || 0) - (a.nRaw || 0) || (b.perHour as number) - (a.perHour as number))
})

/** Chart + default selection use rankable FULL only (plan 053). */
const rows = computed(() => mainRows.value)

const selectedGroup = computed(() => {
  const fallback = rows.value[0]?.key ?? null
  const key = selectedKey.value || fallback
  if (!key) return null
  return throughputGroups.value.find((group) => group.key === key) || null
})

const selectedRow = computed(() => {
  const key = selectedGroup.value?.key
  return key ? rows.value.find((row) => row.key === key) || null : null
})

const selectedRoutes = computed(() =>
  (selectedGroup.value?.records || [])
    .slice()
    .sort(routeRank)
    .map((c) => ({
      key: `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
      route: c.cell,
      provider: c.publisher || c.operator || '—',
      harness: c.harness || c.access_label || '—',
      machine: c.machine || 'cloud',
      run: classifyCell(c, examMeta.value).rankable ? t('cloud.run.full') : t('cloud.run.partial'),
      comparable: classifyCell(c, examMeta.value).rankable,
      shown: c === selectedGroup.value?.representative,
      n: `${c.passed}/${c.n}`,
      perHour: primarySolvedPerHourOf(c),
      sec: primarySolveSecOf(c),
      secAll: examCostSecOf(c),
      acc: num(c.acc),
    }))
)

const focusSelectedRoutes = () => {
  nextTick(() => {
    detailContainer.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    detailFlash.value = true
    if (detailFlashTimer) clearTimeout(detailFlashTimer)
    detailFlashTimer = setTimeout(() => {
      detailFlash.value = false
      detailFlashTimer = null
    }, 1200)
  })
}

watch(rows, (next) => {
  if (!next.length) {
    selectedKey.value = null
    return
  }
  if (!selectedKey.value || !next.some((row) => row.key === selectedKey.value)) {
    selectedKey.value = next[0].key
  }
}, { immediate: true })

function render() {
  if (!chartContainer.value || !rows.value.length) return
  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    background: 'transparent',
    autosize: { type: 'fit', contains: 'padding' },
    config: chartTheme(isDark.value),
    data: { values: rows.value },
    width: 'container',
    height: { step: 20 },
    mark: { type: 'bar', tooltip: true, cornerRadiusEnd: 2 },
    encoding: {
      y: {
        field: 'label',
        type: 'nominal',
        sort: null, // already sorted fastest-first in JS
        title: null,
        axis: { labelLimit: 220 },
      },
      x: {
        field: 'perHour',
        type: 'quantitative',
        title: t('eff.axis.perHour'),
      },
      color: {
        field: 'vendor',
        type: 'nominal',
        title: null,
        condition: { test: 'datum.comparable === false', value: isDark.value ? '#64748b' : '#9ca3af' },
        legend: { orient: 'bottom', direction: 'horizontal', columns: 5, labelLimit: 90, symbolSize: 70 },
      },
      opacity: {
        condition: { test: 'datum.comparable === false', value: 0.35 },
        value: 0.9,
        legend: null,
      },
      stroke: {
        condition: { test: 'datum.selected === true', value: isDark.value ? '#fbbf24' : '#92400e' },
        value: 'transparent',
      },
      strokeWidth: {
        condition: { test: 'datum.selected === true', value: 2 },
        value: 0,
      },
      tooltip: [
        { field: 'label', title: t('vega.tt.modelZh') },
        { field: 'route', title: t('col.cell') },
        { field: 'run', title: t('cloud.col.run') },
        { field: 'routes', title: t('fold.routes') },
        { field: 'perHour', title: t('eff.tt.perHour'), format: '.1f' },
        { field: 'sec', title: t('vega.tt.secSolved'), format: '.0f' },
        { field: 'acc', title: t('vega.tt.accuracy'), format: '.0f' },
        { field: 'machine', title: t('vega.tt.machineZh') },
        { field: 'n', title: t('eff.tt.solved') },
      ],
    },
  }
  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: 'svg' })
    .then((res) => {
      vegaView = res.view
      vegaView.addEventListener('click', (_event: MouseEvent, item: any) => {
        const key = item?.datum?.key
        if (typeof key === 'string') {
          selectedKey.value = key
          // Highlight the row in the main table as well as opening the shared panel —
          // the chart is now one way into the table, not the only way to see routes.
          focusRow(key)
          focusSelectedRoutes()
        }
      })
    })
    .catch((err) => console.error('Efficiency bar failed to render:', err))
}

watch([rows, chartContainer, isDark], () => {
  if (vegaView) { vegaView.finalize(); vegaView = null }
  render()
}, { immediate: true })
onUnmounted(() => {
  if (vegaView) { vegaView.finalize(); vegaView = null }
  if (detailFlashTimer) clearTimeout(detailFlashTimer)
})
// The main table. The chart stays, but it is no longer the ONLY way in: every folded
// model is a row here and any number of them can be expanded at once. Clicking a chart
// point now highlights and scrolls to its row instead of driving a single shared panel.
const fmt1 = (v: any) => (v === null || v === undefined ? '—' : Number(v).toFixed(1))
const fmt0 = (v: any) => (v === null || v === undefined ? '—' : String(Math.round(Number(v))))

const cols = computed<Column<any>[]>(() => [
  {
    key: 'label', label: t('col.modelZh'), sortVal: (r) => r.label,
    render: (r) => h('span', { class: 'inline-flex flex-wrap items-center gap-1' }, [
      h('span', { class: 'font-mono font-medium text-foreground' }, r.label),
      ...(r.variantCount > 0 ? [foldedRoutesBadge(r.variantCount, t)] : []),
    ]),
  },
  { key: 'vendor', label: t('col.operator'), mobileHide: true, sortVal: (r) => r.vendor },
  { key: 'perHour', label: t('eff.tt.perHour'), num: true, sortVal: (r) => r.perHour ?? -1, render: (r) => fmt1(r.perHour) },
  { key: 'sec', label: t('vega.tt.secSolved'), num: true, sortVal: (r) => r.sec ?? Infinity, render: (r) => fmt0(r.sec) },
  { key: 'acc', label: t('cloud.col.pass'), num: true, sortVal: (r) => r.acc ?? -1, render: (r) => (r.acc === null ? '—' : `${r.acc}%`) },
  { key: 'n', label: t('cloud.col.run'), sortVal: (r) => r.nRaw ?? 0 },
  { key: 'machine', label: t('col.machineSwe'), mobileHide: true, tabletHide: true, sortVal: (r) => r.machine },
])

const focusedRowKey = ref<string | null>(null)
const tableRef = ref<any>(null)
const focusRow = (key: string) => {
  focusedRowKey.value = key
  nextTick(() => {
    const el = tableRef.value instanceof HTMLElement ? tableRef.value : tableRef.value?.$el
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
</script>

<template>
  <div class="space-y-4">
    <BoardFilterBanner :filter="boardFilter.active.value" @clear="boardFilter.clearFilter" />
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">{{ t('eff.title') }}</CardTitle>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="text-xs text-muted-foreground">{{ t('eff.subtitle') }} · {{ examName }}</p>
          <div v-if="vendorOptions.length" class="inline-flex items-center gap-1.5">
            <span class="text-xs text-muted-foreground">{{ t('filter.vendorLabel') }}</span>
            <select
              class="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-semibold text-foreground"
              :value="activeVendor || ''"
              @change="(e) => {
                const v = (e.target as HTMLSelectElement).value
                v ? boardFilter.filterByPublisher(v) : boardFilter.clearFilter()
              }"
            >
              <option value="">{{ t('filter.vendorAll') }}</option>
              <option v-for="v in vendorOptions" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="loading && !allRows.length" class="py-16 text-center text-sm text-muted-foreground">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="!allRows.length" class="py-16 text-center text-sm text-muted-foreground">
          {{ t('empty.speedData') }}
        </div>
        <template v-else>
          <div v-if="rows.length" class="space-y-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <h3 class="text-sm font-semibold text-foreground">{{ t('runClass.section.main') }}</h3>
              <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
                {{ t('runClass.section.count').replace('{n}', String(rows.length)) }}
              </span>
            </div>
            <div ref="chartContainer" class="w-full"></div>
          </div>
          <div v-else class="py-8 text-center text-sm text-muted-foreground">
            {{ t('runClass.section.incompleteDesc') }}
          </div>
        </template>
        <div
          v-if="selectedRow"
          ref="detailContainer"
          :class="[
            'mt-4 scroll-mt-6 space-y-2 rounded-md transition-colors duration-300',
            detailFlash ? 'bg-primary/5 ring-2 ring-primary/40 ring-offset-2 ring-offset-background' : '',
          ]"
        >
          <div>
            <div class="text-xs font-semibold text-foreground">
              {{ t('eff.routes.title') }} · {{ selectedRow.label }}
            </div>
            <p class="text-[11px] text-muted-foreground">{{ t('eff.routes.explainer') }}</p>
          </div>
          <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
            <table class="w-full text-left text-[11px]">
              <thead class="border-b border-border/60 text-muted-foreground">
                <tr>
                  <th class="px-2 py-1.5 font-semibold">{{ t('cloud.col.route') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('cloud.detail.provider') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('col.harness') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('col.machine') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('cloud.col.run') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('eff.tt.perHour') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('vega.tt.secSolved') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('cloud.col.pass') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('col.note') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="route in selectedRoutes"
                  :key="route.key"
                  :class="[
                    'border-b border-border/40 last:border-0',
                    route.comparable ? '' : 'opacity-50',
                    route.shown ? 'bg-primary/5' : '',
                  ]"
                >
                  <td class="px-2 py-1.5 font-mono">{{ route.route }}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">{{ route.provider }}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">{{ route.harness }}</td>
                  <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ route.machine }}</td>
                  <td class="px-2 py-1.5">{{ route.run }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ route.perHour === null ? '—' : route.perHour.toFixed(1) }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ route.sec === null ? '—' : Math.round(route.sec) }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">
                    {{ route.n }}
                    <span class="text-muted-foreground">({{ route.acc === null ? '—' : `${Math.round(route.acc * 100)}%` }})</span>
                  </td>
                  <td class="px-2 py-1.5 text-muted-foreground">{{ route.shown ? t('eff.routes.shown') : '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="grid grid-cols-1 gap-2 md:hidden">
            <div
              v-for="route in selectedRoutes"
              :key="`${route.key}-card`"
              :class="[
                'rounded-md border border-border/60 bg-card p-2.5 text-xs',
                route.comparable ? '' : 'opacity-50',
                route.shown ? 'bg-primary/5 ring-1 ring-primary/20' : '',
              ]"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="break-words font-mono font-semibold text-foreground">{{ route.route }}</div>
                  <div class="mt-1 text-[11px] text-muted-foreground">
                    {{ route.provider }} · {{ route.harness }}
                  </div>
                </div>
                <span v-if="route.shown" class="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {{ t('eff.routes.shown') }}
                </span>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div class="text-muted-foreground">{{ t('col.machine') }}</div>
                  <div class="font-mono">{{ route.machine }}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">{{ t('cloud.col.run') }}</div>
                  <div>{{ route.run }}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">{{ t('eff.tt.perHour') }}</div>
                  <div class="font-mono">{{ route.perHour === null ? '—' : route.perHour.toFixed(1) }}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">{{ t('vega.tt.secSolved') }}</div>
                  <div class="font-mono">{{ route.sec === null ? '—' : Math.round(route.sec) }}</div>
                </div>
                <div>
                  <div class="text-muted-foreground">{{ t('cloud.col.pass') }}</div>
                  <div class="font-mono">{{ route.n }} <span class="text-muted-foreground">({{ route.acc === null ? '—' : `${Math.round(route.acc * 100)}%` }})</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- plan 053: incomplete dual list (not a ranked bar chart) -->
        <div ref="tableRef" class="mt-5">
          <DataTable
            :columns="cols"
            :rows="mainRows"
            row-id-key="key"
            :default-sort="'perHour'"
            :default-dir="'desc'"
            expandable
            :highlight-row-id="focusedRowKey"
          >
            <template #detail="{ row }">
              <div v-if="row.routeRows && row.routeRows.length > 1" class="space-y-2">
                <div>
                  <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                  <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
                </div>
                <div class="overflow-x-auto rounded-md border border-border/60 bg-card">
                  <table class="w-full text-left text-[11px]">
                    <thead class="border-b border-border/60 text-muted-foreground">
                      <tr>
                        <th class="px-2 py-1.5 font-semibold">{{ t('tag.thinking') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('tag.effort') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('tag.temp') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('tag.draft') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('tag.engine') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('cloud.col.pass') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('eff.tt.perHour') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('vega.tt.secSolved') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('cloud.col.run') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="rt in row.routeRows"
                        :key="rt.key"
                        :class="[rt.comparable ? '' : 'opacity-50', rt.shown ? 'bg-primary/5 font-medium' : '']"
                      >
                        <td class="px-2 py-1.5">
                          <span :class="['inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px]',
                                         rt.tags.thinking === 'on' ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground']">
                            {{ rt.tags.thinking || '—' }}
                          </span>
                          <span v-if="rt.shown" class="ml-1 text-[10px] text-primary">&#9664;</span>
                        </td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ rt.tags.effort || '—' }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ rt.tags.temp || '—' }}</td>
                        <td class="px-2 py-1.5">
                          <span :class="['inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px]',
                                         (rt.tags.draft && rt.tags.draft !== 'none') ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground']">
                            {{ rt.tags.draft || '—' }}<template v-if="rt.tags.draft_n && rt.tags.draft_n !== 'n/a'">·{{ rt.tags.draft_n }}</template>
                          </span>
                        </td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ rt.tags.engine || '—' }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">
                          {{ rt.machine }}
                          <span v-if="rt.tags.variant" class="ml-1 rounded bg-muted px-1 text-[10px]">{{ rt.tags.variant }}</span>
                        </td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ rt.n }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ rt.perHour === null ? '—' : rt.perHour.toFixed(1) }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ rt.sec === null ? '—' : Math.round(rt.sec) }}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">{{ rt.run }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <p v-else class="text-[11px] text-muted-foreground">{{ t('fold.variants.none') }}</p>
            </template>
          </DataTable>
        </div>

        <div v-if="incompleteRows.length" class="mt-5 border-t border-border/60 pt-4 space-y-2">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <h3 class="text-sm font-semibold text-muted-foreground">{{ t('runClass.section.incomplete') }}</h3>
              <p class="text-xs text-muted-foreground">{{ t('runClass.section.incompleteDesc') }}</p>
            </div>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('runClass.section.count').replace('{n}', String(incompleteRows.length)) }}
            </span>
          </div>
          <div class="overflow-x-auto rounded-md border border-border/60">
            <table class="w-full text-left text-xs">
              <thead class="border-b border-border/60 text-muted-foreground">
                <tr>
                  <th class="px-2 py-1.5 font-semibold">{{ t('col.modelZh') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('eff.tt.perHour') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('vega.tt.secSolved') }}</th>
                  <th class="px-2 py-1.5 text-right font-semibold">{{ t('cloud.col.pass') }}</th>
                  <th class="px-2 py-1.5 font-semibold">{{ t('cloud.col.run') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in incompleteRows"
                  :key="row.key"
                  class="border-b border-border/40 last:border-0"
                >
                  <td class="px-2 py-1.5 font-mono">
                    {{ row.label }}
                    <span class="ml-1 text-[10px] text-amber-800 dark:text-amber-200">
                      {{ t('runClass.badge.partial').replace('{n}', String(row._nGraded)).replace('{exam}', String(row._nExam)) }}
                    </span>
                  </td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ row.perHour === null ? '—' : (row.perHour as number).toFixed(1) }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ row.sec === null ? '—' : Math.round(row.sec as number) }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ row.n }}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">{{ row.run }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
