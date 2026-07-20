<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, h } from 'vue'
import vegaEmbed from 'vega-embed'
import { dashboardRecords, loading, error } from '@/lib/store'
import { useI18n } from '@/lib/i18n'
import { isDark, chartTheme, chartBlueScheme } from '@/lib/theme'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { num } from '@/components/CellHelpers'

const { t } = useI18n()

// Vega Embed instances to finalize on unmount
let vegaView: any = null

const chartContainer = ref<HTMLDivElement | null>(null)

const isMobile = ref(false)
const chartOpen = ref(true)
let mq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent | MediaQueryList) => { isMobile.value = e.matches; chartOpen.value = !e.matches }

// Spec decode data
const SPEC_DECODE_FINDINGS = [
  { machine: "M5 Pro 24GB",  target: "Qwen3-4B-bf16 (dense)",       workload: "realistic, tg512", speedup: 2.19, accept: "5.02/16", win: true,  note: "specdecode.note.bestApple" },
  { machine: "M4 Max 36GB",  target: "Qwen3-4B-bf16 (dense)",       workload: "realistic, tg512", speedup: 1.92, accept: "5.33/16", win: true,  note: "" },
  { machine: "M4 Pro 24GB",  target: "Qwen3-4B-bf16 (dense)",       workload: "realistic, tg512", speedup: 1.71, accept: "5.33/16", win: true,  note: "" },
  { machine: "M5 Pro 24GB",  target: "Qwen3-4B-bf16 (dense)",       workload: "filler, tg128",    speedup: 1.14, accept: "2.65/16", win: true,  note: "specdecode.note.netPositive" },
  { machine: "M5 Pro 24GB",  target: "Qwen3-Coder-30B-A3B (MoE)",   workload: "realistic, tg512", speedup: 0.86, accept: "6.63/16", win: false, note: "specdecode.note.narrowed" },
  { machine: "M4 Pro 24GB",  target: "Qwen3-Coder-30B-A3B (MoE)",   workload: "realistic, tg512", speedup: 0.76, accept: "6.34/16", win: false, note: "" },
]

const specDecodeCols = computed<Column<any>[]>(() => [
  { key: 'machine', label: t('col.machine') },
  { key: 'target', label: t('col.target'), mobileHide: true },
  { key: 'workload', label: t('col.prompt'), mobileHide: true },
  {
    key: 'speedup',
    label: t('col.dflashSpeedup'),
    num: true,
    render: (r) => h(
      'span',
      {
        class: r.win
          ? 'text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/30 bg-emerald-950/20 px-2 py-0.5 rounded'
          : 'text-muted-foreground border border-border bg-muted/40 px-2 py-0.5 rounded'
      },
      `${r.win ? '✅' : '❌'} ${r.speedup.toFixed(2)}×`
    )
  },
  { key: 'accept', label: t('col.accept'), mobileHide: true },
  { key: 'note', label: t('col.note'), mobileHide: true, render: (r) => r.note ? t(r.note) : '—' }
])

