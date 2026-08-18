<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, speedLoading as loading } from '@/lib/store'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { contributorOf, num, fmt } from '@/components/CellHelpers'
import { machineLabel, footprintByAlias, fitVerdict } from '@/lib/hardware'
import { useVramFilter } from '@/lib/useVramFilter'
import VramFilterBar from '@/components/VramFilterBar.vue'

const { t } = useI18n()
const { machineFits, selectedVram } = useVramFilter()

// "Best tok/s for this model" was taken across every machine, so a 3B model's headline
// number came from a 192GB dual-Blackwell workstation and read as what the model does.
// Ranking within the reader's own memory class is the whole point of the filter.
const visibleRecords = computed(() => dashboardRecords.value.filter((r) => machineFits(r.profile)))

const leaderboardRows = computed(() => {
  const byModel = new Map<string, { model: string; runs: number; best: number | null; bestRow: any }>()

  for (const r of visibleRecords.value) {
    const m = r.model_alias
    if (!m) continue
    const tg = num(r.tg128_tps)
    const cur = byModel.get(m) || { model: m, runs: 0, best: null, bestRow: null }
    cur.runs += 1
    if (tg !== null && (cur.best === null || tg > cur.best)) {
      cur.best = tg
      cur.bestRow = r
    }
    byModel.set(m, cur)
  }

  return Array.from(byModel.values()).map((g) => {
    const fp = footprintByAlias.value.get(g.model)
    return {
      model: g.model,
      tier: g.bestRow?.tier || '—',
      runs: g.runs,
      best: g.best,
      bestBy: g.bestRow ? contributorOf(g.bestRow) : '—',
      onCard: machineLabel(g.bestRow?.profile),
      engine: g.bestRow?.engine || '—',
      weights: fp?.weights_gb ?? null,
      params: fp?.params_total_b ?? null,
      paramsActive: fp?.params_active_b ?? null,
      ctxMax: fp?.context_max ?? null,
      hfRepo: fp?.hf_repo ?? null,
      // Against the reader's declared card, not against the machine that produced the row.
      fit: selectedVram.value ? fitVerdict(fp?.weights_gb, selectedVram.value) : 'unknown',
    }
  })
})

const cols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    render: (r) => h('a', { href: `#/model/${encodeURIComponent(r.model)}`, class: 'text-primary hover:underline font-medium' }, r.model)
  },
  { key: 'tier', label: t('col.tier'), mobileHide: true },
  {
    key: 'best',
    label: t('col.bestTg128'),
    num: true,
    render: (r) => h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold' }, fmt(r.best))
  },
  {
    key: 'bestBy',
    label: t('col.bestBy'),
    mobileHide: true,
    render: (r) => r.bestBy === '—'
      ? '—'
      : h('a', { href: `#/owner/${encodeURIComponent(r.bestBy)}`, class: 'text-primary hover:underline' }, r.bestBy)
  },
  { key: 'engine', label: t('col.engine'), mobileHide: true },
  {
    key: 'weights',
    label: t('col.weights'),
    num: true,
    sortVal: (r) => r.weights ?? -1,
    render: (r) => {
      if (r.weights === null) return h('span', { class: 'text-muted-foreground/50' }, '—')
      const badge = r.fit === 'unknown' ? null : h('span', {
        class: `ml-1.5 rounded-full border px-1.5 text-[10px] ${
          r.fit === 'fits' ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-950/20'
          : r.fit === 'tight' ? 'border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10'
          : 'border-border text-muted-foreground bg-muted/40'}`,
        title: t('fit.estimate'),
      }, t(`fit.${r.fit}`))
      return h('span', { class: 'font-mono' }, [`${r.weights} GB`, badge])
    },
  },
  {
    key: 'params',
    label: t('col.params'),
    num: true,
    mobileHide: true,
    sortVal: (r) => r.params ?? -1,
    // A 30B-A3B and a dense 30B at the same tok/s are not the same proposition, and the
    // board could not tell them apart.
    render: (r) => r.params === null ? '—'
      : (r.paramsActive && r.paramsActive !== r.params ? `${r.params}B (A${r.paramsActive}B)` : `${r.params}B`),
  },
  { key: 'ctxMax', label: t('col.ctxMax'), num: true, mobileHide: true, sortVal: (r) => r.ctxMax ?? -1,
    render: (r) => r.ctxMax === null ? '—' : `${Math.round(r.ctxMax / 1024)}K` },
  { key: 'runs', label: t('col.runs'), num: true, mobileHide: true }
])
</script>

<template>
  <Card class="border-border bg-card shadow-lg">
    <CardHeader class="pb-2">
      <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
        <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
        {{ t('idx.leaderboard.title') }}
      </CardTitle>
      <p class="text-xs text-muted-foreground">
        {{ t('idx.leaderboard') }}
      </p>
    </CardHeader>
    <CardContent>
      <VramFilterBar class="mb-3" />
      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground animate-pulse font-mono">
        {{ t('state.loading') }}
      </div>
      <DataTable
        v-else
        :columns="cols"
        :rows="leaderboardRows"
        row-id-key="model"
        :expandable="true"
        :default-sort="'best'"
        :default-dir="'desc'"
      />
    </CardContent>
  </Card>
</template>
