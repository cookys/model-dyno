<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch } from 'vue'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { dashboardComp, loading } from '@/lib/store'
import type { CompCell } from '@/lib/store'
import { isDark, chartTheme } from '@/lib/theme'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { num } from '@/components/CellHelpers'
import { groupByCanonicalModel, recordCanonicalModel } from '@/lib/modelFolding'

const { t } = useI18n()
let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)
const detailContainer = ref<HTMLDivElement | null>(null)
const selectedKey = ref<string | null>(null)
const detailFlash = ref(false)
let detailFlashTimer: ReturnType<typeof setTimeout> | null = null

const examName = computed(() => dashboardComp.value?.exam ?? '—')

const rankDesc = (value: unknown): number => num(value) ?? -Infinity
const rankAsc = (value: unknown): number => num(value) ?? Infinity
const comparableRank = (record: CompCell): number => record.comparable === false ? 0 : 1

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
    compareDesc(rankDesc(candidate.solved_per_hour), rankDesc(current.solved_per_hour)),
    compareAsc(rankAsc(candidate.sec_per_solved), rankAsc(current.sec_per_solved)),
    compareDesc(rankDesc(candidate.ci_lo), rankDesc(current.ci_lo)),
    compareDesc(rankDesc(candidate.acc), rankDesc(current.acc)),
    compareDesc(rankDesc(candidate.n), rankDesc(current.n)),
  ]
  return checks.find((v) => v !== 0)! > 0 ? candidate : current
}

const throughputGroups = computed(() =>
  groupByCanonicalModel(
    (dashboardComp.value?.cells || []).filter((c) => num(c.solved_per_hour) !== null),
    chooseFastestEfficiencyCell,
    (c) => `${c.cell}-${c.source}-${c.harness || ''}-${c.operator || ''}-${c.machine || ''}`,
  )
)

const routeRank = (a: CompCell, b: CompCell): number => {
  const checks = [
    compareDesc(comparableRank(a), comparableRank(b)),
    compareDesc(rankDesc(a.solved_per_hour), rankDesc(b.solved_per_hour)),
    compareAsc(rankAsc(a.sec_per_solved), rankAsc(b.sec_per_solved)),
    compareDesc(rankDesc(a.ci_lo), rankDesc(b.ci_lo)),
    compareDesc(rankDesc(a.acc), rankDesc(b.acc)),
    compareDesc(rankDesc(a.n), rankDesc(b.n)),
  ]
  return -(checks.find((v) => v !== 0) ?? 0)
}

// One canonical-model representative per row. Full-exam cells win before partials;
// within the same run status, the page shows the fastest solving-throughput route.
const rows = computed(() =>
  throughputGroups.value
    .map((group) => {
      const c = group.representative
      return {
        key: group.key,
        label: (c.identity && c.identity.canonical_model) || c.model || c.cell,
        perHour: num(c.solved_per_hour),
        acc: num(c.acc) !== null ? +(c.acc * 100).toFixed(0) : null,
        sec: num(c.sec_per_solved),
        comparable: c.comparable !== false,
        run: c.comparable === false ? t('cloud.run.partial') : t('cloud.run.full'),
        vendor: c.publisher || c.operator || (c.machine ? 'local' : c.harness || '—'),
        machine: c.machine || 'cloud',
        n: `${c.passed}/${c.n}`,
        route: c.cell,
        routes: group.records.length,
        canonical: recordCanonicalModel(c) || c.cell,
        selected: selectedKey.value === group.key,
      }
    })
    .filter((r) => r.perHour !== null)
    .sort((a, b) => {
      if (a.comparable !== b.comparable) return a.comparable ? -1 : 1
      return (b.perHour as number) - (a.perHour as number)
    })
)

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
      run: c.comparable === false ? t('cloud.run.partial') : t('cloud.run.full'),
      comparable: c.comparable !== false,
      shown: c === selectedGroup.value?.representative,
      n: `${c.passed}/${c.n}`,
      perHour: num(c.solved_per_hour),
      sec: num(c.sec_per_solved),
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
</script>

<template>
  <div class="space-y-4">
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-base">{{ t('eff.title') }}</CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('eff.subtitle') }} · {{ examName }}</p>
      </CardHeader>
      <CardContent>
        <div v-if="loading && !rows.length" class="py-16 text-center text-sm text-muted-foreground">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="!rows.length" class="py-16 text-center text-sm text-muted-foreground">
          {{ t('empty.speedData') }}
        </div>
        <div v-else ref="chartContainer" class="w-full"></div>
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
      </CardContent>
    </Card>
  </div>
</template>
