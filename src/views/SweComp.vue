<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardComp, loading } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { foldedRoutesBadge, modelCell, modelName, orgCell, harnessCell, machineCell, num, usageOf, agencyBadge, suspectErrorBadge, usageScenarioBadge, speedCredibilityBadge, runClassBadge } from '@/components/CellHelpers'
import { primarySolveSecOf, examCostSecOf } from '@/lib/speedMetrics'
import { classifyCell, partitionBySection } from '@/lib/runClass'
import { resolveExamMeta } from '@/lib/examMeta'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import {
  chooseBestCompCell,
  groupByCanonicalModel,
  normalizeCanonicalModel,
  recordCanonicalModel,
} from '@/lib/modelFolding'

import { useBoardFilter } from '@/lib/useBoardFilter'
import BoardFilterBanner from '@/components/BoardFilterBanner.vue'

const { t } = useI18n()
const boardFilter = useBoardFilter()

const route = useRoute()

const modelFilter = computed(() => {
  const m = route.query.model
  return typeof m === 'string' ? m : null
})

let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)

// The 2D scatter is a desktop analysis view — cramped + redundant on a phone (the
// table's Usage column carries the same classification). Collapse it by default on
// mobile so the page leads with the data, not a tall low-value chart.
const isMobile = ref(false)
const chartOpen = ref(true)
let mq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent | MediaQueryList) => { isMobile.value = e.matches; chartOpen.value = !e.matches }

const examName = computed(() => dashboardComp.value?.exam ?? '—')

/** plan 053: exam size SSOT from index (not max(cell.n)). */
const examMeta = computed(() => resolveExamMeta(dashboardComp.value))

const rawCells = computed(() => {
  return (dashboardComp.value?.cells || []).filter((c) => num(c.acc) !== null && !c.frozen)
})

function mapCompRow(c: any, group?: { records: any[]; key: string }) {
  const accuracy = c.acc
  const speed = primarySolveSecOf(c)
  const usage = usageOf(accuracy, speed)
  const canonical = recordCanonicalModel(c)
  const cls = classifyCell(c, examMeta.value)
  const records = group?.records || [c]
  return {
    _rec: c,
    canon: canonical || c.cell,
    publisher: c.publisher || '',
    operator: c.operator || '',
    harness: c.harness || c.access_label || '',
    machine: c.machine || '',
    cell: c.cell,
    source: c.source,
    comparable: cls.rankable,
    __stale: !cls.rankable,
    _section: cls.section,
    _nGraded: cls.n,
    _nExam: cls.nExam,
    _owed: cls.owed,
    eff: +(accuracy * 100).toFixed(1),
    lo: +(c.ci_lo * 100).toFixed(1),
    hi: +(c.ci_hi * 100).toFixed(1),
    n: `${c.passed}/${c.n}`,
    nRaw: c.n,
    secSolved: speed,
    secAll: examCostSecOf(c),
    perHour: num(c.solved_per_hour),
    usage,
    variantCount: group ? Math.max(0, records.length - 1) : 0,
    variants: (group ? records : []).map((v: any) => ({
      model: modelName(v),
      publisher: v.publisher || '—',
      operator: v.operator || '—',
      harness: v.harness || v.access_label || '—',
      machine: v.machine || '—',
      n: `${v.passed}/${v.n}`,
      eff: `${Math.round(v.acc * 100)}%`,
      ci: `[${Math.round(v.ci_lo * 100)}–${Math.round(v.ci_hi * 100)}]`,
      secSolved: primarySolveSecOf(v) === null ? '—' : `${Math.round(primarySolveSecOf(v)!)}s`,
      comparable: classifyCell(v, examMeta.value).rankable,
    })),
    id: group?.key || `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
  }
}

const rawCompRows = computed(() => rawCells.value.map((c) => mapCompRow(c)))

const foldedCompGroups = computed(() =>
  groupByCanonicalModel(
    rawCells.value,
    chooseBestCompCell,
    (c) => `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
  )
)

const foldedCompRows = computed(() =>
  foldedCompGroups.value.map((group) => mapCompRow(group.representative, group))
)

/** plan 053: fold first, then partition representatives into main vs incomplete. */
const filteredCompData = computed(() => {
  if (modelFilter.value) {
    const modelKey = normalizeCanonicalModel(modelFilter.value)
    return rawCompRows.value.filter((r) => normalizeCanonicalModel(recordCanonicalModel(r._rec)) === modelKey)
  }
  // A vendor-family filter narrows the FOLDED view: one row per model in the family, so
  // grok-4.5 / 4.6 / build / composer compare side by side. Drilling into one model then
  // still opens its routes via the ?model= branch above.
  if (!boardFilter.filters.value.length) return foldedCompRows.value
  return boardFilter.applyTo(foldedCompRows.value, (r) => r._rec)
})

