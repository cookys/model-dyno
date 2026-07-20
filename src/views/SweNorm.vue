<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardNorm, loading } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { foldedVariantsBadge, modelCell, modelName, orgCell, harnessCell, num } from '@/components/CellHelpers'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import {
  chooseBestNormCell,
  groupByCanonicalModel,
  recordCanonicalModel,
  variantCount as foldedVariantCount,
} from '@/lib/modelFolding'

const { t } = useI18n()

let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)

const isMobile = ref(false)
const chartOpen = ref(true)
let mq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent | MediaQueryList) => { isMobile.value = e.matches; chartOpen.value = !e.matches }

const MIN_COV = 0.5

const nTasks = computed(() => dashboardNorm.value?.n_tasks ?? 0)
const taskSet = computed(() => dashboardNorm.value?.task_set ?? '—')

// plan 023 P4 staleness: the NORM board id-matches verdicts (not version-pinned), so a task
// whose verifier was repaired after the matrix was captured may reuse a stale cloud verdict.
// normalize-bench emits this as structured state — surface it as a banner (/l5 wave-2).
const staleRisk = computed(() =>
  (dashboardNorm.value?.version_aware === false && dashboardNorm.value?.stale_risk) ? dashboardNorm.value.stale_risk : null
)

const rawCells = computed(() => {
  return (dashboardNorm.value?.cells || []).filter(
    (c) => num(c.pass_rate) !== null && Array.isArray(c.ci)
  )
})

const foldedNormGroups = computed(() =>
  groupByCanonicalModel(
    rawCells.value,
    chooseBestNormCell,
    (c) => `${c.model}-${c.source}-${c.harness || ''}-${c.operator || ''}`,
  )
)

const normData = computed(() => {
  // Chart and table data helper
  const seen = new Map<string, number>()
  const dedupLabel = (label: string) => {
    const k = (seen.get(label) || 0) + 1
    seen.set(label, k)
    return k > 1 ? `${label} (#${k})` : label
  }

  return foldedNormGroups.value.map((group) => {
    const c = group.representative
    const mName = modelName(c)
    const canonical = recordCanonicalModel(c)
    return {
      _rec: c,
      chartLabel: dedupLabel(mName),
      publisher: c.publisher || '',
      operator: c.operator || '',
      harness: c.harness || c.access_label || '',
      title: c.model,
      canon: canonical || c.model,
      source: c.source,
      comparable: c.comparable !== false,
      __stale: c.comparable === false,
      eff: +(c.pass_rate * 100).toFixed(1),
      lo: +(c.ci[0] * 100).toFixed(1),
      hi: +(c.ci[1] * 100).toFixed(1),
      n: `${c.n_passed}/${c.n_graded}`,
      cov: c.n_on_set,
      covered: (c.coverage ?? 1) >= MIN_COV,
      rankScore: c.ci[0] * 100,
      variantCount: foldedVariantCount(group),
      variants: group.records.map((v) => ({
        model: modelName(v),
        publisher: v.publisher || '—',
        operator: v.operator || '—',
        harness: v.harness || v.access_label || '—',
        source: v.source || '—',
        n: `${v.n_passed}/${v.n_graded}`,
        cov: `${v.n_on_set}/${nTasks.value}`,
        eff: `${Math.round(v.pass_rate * 100)}%`,
        ci: `[${Math.round(v.ci[0] * 100)}–${Math.round(v.ci[1] * 100)}]`,
        comparable: v.comparable !== false,
      })),
      id: group.key
    }
  })
})

const cols = computed<Column<any>[]>(() => [
  {
    key: 'publisher',
    label: t('col.publisher'),
    sortVal: (r) => r.publisher,
    mobileHide: true,
    render: (r) => orgCell(r.publisher)
  },
  {
    key: 'model',
    label: t('col.modelZh'),
    sortVal: (r) => r.canon,
    render: (r) => {
      const kids = [modelCell(r._rec)]
      if (r.variantCount > 0) {
        kids.push(foldedVariantsBadge(r.variantCount, t))
      }
      return h('span', { class: 'inline-flex flex-wrap items-center gap-1' }, kids)
    }
  },
  {
    key: 'operator',
    label: t('col.operator'),
    sortVal: (r) => r.operator,
    mobileHide: true,
    render: (r) => orgCell(r.operator)
  },
  {
    key: 'harness',
    label: t('col.harness'),
    sortVal: (r) => r.harness,
    mobileHide: true,
    render: (r) => harnessCell(r.harness, t)
  },
  { key: 'n', label: t('col.passedGraded'), mobileHide: true },
  {
    key: 'cov',
    label: t('col.coverage'),
    num: true,
    mobileHide: true,
    render: (r) => `${r.cov}/${nTasks.value}`
  },
  {
    key: 'eff',
    label: t('col.passRateCI'),
    num: true,
    sortVal: (r) => (r.comparable ? 1e6 : 0) + r.eff,
    render: (r) => h('span', {}, [
      h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, `${r.eff.toFixed(0)}%`),
      h('span', { class: 'text-muted-foreground text-xs font-normal ml-1 font-sans' }, `[${r.lo.toFixed(0)}–${r.hi.toFixed(0)}]`)
    ])
  }
])

