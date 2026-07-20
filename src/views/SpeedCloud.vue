<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch, h } from 'vue'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardComp, loading } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import { RouterLink } from 'vue-router'
import DataTable from '@/components/DataTable.vue'
import type { Column, DetailField } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { modelBadges, modelName, num } from '@/components/CellHelpers'
import { deploymentLine, routeProvenanceOf } from '@/lib/modelProvenance'

const { t } = useI18n()
let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)
const tableContainer = ref<any>(null)
const focusedCloudRowId = ref<string | null>(null)
const tableFlash = ref(false)
let tableFlashTimer: ReturnType<typeof setTimeout> | null = null

const examName = computed(() => dashboardComp.value?.exam ?? '—')
const placementFilter = ref<'all' | 'cloud' | 'local'>('all')
const placementOptions = ['all', 'cloud', 'local'] as const
const setPlacementFilter = (value: 'all' | 'cloud' | 'local') => {
  placementFilter.value = value
}

// abbreviate token counts: 273480 → "273K", 1021185 → "1.0M"
function ktok(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`
  return `${Math.round(v)}`
}

function fmt1(v: number | null): string {
  return v === null ? '—' : v.toFixed(1)
}

function fmt0(v: number | null): string {
  return v === null ? '—' : String(Math.round(v))
}

function compactModelCell(c: any) {
  const badges = modelBadges(c)
  return h('span', { class: 'flex min-w-0 flex-col items-start gap-1' }, [
    h('span', {
      class: 'min-w-0 break-words font-mono font-medium leading-snug text-foreground',
      title: (c && (c.cell || c.profile || c.model)) || '',
    }, modelName(c)),
    badges,
  ].filter(Boolean))
}

function placementOf(c: any): 'cloud' | 'local' {
  const tag = String(c?.tags?.placement || '').toLowerCase()
  if (tag === 'local') return 'local'
  if (tag === 'cloud' || tag === 'remote') return 'cloud'
  if (c?.billing === 'local' || c?.machine) return 'local'
  return 'cloud'
}

function placementLabel(source: 'cloud' | 'local'): string {
  return source === 'local' ? t('swe.source.local') : t('swe.source.cloud')
}

function placementClass(source: 'cloud' | 'local'): string {
  return source === 'local'
    ? 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20'
    : 'text-brand border-brand/30 bg-brand/10 dark:bg-brand/20'
}

const canonicalN = computed(() => {
  const ns = (dashboardComp.value?.cells || [])
    .map((c) => num(c.n))
    .filter((n): n is number => n !== null)
  return ns.length ? Math.max(...ns) : null
})

// Agentic SWE cells, cloud + local. Raw decode columns are still shown when a
// tool-free probe exists, but the main speed metric is end-to-end agentic t/s.
const agenticData = computed(() =>
  (dashboardComp.value?.cells || [])
    .filter((c) => num(c.acc) !== null)
    .map((c) => {
      const source = placementOf(c)
      const n = num(c.n)
      const fullN = canonicalN.value
      const coverage = n !== null && fullN ? n / fullN : null
      const provenance = routeProvenanceOf(c)
      const row = {
        _rec: c,
        label: (c.identity && c.identity.canonical_model) || c.model || c.cell,
        source,
        sourceLabel: placementLabel(source),
        eff: +(c.acc * 100).toFixed(1),
        lo: +(c.ci_lo * 100).toFixed(0),
        hi: +(c.ci_hi * 100).toFixed(0),
        solved: `${c.passed}/${c.n}`,
        run: n !== null && fullN ? `${n}/${fullN}` : (n === null ? '—' : String(n)),
        complete: n !== null && fullN !== null && n >= fullN,
        coverage,
        sec: num(c.sec_per_solved),
        perHour: num(c.solved_per_hour),
        perMin: num(c.solved_per_hour) === null ? null : num(c.solved_per_hour)! / 60,
        medWall: num(c.med_wall),
        tokS: num(c.agentic_tok_s),
        tokSolved: num(c.tok_per_solved) ?? (num(c.agentic_tok_s) !== null && num(c.sec_per_solved) !== null
          ? num(c.agentic_tok_s)! * num(c.sec_per_solved)!
          : null),
        ctx: num(c.med_in_tok),
        rawTokS: num(c.raw_tok_s),
        latency: num(c.raw_latency_s),
        ...provenance,
        id: `${c.cell}-${c.source}-${c.machine || ''}`,
      }
      return row
    })
)

const cloudData = computed(() => {
  if (placementFilter.value === 'all') return agenticData.value
  return agenticData.value.filter((r) => r.source === placementFilter.value)
})

const fullData = computed(() => cloudData.value.filter((r) => r.complete))
const partialData = computed(() =>
  cloudData.value
    .filter((r) => !r.complete)
    .map((r) => ({ ...r, __stale: true }))
)
const leaderRows = computed(() =>
  [...fullData.value]
    .filter((r) => r.perMin !== null)
    .sort((a, b) => (b.perMin ?? -1) - (a.perMin ?? -1))
    .slice(0, 3)
)

const focusCloudRoute = (id: string) => {
  focusedCloudRowId.value = id
  nextTick(() => {
    const el = tableContainer.value instanceof HTMLElement ? tableContainer.value : tableContainer.value?.$el
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    tableFlash.value = true
    if (tableFlashTimer) clearTimeout(tableFlashTimer)
    tableFlashTimer = setTimeout(() => {
      tableFlash.value = false
      tableFlashTimer = null
    }, 1200)
  })
}

const cols = computed<Column<any>[]>(() => [
  { key: 'model', label: t('col.modelGroup'), sortVal: (r) => r.label, render: (r) => compactModelCell(r._rec) },
  {
    key: 'route', label: t('cloud.col.route'), mobileHide: true,
    sortVal: (r) => `${r.source}-${r.coverage ?? 0}`,
    render: (r) => h('span', { class: 'inline-flex flex-col items-start gap-1' }, [
      h('span', {
        class: `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${placementClass(r.source)}`,
        title: r._rec.machine || r._rec.harness || r._rec.billing || r.source,
      }, r.sourceLabel),
      h('span', {
        class: r.complete ? 'font-mono text-[10px] text-muted-foreground' : 'font-mono text-[10px] text-amber-700 dark:text-amber-400',
      }, `${r.run} · ${r.complete ? t('cloud.run.full') : t('cloud.run.partial')}`),
      h('span', {
        class: 'max-w-[10rem] break-words text-[10px] leading-snug text-muted-foreground',
        title: deploymentLine(r),
      }, deploymentLine(r)),
    ]),
  },
  {
    key: 'eff', label: t('cloud.col.pass'), num: true, sortVal: (r) => r.eff,
    render: (r) => h('span', { class: 'inline-flex flex-col items-end gap-0.5' }, [
      h('span', { class: 'font-mono font-semibold text-emerald-700 dark:text-emerald-400' }, `${r.eff.toFixed(0)}%`),
      h('span', { class: 'text-[10px] text-muted-foreground' }, `${r.solved}`),
    ]),
  },
  {
    key: 'perMin', label: t('cloud.col.solve'), num: true,
    description: t('cloud.tip.primary'),
    sortVal: (r) => (r.perMin === null ? -1 : r.perMin),
    render: (r) => h('span', { class: 'inline-flex flex-col items-end gap-0.5' }, [
      h('span', { class: 'font-mono text-base font-bold text-emerald-700 dark:text-emerald-400' }, fmt1(r.perMin)),
      h('span', { class: 'text-[10px] text-muted-foreground' }, t('cloud.primary.unit')),
    ]),
  },
  {
    key: 'tokS', label: t('cloud.col.agenticTokS'), num: true,
    mobileHide: true,
    description: t('cloud.tip.agenticTokS'),
    sortVal: (r) => (r.tokS === null ? -1 : r.tokS),
    render: (r) => h('span', { class: 'inline-flex flex-col items-end gap-0.5' }, [
      h('span', { class: 'font-mono' }, fmt0(r.tokS)),
      h('span', { class: 'text-[10px] text-muted-foreground' }, `${ktok(r.tokSolved)}/✓`),
    ]),
  },
  {
    key: 'sec', label: t('cloud.col.avgSolve'), num: true,
    mobileHide: true,
    description: t('cloud.tip.avgSolve'),
    sortVal: (r) => (r.sec === null ? Infinity : r.sec),
    render: (r) => h('span', { class: 'font-mono' }, fmt0(r.sec)),
  },
])

const routeDetailFields = computed<DetailField<any>[]>(() => [
  { key: 'route', label: t('cloud.detail.route'), value: (r) => deploymentLine(r), wide: true },
  { key: 'provider', label: t('cloud.detail.provider'), href: (r) => r.provider_url || null, hrefKey: 'provider_url' },
  { key: 'route_kind', label: t('cloud.detail.access'), href: (r) => r.route_url || null, hrefKey: 'route_url' },
  { key: 'harness', label: t('cloud.detail.harness'), href: (r) => r.harness_url || null, hrefKey: 'harness_url' },
  {
    key: 'billing',
    label: t('cloud.detail.billing'),
    value: (r) => [r.plan, r.billing].filter(Boolean).join(' · '),
  },
  { key: 'model_source', label: t('cloud.detail.modelSource'), href: (r) => r.model_source_url || null, hrefKey: 'model_source_url' },
  { key: 'engine', label: t('cloud.detail.engine'), href: (r) => r.engine_url || null },
  { key: 'weight_source', label: t('cloud.detail.weights'), href: (r) => r.weight_source_url || null, hrefKey: 'weight_source_url' },
  { key: 'base_model', label: t('cloud.detail.base'), href: (r) => r.base_model_url || null, hrefKey: 'base_model_url' },
  { key: 'weight_format', label: t('cloud.detail.format') },
  { key: 'runtime_context', label: t('cloud.detail.context') },
  { key: 'weight_path', label: t('cloud.detail.path'), wide: true },
])

function drawChart() {
  if (vegaView) { vegaView.finalize(); vegaView = null }
  if (!chartContainer.value) return
  const pts = fullData.value
    .filter((r) => r.tokS !== null && r.tokS > 0 && r.perMin !== null)
    .map((r) => ({
      label: modelName(r._rec),
      source: r.sourceLabel,
      sec: r.sec,
      perMin: r.perMin,
      tokS: r.tokS,
      tokSolved: r.tokSolved,
      acc: r.eff,
      ctx: r.ctx,
      solved: r.solved,
      run: r.run,
      complete: r.complete ? t('cloud.run.full') : t('cloud.run.partial'),
    }))
  if (!pts.length) return
  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    background: 'transparent',
    autosize: { type: 'fit', contains: 'padding' },
    config: chartTheme(isDark.value),
    data: { values: pts },
    width: 'container',
    height: 320,
    layer: [
      {
        mark: { type: 'point', filled: true, opacity: 0.85, tooltip: true },
        encoding: {
          x: { field: 'tokS', type: 'quantitative', scale: { type: 'log' }, title: t('vega.agenticTokSAxis') },
          y: { field: 'perMin', type: 'quantitative', title: t('vega.correctMinAxis') },
          size: {
            field: 'acc',
            type: 'quantitative',
            scale: { range: [55, 220] },
            legend: { orient: 'bottom', direction: 'horizontal', title: t('vega.accuracyAxis') },
          },
          color: {
            field: 'source',
            type: 'nominal',
            scale: { domain: [t('swe.source.cloud'), t('swe.source.local')], range: ['#2563eb', '#059669'] },
            legend: { orient: 'bottom', direction: 'horizontal', labelLimit: 90, symbolSize: 70 },
            title: null,
          },
          shape: { field: 'complete', type: 'nominal', title: t('cloud.col.run') },
          tooltip: [
            { field: 'label', title: t('vega.tt.modelZh') },
            { field: 'source', title: t('cloud.col.source') },
            { field: 'tokS', title: t('cloud.col.agenticTokS'), format: '.1f' },
            { field: 'perMin', title: t('cloud.col.correctMin'), format: '.2f' },
            { field: 'acc', title: t('vega.tt.accuracy'), format: '.1f' },
            { field: 'sec', title: t('vega.tt.secSolved'), format: '.0f' },
            { field: 'tokSolved', title: t('col.tokSolved'), format: '.0f' },
            { field: 'solved', title: t('eff.tt.solved') },
            { field: 'run', title: t('cloud.col.run') },
          ],
        },
      },
    ],
  }
  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: 'svg' })
    .then((res) => { vegaView = res.view })
    .catch((err) => console.error('Cloud scatter failed to render:', err))
}

watch([fullData, chartContainer, isDark], drawChart, { immediate: true })
onUnmounted(() => {
  if (vegaView) { vegaView.finalize(); vegaView = null }
  if (tableFlashTimer) clearTimeout(tableFlashTimer)
})
</script>

<template>
  <div class="space-y-6">
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('cloud.scatter.title') }}
        </CardTitle>
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="text-xs text-muted-foreground">{{ t('cloud.subtitle') }} · {{ examName }}</p>
          <div class="inline-flex rounded-md border border-border bg-muted/50 p-1">
            <button
              v-for="opt in placementOptions"
              :key="opt"
              type="button"
              class="rounded px-2.5 py-1 text-xs font-semibold transition-colors"
              :class="placementFilter === opt ? 'bg-background text-brand shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'"
              @click="setPlacementFilter(opt)"
            >
              {{ t(`cloud.filter.${opt}`) }}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="loading && !cloudData.length" class="h-48 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="!cloudData.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('empty.speedData') }}
        </div>
        <div v-else-if="!fullData.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('cloud.empty.fullOnly') }}
        </div>
        <div v-else class="w-full space-y-2">
          <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
            <button
              v-for="(row, idx) in leaderRows"
              :key="row.id"
              type="button"
              class="rounded-md border border-border bg-background/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :title="t('cloud.primary.focusRoute')"
              @click="focusCloudRoute(row.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ idx === 0 ? t('cloud.primary.best') : t('cloud.primary.runner') }}
                </span>
                <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  #{{ idx + 1 }}
                </span>
              </div>
              <div class="mt-2 flex items-end justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-mono text-xs font-semibold text-foreground" :title="modelName(row._rec)">
                    {{ modelName(row._rec) }}
                  </div>
                  <div class="mt-1 text-[11px] text-muted-foreground">
                    {{ row.eff.toFixed(0) }}% · {{ fmt0(row.sec) }} {{ t('cloud.primary.latency') }}
                  </div>
                </div>
                <div class="text-right">
                  <div class="font-mono text-2xl font-bold leading-none text-emerald-700 dark:text-emerald-400">
                    {{ fmt1(row.perMin) }}
                  </div>
                  <div class="text-[10px] font-medium text-muted-foreground">{{ t('cloud.primary.unit') }}</div>
                </div>
              </div>
            </button>
          </div>
          <p class="text-xs leading-relaxed text-muted-foreground" v-html="t('cloud.primary.desc')"></p>
          <div ref="chartContainer" class="w-full"></div>
          <p class="text-xs text-muted-foreground">{{ t('cloud.chart.fullOnly') }}</p>
          <p class="text-xs text-muted-foreground">
            <RouterLink to="/swe/comp" class="text-brand hover:underline hover:text-brand">
              {{ t('crosslink.toSweComp') }}
            </RouterLink>
          </p>
        </div>
      </CardContent>
    </Card>

    <Card
      ref="tableContainer"
      :class="[
        'scroll-mt-6 border-border bg-card shadow-lg transition-colors duration-300',
        tableFlash ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background' : '',
      ]"
    >
      <CardHeader class="pb-2">
        <CardTitle class="text-base font-semibold flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('cloud.table.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('cloud.table.desc') }}</p>
      </CardHeader>
      <CardContent>
        <DataTable
          v-if="fullData.length"
          :columns="cols"
          :rows="fullData"
          row-id-key="id"
          :default-sort="'perMin'"
          :default-dir="'desc'"
          expandable
          fixed-layout
          :highlight-row-id="focusedCloudRowId"
          :detail-fields="routeDetailFields"
        />
        <div v-else class="text-muted-foreground text-sm p-4 text-center">{{ t('cloud.empty.fullOnly') }}</div>

        <div v-if="partialData.length" class="mt-5 border-t border-border/60 pt-4 space-y-3">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <h3 class="text-sm font-semibold text-muted-foreground">{{ t('cloud.partial.title') }}</h3>
              <p class="text-xs text-muted-foreground">{{ t('cloud.partial.desc') }}</p>
            </div>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('cloud.partial.count').replace('{n}', String(partialData.length)) }}
            </span>
          </div>
          <DataTable
            :columns="cols"
            :rows="partialData"
            row-id-key="id"
            :default-sort="'run'"
            :default-dir="'desc'"
            expandable
            fixed-layout
            :highlight-row-id="focusedCloudRowId"
            :detail-fields="routeDetailFields"
          />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
