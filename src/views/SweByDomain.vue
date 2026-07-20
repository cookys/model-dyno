<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardDomainIndex, loading } from '@/lib/store'
import { isDark, chartTheme, chartBlueScheme } from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const { t } = useI18n()
const examName = computed(() => dashboardDomainIndex.value?.exam ?? '—')
const DOMAIN_ORDER = [
  'backend',
  'frontend',
  'tui',
  'cli',
  'api',
  'data',
  'infra',
  'devops',
  'tests',
  'docs',
  '_unknown',
]
const domainRank = (domain: string) => {
  const idx = DOMAIN_ORDER.indexOf(domain)
  return idx === -1 ? DOMAIN_ORDER.length : idx
}
const domains = computed(() =>
  [...(dashboardDomainIndex.value?.domains ?? [])].sort((a, b) => {
    const ra = domainRank(a)
    const rb = domainRank(b)
    return ra === rb ? a.localeCompare(b) : ra - rb
  })
)
const domainLabel = (domain: string) => {
  const key = `domain.label.${domain}`
  const label = t(key)
  return label === key ? domain : label
}
const domainLabels = computed(() => domains.value.map(domainLabel))

// "took the full exam" = ran ≥ comparable_min of the canonical set (the board's `comparable`
// line, emitted by domain-breakdown so it can't desync from competitiveness). Below that the
// run is partial/abandoned — kept, but in its own section so it never reads as a real score.
const COMPARABLE_MIN = computed(() => dashboardDomainIndex.value?.comparable_min ?? 45)

function group(predicate: (n: number) => boolean) {
  return computed(() =>
    (dashboardDomainIndex.value?.cells ?? [])
      .filter((c) => predicate(c.n ?? 0))
      .map((c) => {
        const passed = Object.values(c.by_domain || {}).reduce((s, v) => s + (v?.passed ?? 0), 0)
        const name = c.model || c.cell
        // score-first so the overall passed/total stays visible even when a long .gguf
        // name truncates; makes weak "complete" runs (e.g. 1/50) obvious at a glance.
        return { c, label: `${passed}/${c.n}  ${name}`, overall: c.n ? passed / c.n : 0 }
      })
      .sort((a, b) => b.overall - a.overall)
  )
}
const completeCells = group((n) => n >= COMPARABLE_MIN.value)
const partialCells = group((n) => n > 0 && n < COMPARABLE_MIN.value)

type DomainPoint = {
  model: string
  domain: string
  domainLabel: string
  acc: number | null
  passed: number | null
  n: number | null
  status: string
  statusShort: string
}

function pointsOf(list: { c: any; label: string }[]) {
  const out: DomainPoint[] = []
  for (const { c, label } of list) {
    for (const dom of domains.value) {
      const vv = c.by_domain?.[dom] as { passed: number; n: number; acc: number | null } | undefined
      if (vv && vv.n > 0 && vv.acc !== null) {
        out.push({
          model: label,
          domain: dom,
          domainLabel: domainLabel(dom),
          acc: +(vv.acc * 100).toFixed(0),
          passed: vv.passed,
          n: vv.n,
          status: t('domain.ran'),
          statusShort: '',
        })
      } else {
        out.push({
          model: label,
          domain: dom,
          domainLabel: domainLabel(dom),
          acc: null,
          passed: null,
          n: null,
          status: t('domain.notRun'),
          statusShort: t('domain.notRunShort'),
        })
      }
    }
  }
  return out
}

const completePoints = computed(() => pointsOf(completeCells.value))
const partialPoints = computed(() => pointsOf(partialCells.value))

const chartComplete = ref<HTMLDivElement | null>(null)
const chartPartial = ref<HTMLDivElement | null>(null)
let viewComplete: any = null
let viewPartial: any = null

function heatmapAria(section: string, cells: { label: string }[]) {
  return t('domain.aria.heatmap')
    .replace('{section}', section)
    .replace('{models}', String(cells.length))
    .replace('{domains}', String(domains.value.length))
    .replace('{exam}', String(examName.value))
}

function cellAria(point: DomainPoint) {
  const base = t('domain.aria.cell')
    .replace('{model}', point.model)
    .replace('{domain}', point.domainLabel)
  if (point.acc === null) {
    return `${base}: ${t('domain.notRun')}`
  }
  return `${base}: ${point.acc}%, ${point.passed}/${point.n}`
}

function domainStatText(c: any, domain: string) {
  const stat = c.by_domain?.[domain]
  if (!stat || stat.n <= 0 || stat.acc === null) return null
  return `${Math.round(stat.acc * 100)}% · ${stat.passed}/${stat.n}`
}