const mainCompData = computed(() =>
  partitionBySection(filteredCompData.value, (r) => r._section).main
)
const incompleteCompData = computed(() => {
  const inc = partitionBySection(filteredCompData.value, (r) => r._section).incomplete
  // Among incomplete: larger n first, then acc (not a ranked leaderboard chrome)
  return [...inc].sort((a, b) => (b.nRaw || 0) - (a.nRaw || 0) || (b.eff || 0) - (a.eff || 0))
})

const usageLegend = computed(() => [
  usageOf(0.75, 120),
  usageOf(0.6, 120),
  usageOf(0.6, 420),
  usageOf(0.3, 120),
].filter(Boolean))

const UsageBadge = {
  props: ['usage'],
  setup(props: any) {
    return () => props.usage ? usageScenarioBadge(props.usage) : null
  },
}

const cols = computed<Column<any>[]>(() => [
  {
    key: 'publisher',
    label: t('col.publisher'),
    sortVal: (r) => r.publisher,
    mobileHide: true,
    tabletHide: true,
    render: (r) => orgCell(r.publisher, r.publisher ? () => boardFilter.filterByPublisher(r.publisher) : undefined)
  },
  {
    key: 'model',
    label: t('col.modelGroup'),
    sortVal: (r) => r.canon,
    render: (r) => {
      const kids = [modelCell(r._rec)]
      if (r.variantCount > 0) {
        kids.push(foldedRoutesBadge(r.variantCount, t))
      }
      if (r._section === 'incomplete') {
        kids.push(runClassBadge({
          section: r._section,
          n: r._nGraded,
          nExam: r._nExam,
          owed: r._owed,
        }) as any)
      }
      return h('span', { class: 'inline-flex flex-wrap items-center gap-1' }, kids)
    }
  },
  {
    key: 'operator',
    label: t('col.operator'),
    sortVal: (r) => r.operator,
    mobileHide: true,
    tabletHide: true,
    render: (r) => orgCell(r.operator)
  },
  {
    key: 'harness',
    label: t('col.harness'),
    sortVal: (r) => r.harness,
    mobileHide: true,
    tabletHide: true,
    render: (r) => harnessCell(r.harness, t)
  },
  {
    key: 'machine',
    label: t('col.machineSwe'),
    sortVal: (r) => r.machine,
    mobileHide: true,
    render: (r) => machineCell(r.machine)
  },
  { key: 'n', label: t('col.passed50'), mobileHide: true },
  {
    key: 'eff',
    label: t('col.passRateCI'),
    num: true,
    sortVal: (r) => (r.comparable ? 1e6 : 0) + r.eff,
    render: (r) => h('span', {}, [
      h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, `${r.eff.toFixed(0)}%`),
      h('span', { class: 'text-muted-foreground text-xs font-normal ml-1 font-sans' }, `[${r.lo.toFixed(0)}–${r.hi.toFixed(0)}]`),
      r._rec.suspect_error_count > 0
        ? h('span', { class: 'ml-2 inline-flex align-middle' }, [suspectErrorBadge(r._rec.suspect_error_count, t)])
        : null
    ])
  },
  {
    // plan 052: primary = med_wall_pass; sort comparable → med_wall_pass asc → acc desc
    key: 'secSolved',
    label: t('col.solveSpeedPass'),
    num: true,
    mobileHide: true,
    tabletHide: true,
    // Encode multi-key as single number (DataTable num sort): comparable → med_wall_pass → −acc
    sortVal: (r) => {
      const comp = r.comparable ? 0 : 1
      const sp = r.secSolved === null ? 1e12 : r.secSolved
      const accPenalty = typeof r.eff === 'number' ? (100 - r.eff) : 100
      return comp * 1e15 + sp * 1e3 + accPenalty
    },
    render: (r) => {
      if (r.secSolved === null) return '—'
      const kids = [
        h('span', { class: 'font-mono' }, `${Math.round(r.secSolved)}s`),
        speedCredibilityBadge(r._rec?.speed_credibility),
      ]
      if (r.secAll !== null && r.secAll !== r.secSolved) {
        kids.push(h('span', {
          class: 'ml-1 text-[10px] text-muted-foreground font-normal',
          title: t('table.tip.secSolvedAll'),
        }, `(${t('col.solveSpeedAllShort')} ${Math.round(r.secAll)}s)`))
      }
      return h('span', { class: 'inline-flex flex-wrap items-center' }, kids)
    },
  },
  {
    key: 'usage',
    label: t('col.usage'),
    mobileHide: true,
    sortVal: (r) => (r.usage ? r.usage.rank : 99),
    render: (r) => r.usage ? usageScenarioBadge(r.usage) : '—'
  },
  {
    // credibility: is a low score the model, the env, or the tools? (no-op / infra / cap)
    // same chip the SWE scorecard shows — was missing on the COMP board (/l5 wave-2).
    key: 'agency',
    label: t('col.agency'),
    mobileHide: true,
    sortVal: (r) => r._rec.agency?.noop_pct ?? -1,
    render: (r) => agencyBadge(r._rec.agency, r._rec)
  }
])