const drawChart = () => {
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }

  if (!chartContainer.value) return

  // Chart only displays comparable (full exam) cells
  const chartData = normData.value.filter((d) => d.comparable)
  if (!chartData.length) return

  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    background: "transparent",
    autosize: { type: "fit", contains: "padding" },
    config: chartTheme(isDark.value),
    data: { values: chartData },
    width: "container",
    height: { step: 21 },
    encoding: {
      y: {
        field: "chartLabel",
        type: "nominal",
        title: null,
        sort: { field: "rankScore", order: "descending" },
        axis: { labelLimit: 240 }
      },
      opacity: {
        field: "covered",
        type: "nominal",
        scale: { domain: [true, false], range: [1, 0.4] },
        legend: null
      }
    },
    layer: [
      {
        mark: { type: "bar", height: 13, tooltip: true },
        encoding: {
          x: {
            field: "eff",
            type: "quantitative",
            title: t("vega.passRateShared"),
            scale: { domain: [0, 100] }
          },
          color: {
            field: "source",
            type: "nominal",
            title: null,
            scale: { domain: ["local", "cloud"], range: ["#10b981", "#3b82f6"] }, // emerald-500, blue-500
            legend: { orient: "bottom", direction: "horizontal" }
          },
          tooltip: [
            { field: "chartLabel", title: t("vega.tt.model") },
            { field: "source", title: t("vega.tt.where") },
            { field: "n", title: t("vega.tt.passedGraded") },
            { field: "cov", title: t("vega.tt.ofTasks").replace("{n}", String(nTasks.value)) },
            { field: "eff", title: t("vega.tt.passPct"), format: ".1f" },
            { field: "lo", title: t("vega.tt.ciLow"), format: ".0f" },
            { field: "hi", title: t("vega.tt.ciHigh"), format: ".0f" }
          ]
        }
      },
      {
        mark: { type: "rule", color: "#e2e8f0", opacity: 0.6 },
        encoding: {
          x: { field: "lo", type: "quantitative" },
          x2: { field: "hi" }
        }
      },
      {
        mark: { type: "text", align: "left", dx: 5, color: isDark.value ? "#e2e8f0" : "#475569", fontSize: 10, font: "Geist, system-ui, sans-serif" },
        encoding: {
          x: { field: "hi", type: "quantitative" },
          text: { field: "eff", format: ".0f" }
        }
      }
    ]
  }

  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: "svg" })
    .then((res) => {
      vegaView = res.view
    })
    .catch((err) => {
      console.error('Norm chart failed to render:', err)
    })
}

watch([normData, chartContainer, isDark], () => {
  if (normData.value.length && chartContainer.value) {
    drawChart()
  }
}, { immediate: true })

onMounted(() => {
  if (typeof window !== "undefined" && window.matchMedia) {
    mq = window.matchMedia("(max-width: 47.99rem)")
    isMobile.value = mq.matches
    chartOpen.value = !mq.matches
    mq.addEventListener("change", onMq)
  }
  if (normData.value.length && chartContainer.value) {
    drawChart()
  }
})

onUnmounted(() => {
  if (mq) mq.removeEventListener("change", onMq)
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }
})
</script>

<template>
  <div class="space-y-6">
    <ExamVersionBar :switchable="false" />

    <!-- Chart Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('swe.norm.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('swe.norm.scope') }}</p>
        <p class="text-xs text-muted-foreground" v-html="t('swe.norm.desc').replace(/{nTasks}/g, String(nTasks)).replace('{taskSet}', taskSet)"></p>
        <div v-if="staleRisk" class="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span aria-hidden="true">⚠️</span>
          <span><strong>{{ t('swe.norm.staleRisk') }}</strong> {{ staleRisk.reason }}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="h-48 flex items-center justify-center text-muted-foreground text-sm font-mono animate-pulse">
          {{ t('state.rendering') }}
        </div>
        <div v-else-if="!normData.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('empty.normData') }}
        </div>
        <template v-else>
          <button type="button" class="md:hidden w-full mb-2 py-2 text-xs font-medium rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-colors" @click="chartOpen = !chartOpen">
            {{ chartOpen ? t("chart.hide") : t("chart.show") }}
          </button>
          <div v-if="chartOpen" class="w-full overflow-x-auto">
            <div ref="chartContainer" class="w-full"></div>
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Table Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardContent class="pt-6">
        <DataTable
          :columns="cols"
          :rows="normData"
          row-id-key="id"
          :default-sort="'eff'"
          :default-dir="'desc'"
          :expandable="true"
        >
          <template #detail="{ row }">
            <div v-if="row.variantCount > 0" class="space-y-2">
              <div>
                <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
              </div>
              <div class="overflow-x-auto rounded-md border border-border/60 bg-card">
                <table class="w-full text-left text-[11px]">
                  <thead class="border-b border-border/60 text-muted-foreground">
                    <tr>
                      <th class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                      <th class="px-2 py-1.5 font-semibold">{{ t('col.source') }}</th>
                      <th class="px-2 py-1.5 font-semibold">{{ t('col.operator') }}</th>
                      <th class="px-2 py-1.5 font-semibold">{{ t('col.harness') }}</th>
                      <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passedGraded') }}</th>
                      <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.coverage') }}</th>
                      <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="variant in row.variants" :key="`${variant.model}-${variant.source}-${variant.operator}-${variant.harness}`" :class="variant.comparable ? '' : 'opacity-50'">
                      <td class="px-2 py-1.5 font-mono">{{ variant.model }}</td>
                      <td class="px-2 py-1.5 text-muted-foreground">{{ variant.source }}</td>
                      <td class="px-2 py-1.5 text-muted-foreground">{{ variant.operator }}</td>
                      <td class="px-2 py-1.5 text-muted-foreground">{{ variant.harness }}</td>
                      <td class="px-2 py-1.5 text-right font-mono">{{ variant.n }}</td>
                      <td class="px-2 py-1.5 text-right font-mono">{{ variant.cov }}</td>
                      <td class="px-2 py-1.5 text-right font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </DataTable>
      </CardContent>
    </Card>
  </div>
</template>