function draw(container: HTMLDivElement | null, points: DomainPoint[], modelOrder: string[], onView: (v: any) => void) {
  if (!container || !points.length) return
  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    background: 'transparent',
    autosize: { type: 'fit', contains: 'padding' },
    config: chartTheme(isDark.value),
    data: { values: points },
    width: 'container',
    height: { step: 22 },
    encoding: {
      x: { field: 'domainLabel', type: 'nominal', sort: [...domainLabels.value], title: null, axis: { labelAngle: -30 } },
      y: { field: 'model', type: 'nominal', sort: [...modelOrder], title: null, axis: { labelLimit: 260, labelFontSize: 11 } },
    },
    layer: [
      {
        mark: { type: 'rect', tooltip: true, stroke: isDark.value ? '#1e293b' : '#f1f5f9', strokeWidth: 1 },
        encoding: {
          color: {
            condition: {
              test: 'datum.acc !== null',
              field: 'acc',
              type: 'quantitative',
              scale: { scheme: chartBlueScheme(isDark.value), domain: [0, 100] },
              legend: { title: t('domain.acc'), orient: 'bottom' },
            },
            value: isDark.value ? '#334155' : '#e2e8f0',
          },
          tooltip: [
            { field: 'model', title: t('vega.tt.modelZh') },
            { field: 'domainLabel', title: t('domain.col.domain') },
            { field: 'status', title: t('domain.tt.status') },
            { field: 'acc', title: t('vega.tt.accuracy'), format: '.0f' },
            { field: 'passed', title: t('domain.tt.passed') },
            { field: 'n', title: t('domain.tt.of') },
          ],
        },
      },
      {
        mark: {
          type: 'text',
          align: 'center',
          baseline: 'middle',
          fontSize: 9,
          color: isDark.value ? '#cbd5e1' : '#475569',
        },
        encoding: {
          text: { field: 'statusShort' },
          opacity: {
            condition: { test: 'datum.acc === null', value: 0.95 },
            value: 0,
          },
        },
      },
    ],
  }
  vegaEmbed(container, spec, { actions: false, renderer: 'svg' })
    .then((res) => onView(res.view))
    .catch((err) => console.error('Domain heatmap failed to render:', err))
}

watch([completePoints, chartComplete, isDark], () => {
  if (viewComplete) { viewComplete.finalize(); viewComplete = null }
  draw(chartComplete.value, completePoints.value, completeCells.value.map((x) => x.label), (v) => { viewComplete = v })
}, { immediate: true })

watch([partialPoints, chartPartial, isDark], () => {
  if (viewPartial) { viewPartial.finalize(); viewPartial = null }
  draw(chartPartial.value, partialPoints.value, partialCells.value.map((x) => x.label), (v) => { viewPartial = v })
}, { immediate: true })

onUnmounted(() => {
  if (viewComplete) { viewComplete.finalize(); viewComplete = null }
  if (viewPartial) { viewPartial.finalize(); viewPartial = null }
})
</script>

<template>
  <div class="space-y-4">
    <!-- 完整:took the full canonical exam -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('domain.title') }} · {{ t('domain.complete') }} ({{ completeCells.length }})
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('domain.subtitle') }} · {{ examName }}</p>
      </CardHeader>
      <CardContent>
        <div v-if="loading && !completePoints.length" class="h-48 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="!completePoints.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('empty.speedData') }}
        </div>
        <div
          v-else
          ref="chartComplete"
          class="w-full"
          role="img"
          :aria-label="heatmapAria(t('domain.complete'), completeCells)"
        ></div>
        <details v-if="completePoints.length" class="mt-3 text-xs">
          <summary class="cursor-pointer text-muted-foreground hover:text-foreground">{{ t('domain.tableFallback') }}</summary>
          <div class="mt-2 overflow-x-auto rounded-md border border-border">
            <table class="w-full text-left" role="table" :aria-label="heatmapAria(t('domain.complete'), completeCells)">
              <thead class="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                  <th v-for="domain in domains" :key="domain" scope="col" class="px-2 py-1.5 font-semibold whitespace-nowrap">
                    {{ domainLabel(domain) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cell in completeCells" :key="cell.c.cell" class="border-t border-border">
                  <th scope="row" class="px-2 py-1.5 font-mono font-medium max-w-56 truncate" :title="cell.label">{{ cell.label }}</th>
                  <td v-for="domain in domains" :key="domain" class="px-2 py-1.5 whitespace-nowrap">
                    <span
                      class="sr-only"
                      :aria-label="cellAria(completePoints.find((p) => p.model === cell.label && p.domain === domain)!)"
                    ></span>
                    <template v-if="domainStatText(cell.c, domain)">
                      {{ domainStatText(cell.c, domain) }}
                    </template>
                    <span v-else class="text-muted-foreground">{{ t('domain.notRun') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>

    <!-- 未跑完:partial / abandoned runs, separated so they aren't read as real scores -->
    <Card v-if="partialCells.length" class="border-border bg-card shadow-lg opacity-90">
      <CardHeader class="pb-2">
        <CardTitle class="text-base font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <span class="w-1.5 h-4.5 bg-amber-500 rounded-full"></span>
          {{ t('domain.partial') }} ({{ partialCells.length }})
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('domain.partial.note') }}</p>
      </CardHeader>
      <CardContent>
        <div
          ref="chartPartial"
          class="w-full"
          role="img"
          :aria-label="heatmapAria(t('domain.partial'), partialCells)"
        ></div>
        <details class="mt-3 text-xs">
          <summary class="cursor-pointer text-muted-foreground hover:text-foreground">{{ t('domain.tableFallback') }}</summary>
          <div class="mt-2 overflow-x-auto rounded-md border border-border">
            <table class="w-full text-left" role="table" :aria-label="heatmapAria(t('domain.partial'), partialCells)">
              <thead class="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                  <th v-for="domain in domains" :key="domain" scope="col" class="px-2 py-1.5 font-semibold whitespace-nowrap">
                    {{ domainLabel(domain) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cell in partialCells" :key="cell.c.cell" class="border-t border-border">
                  <th scope="row" class="px-2 py-1.5 font-mono font-medium max-w-56 truncate" :title="cell.label">{{ cell.label }}</th>
                  <td v-for="domain in domains" :key="domain" class="px-2 py-1.5 whitespace-nowrap">
                    <span
                      class="sr-only"
                      :aria-label="cellAria(partialPoints.find((p) => p.model === cell.label && p.domain === domain)!)"
                    ></span>
                    <template v-if="domainStatText(cell.c, domain)">
                      {{ domainStatText(cell.c, domain) }}
                    </template>
                    <span v-else class="text-muted-foreground">{{ t('domain.notRun') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  </div>
</template>
