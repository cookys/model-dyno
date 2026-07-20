<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardComp, loading } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { foldedRoutesBadge, modelCell, modelName, orgCell, harnessCell, machineCell, num, usageOf, agencyBadge, suspectErrorBadge, usageScenarioBadge } from '@/components/CellHelpers'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import {
  chooseBestCompCell,
  groupByCanonicalModel,
  normalizeCanonicalModel,
  recordCanonicalModel,
  variantCount as foldedVariantCount,
} from '@/lib/modelFolding'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()

const modelFilter = computed(() => {
  const m = route.query.model
  return typeof m === 'string' ? m : null
})

const clearModelFilter = () => {
  router.push({ path: '/swe/comp', query: { ...route.query, model: undefined } })
}

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

const rawCells = computed(() => {
  return (dashboardComp.value?.cells || []).filter((c) => num(c.acc) !== null)
})

const rawCompRows = computed(() => {
  return rawCells.value.map((c) => {
    const accuracy = c.acc
    const speed = num(c.sec_per_solved)
    const usage = usageOf(accuracy, speed)
    const canonical = recordCanonicalModel(c)

    return {
      _rec: c,
      canon: canonical || c.cell,
      publisher: c.publisher || '',
      operator: c.operator || '',
      harness: c.harness || c.access_label || '',
      machine: c.machine || '',
      cell: c.cell,
      source: c.source,
      comparable: c.comparable !== false,
      __stale: c.comparable === false,
      eff: +(accuracy * 100).toFixed(1),
      lo: +(c.ci_lo * 100).toFixed(1),
      hi: +(c.ci_hi * 100).toFixed(1),
      n: `${c.passed}/${c.n}`,
      nRaw: c.n,
      secSolved: speed,
      perHour: num(c.solved_per_hour),
      usage,
      variantCount: 0,
      variants: [],
      id: `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`
    }
  })
})

const foldedCompGroups = computed(() =>
  groupByCanonicalModel(
    rawCells.value,
    chooseBestCompCell,
    (c) => `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
  )
)

const foldedCompRows = computed(() => {
  return foldedCompGroups.value.map((group) => {
    const c = group.representative
    const accuracy = c.acc
    const speed = num(c.sec_per_solved)
    const usage = usageOf(accuracy, speed)
    const canonical = recordCanonicalModel(c)

    return {
      _rec: c,
      canon: canonical || c.cell,
      publisher: c.publisher || '',
      operator: c.operator || '',
      harness: c.harness || c.access_label || '',
      machine: c.machine || '',
      cell: c.cell,
      source: c.source,
      comparable: c.comparable !== false,
      __stale: c.comparable === false,
      eff: +(accuracy * 100).toFixed(1),
      lo: +(c.ci_lo * 100).toFixed(1),
      hi: +(c.ci_hi * 100).toFixed(1),
      n: `${c.passed}/${c.n}`,
      nRaw: c.n,
      secSolved: speed,
      perHour: num(c.solved_per_hour),
      usage,
      variantCount: foldedVariantCount(group),
      variants: group.records.map((v) => ({
        model: modelName(v),
        publisher: v.publisher || '—',
        operator: v.operator || '—',
        harness: v.harness || v.access_label || '—',
        machine: v.machine || '—',
        n: `${v.passed}/${v.n}`,
        eff: `${Math.round(v.acc * 100)}%`,
        ci: `[${Math.round(v.ci_lo * 100)}–${Math.round(v.ci_hi * 100)}]`,
        secSolved: num(v.sec_per_solved) === null ? '—' : `${Math.round(num(v.sec_per_solved)!)}s`,
        comparable: v.comparable !== false,
      })),
      id: group.key,
    }
  })
})

const filteredCompData = computed(() => {
  if (!modelFilter.value) return foldedCompRows.value
  const modelKey = normalizeCanonicalModel(modelFilter.value)
  return rawCompRows.value.filter((r) => normalizeCanonicalModel(recordCanonicalModel(r._rec)) === modelKey)
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
    render: (r) => orgCell(r.publisher)
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
    key: 'secSolved',
    label: t('col.solveSpeed'),
    num: true,
    mobileHide: true,
    tabletHide: true,
    sortVal: (r) => (r.secSolved === null ? Infinity : r.secSolved),
    render: (r) => r.secSolved === null ? '—' : `${Math.round(r.secSolved)}s`
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

  const pts = filteredCompData.value
    .filter((r) => r.comparable && r.secSolved !== null && r.usage)
    .map((r) => ({
      label: modelName(r._rec),
      sec: r.secSolved,
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

watch([filteredCompData, chartContainer, isDark], () => {
  if (filteredCompData.value.length && chartContainer.value) {
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
  if (filteredCompData.value.length && chartContainer.value) {
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

    <!-- Active Filter Alert / Banner -->
    <div v-if="modelFilter" class="flex items-center justify-between gap-4 bg-muted/50 dark:bg-muted/20 border border-border px-4 py-3 rounded-lg shadow-sm">
      <div class="flex items-center gap-2 text-sm text-foreground">
        <span class="text-amber-500 font-bold select-none">🔍</span>
        <span>{{ t('filter.filteredTo') }} <strong class="font-mono bg-muted/80 dark:bg-muted/40 border border-border/80 px-1.5 py-0.5 rounded text-xs">{{ modelFilter }}</strong></span>
      </div>
      <button
        type="button"
        @click="clearModelFilter"
        class="text-xs font-medium text-brand hover:text-brand transition-colors hover:underline cursor-pointer"
      >
        {{ t('filter.clear') }}
      </button>
    </div>

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
        <div v-else-if="!filteredCompData.length" class="text-muted-foreground text-sm p-4 text-center">
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
      <CardContent>
        <DataTable
          :columns="cols"
          :rows="filteredCompData"
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
      </CardContent>
    </Card>
  </div>
</template>