const drawChart = () => {
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }

  if (!chartContainer.value) return

  const pts = mainCompData.value
    .filter((r) => r.comparable && r.secSolved !== null && r.usage)
    .map((r) => ({
      label: modelName(r._rec),
      sec: r.secSolved, // pass-conditioned med_wall_pass (speed-axis: med_wall_pass@052)
      acc: r.eff,
      usage: r.usage!.label,
      machine: r.machine || 'cloud',
      n: r.n
    }))

  if (!pts.length) return

  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    background: "transparent",
    autosize: { type: "fit", contains: "padding" },
    config: chartTheme(isDark.value),
    data: { values: pts },
    width: "container",
    height: 340,
    layer: [
      {
        mark: { type: "rule", color: isDark.value ? "#475569" : "#cbd5e1", strokeDash: [4, 4] },
        encoding: { x: { datum: 300 } }
      },
      {
        mark: { type: "rule", color: isDark.value ? "#475569" : "#cbd5e1", strokeDash: [4, 4] },
        encoding: { y: { datum: 50 } }
      },
      {
        mark: { type: "point", filled: true, size: 90, opacity: 0.85, tooltip: true },
        encoding: {
          x: {
            field: "sec",
            type: "quantitative",
            scale: { type: "log" },
            title: t("vega.solveSpeedAxis")
          },
          y: {
            field: "acc",
            type: "quantitative",
            scale: { domain: [0, 100] },
            title: t("vega.accuracyAxis")
          },
          color: {
            field: "usage",
            type: "nominal",
            title: null,
            // legend below the plot (horizontal) instead of stealing width on the right
            legend: { orient: "bottom", direction: "horizontal", columns: 4, labelLimit: 80, symbolSize: 80 },
            scale: {
              domain: [t("usage.allround"), t("usage.pair"), t("usage.background"), t("usage.lowacc")],
              range: ["#10b981", "#3b82f6", "#f59e0b", "#64748b"] // emerald, blue, amber, slate
            }
          },
          tooltip: [
            { field: "label", title: t("vega.tt.modelZh") },
            { field: "usage", title: t("vega.tt.usage") },
            { field: "acc", title: t("vega.tt.accuracy"), format: ".0f" },
            { field: "sec", title: t("vega.tt.secSolved"), format: ".0f" },
            { field: "machine", title: t("vega.tt.machineZh") }
          ]
        }
      }
    ]
  }

  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: "svg" })
    .then((res) => {
      vegaView = res.view
    })
    .catch((err) => {
      console.error('Usage scatter chart failed to render:', err)
    })
}

watch([mainCompData, chartContainer, isDark], () => {
  if (mainCompData.value.length && chartContainer.value) {
    drawChart()
  }
}, { immediate: true })

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(max-width: 47.99rem)')
    isMobile.value = mq.matches
    chartOpen.value = !mq.matches // collapsed on mobile by default
    mq.addEventListener('change', onMq)
  }
  if (mainCompData.value.length && chartContainer.value) {
    drawChart()
  }
})

onUnmounted(() => {
  if (mq) mq.removeEventListener('change', onMq)
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }
})
</script>