const drawChart = () => {
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }

  if (!chartContainer.value) return

  const data = dashboardRecords.value
    .filter((r) => r.profile && r.tier && r.model_alias && num(r.tg128_tps) !== null)
    .map((r) => ({
      profile: r.profile,
      cell: `${r.tier} · ${r.model_alias}`,
      tier: r.tier,
      tg: r.tg128_tps,
      backend: r.test_backend || ""
    }))

  if (!data.length) return

  // Threshold cutoff for the overlaid text color: mirror the Vega `max(tg) per (profile,cell)`
  // aggregate so we know the best_tg extent, then pick a hard cutoff. Binary dark/white text
  // (no interpolated 3-stop ramp → no unreadable gray on mid-blue fills). Cutoff tracks where the
  // (possibly reversed) blues fill crosses light↔dark: light mode leans high (0.6, mostly dark text),
  // dark mode mirrors (0.4).
  const bestByGroup = new Map<string, number>()
  for (const d of data) {
    const k = `${d.profile}|${d.cell}`
    const v = Number(d.tg)
    if (!bestByGroup.has(k) || v > (bestByGroup.get(k) as number)) bestByGroup.set(k, v)
  }
  const bestVals = [...bestByGroup.values()]
  const lo = Math.min(...bestVals), hi = Math.max(...bestVals)
  const textCut = lo + (hi - lo) * (isDark.value ? 0.4 : 0.6)

  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    background: "transparent",
    autosize: { type: "fit", contains: "padding" },
    config: chartTheme(isDark.value),
    data: { values: data },
    transform: [{ aggregate: [{ op: "max", field: "tg", as: "best_tg" }], groupby: ["profile", "cell"] }],
    width: "container",
    height: { step: 30 },
    encoding: {
      x: { field: "profile", type: "nominal", title: null, axis: { labelAngle: -30, labelLimit: 130 } },
      y: { field: "cell", type: "nominal", title: null, axis: { labelLimit: 130 } }
    },
    layer: [
      {
        mark: { type: "rect", tooltip: true },
        encoding: {
          color: {
            field: "best_tg",
            type: "quantitative",
            title: null,
            scale: { scheme: chartBlueScheme(isDark.value) },
            legend: { orient: "bottom", direction: "horizontal" }
          },
          tooltip: [
            { field: "profile", title: t("vega.tt.machine") },
            { field: "cell", title: t("vega.tt.model") },
            { field: "best_tg", title: t("vega.tt.bestTg128"), format: ".1f" }
          ]
        }
      },
      {
        mark: { type: "text", fontSize: 11, font: "Geist, system-ui, sans-serif", fontWeight: "semibold" },
        encoding: {
          text: { field: "best_tg", type: "quantitative", format: ".1f" },
          color: {
            field: "best_tg",
            type: "quantitative",
            legend: null,
            // Threshold (hard cutoff), NOT an interpolated range — mid cells would otherwise get gray
            // text on mid-blue fill. Text tracks the (mode-dependent) fill lightness: light mode fill
            // is low→light/high→dark, so below cutoff = dark text, above = white. Dark mode reverses
            // the fill (extent:[1,0]) → below cutoff = white text, above = dark.
            scale: {
              type: "threshold",
              domain: [textCut],
              range: isDark.value ? ["#ffffff", "#020617"] : ["#020617", "#ffffff"]
            }
          }
        }
      }
    ]
  }

  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: "svg" })
    .then((result) => {
      vegaView = result.view
    })
    .catch((err) => {
      console.error('Vega Heatmap rendering failed:', err)
    })
}

watch([dashboardRecords, chartContainer, isDark], () => {
  if (dashboardRecords.value.length && chartContainer.value) {
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
  if (dashboardRecords.value.length && chartContainer.value) {
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
    <!-- Heatmap Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('idx.heatmap.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">
          {{ t('idx.heatmap') }}
        </p>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="h-48 flex items-center justify-center text-muted-foreground text-sm font-mono animate-pulse">
          {{ t('state.rendering') }}
        </div>
        <div v-else-if="error" class="text-destructive text-sm p-4">
          {{ t('error.prefix') }}{{ error }}
        </div>
        <div v-else-if="!dashboardRecords.length" class="text-muted-foreground text-sm p-4">
          {{ t('empty.heatmap') }}
        </div>
        <template v-else>
          <button type="button" class="md:hidden w-full mb-2 py-2 text-xs font-medium rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-colors" @click="chartOpen = !chartOpen">
            {{ chartOpen ? t("chart.hide") : t("chart.show") }}
          </button>
          <div v-if="chartOpen" class="w-full overflow-x-auto min-h-[200px]">
            <div ref="chartContainer" class="w-full"></div>
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Spec-decode Findings Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('idx.specdecode.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground leading-relaxed">
          {{ t('col.note') }}: {{ t('idx.specdecode.desc') }}
        </p>
      </CardHeader>
      <CardContent>
        <DataTable
          :columns="specDecodeCols"
          :rows="SPEC_DECODE_FINDINGS"
          row-id-key="target"
          :expandable="true"
          :default-sort="'speedup'"
          :default-dir="'desc'"
        />
      </CardContent>
    </Card>
  </div>
</template>