<template>
  <div class="space-y-6">
    <ExamVersionBar :switchable="false" />

    <BoardFilterBanner :filter="boardFilter.active.value" @clear="boardFilter.clearFilter" />

    <!-- Chart Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('swe.usageScatter.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('swe.comp.scope') }}</p>
        <p class="text-xs text-muted-foreground" v-html="t('swe.comp.desc1')"></p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span class="font-semibold">{{ t('usage.legend') }}</span>
          <span
            v-for="usage in usageLegend"
            :key="usage!.label"
            class="inline-flex items-center gap-1.5"
          >
            <UsageBadge :usage="usage" />
            <span>{{ usage!.label }}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="h-48 flex items-center justify-center text-muted-foreground text-sm font-mono animate-pulse">
          {{ t('state.rendering') }}
        </div>
        <div v-else-if="!mainCompData.length && !incompleteCompData.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('empty.speedData') }}
        </div>
        <template v-else>
          <!-- mobile-only toggle: the chart is collapsed by default on a phone -->
          <button
            type="button"
            class="md:hidden w-full mb-2 py-2 text-xs font-medium rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            @click="chartOpen = !chartOpen"
          >
            {{ chartOpen ? t('chart.hide') : t('chart.show') }}
          </button>
          <div v-if="chartOpen" class="w-full">
            <div ref="chartContainer" class="w-full"></div>
            <p class="mt-2 text-xs text-muted-foreground">
              <RouterLink to="/speed/cloud" class="text-brand hover:underline hover:text-brand">
                {{ t('crosslink.toSpeedCloud') }}
              </RouterLink>
            </p>
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Table Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('swe.comp.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('swe.comp.scope') }}</p>
        <p class="text-xs text-muted-foreground" v-html="t('swe.comp.desc2').replace('{examName}', examName)"></p>
      </CardHeader>
      <CardContent class="space-y-5">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h3 class="text-sm font-semibold text-foreground">{{ t('runClass.section.main') }}</h3>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('runClass.section.count').replace('{n}', String(mainCompData.length)) }}
            </span>
          </div>
          <DataTable
            v-if="mainCompData.length"
            :columns="cols"
            :rows="mainCompData"
            row-id-key="id"
            :default-sort="'eff'"
            :default-dir="'desc'"
            :expandable="true"
            fixed-layout
          >
            <template #detail="{ row }">
              <div v-if="row.variantCount > 0" class="space-y-2">
                <div>
                  <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                  <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
                </div>
                <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
                  <table class="w-full text-left text-[11px]">
                    <thead class="border-b border-border/60 text-muted-foreground">
                      <tr>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.operator') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.harness') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passed50') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.solveSpeed') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="variant in row.variants" :key="`${variant.model}-${variant.operator}-${variant.harness}-${variant.machine}`" :class="variant.comparable ? '' : 'opacity-50'">
                        <td class="px-2 py-1.5 font-mono">{{ variant.model }}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">{{ variant.operator }}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">{{ variant.harness }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.machine }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.n }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.secSolved }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="grid grid-cols-1 gap-2 md:hidden">
                  <div
                    v-for="variant in row.variants"
                    :key="`${variant.model}-${variant.operator}-${variant.harness}-${variant.machine}-card`"
                    :class="[
                      'rounded-md border border-border/60 bg-card p-2.5 text-xs',
                      variant.comparable ? '' : 'opacity-50',
                    ]"
                  >
                    <div class="break-words font-mono font-semibold text-foreground">{{ variant.model }}</div>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div class="text-muted-foreground">{{ t('col.operator') }}</div>
                        <div class="break-words">{{ variant.operator }}</div>
                      </div>
                      <div>
                        <div class="text-muted-foreground">{{ t('col.harness') }}</div>
                        <div class="break-words">{{ variant.harness }}</div>
                      </div>
                      <div>
                        <div class="text-muted-foreground">{{ t('col.machineSwe') }}</div>
                        <div class="font-mono">{{ variant.machine }}</div>
                      </div>
                      <div>
                        <div class="text-muted-foreground">{{ t('col.passRateCI') }}</div>
                        <div class="font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></div>
                      </div>
                      <div>
                        <div class="text-muted-foreground">{{ t('col.passed50') }}</div>
                        <div class="font-mono">{{ variant.n }}</div>
                      </div>
                      <div>
                        <div class="text-muted-foreground">{{ t('col.solveSpeed') }}</div>
                        <div class="font-mono">{{ variant.secSolved }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </DataTable>
          <div v-else class="text-muted-foreground text-sm p-3 text-center">{{ t('empty.speedData') }}</div>
        </div>

        <!-- plan 053: incomplete section — not a second leaderboard (no rank chrome) -->
        <div v-if="incompleteCompData.length" class="border-t border-border/60 pt-4 space-y-2">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <h3 class="text-sm font-semibold text-muted-foreground">{{ t('runClass.section.incomplete') }}</h3>
              <p class="text-xs text-muted-foreground">{{ t('runClass.section.incompleteDesc') }}</p>
            </div>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('runClass.section.count').replace('{n}', String(incompleteCompData.length)) }}
            </span>
          </div>
          <DataTable
            :columns="cols"
            :rows="incompleteCompData"
            row-id-key="id"
            :default-sort="'nRaw'"
            :default-dir="'desc'"
            :expandable="true"
            fixed-layout
          >
            <template #detail="{ row }">
              <div v-if="row.variantCount > 0" class="space-y-2">
                <div>
                  <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                  <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
                </div>
                <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
                  <table class="w-full text-left text-[11px]">
                    <thead class="border-b border-border/60 text-muted-foreground">
                      <tr>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.operator') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.harness') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passed50') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.solveSpeed') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="variant in row.variants" :key="`${variant.model}-${variant.operator}-${variant.harness}-${variant.machine}`" :class="variant.comparable ? '' : 'opacity-50'">
                        <td class="px-2 py-1.5 font-mono">{{ variant.model }}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">{{ variant.operator }}</td>
                        <td class="px-2 py-1.5 text-muted-foreground">{{ variant.harness }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.machine }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.n }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.secSolved }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </DataTable>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
