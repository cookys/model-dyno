<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, loading } from '@/lib/store'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { contributorOf, num, fmt } from '@/components/CellHelpers'

const { t } = useI18n()

const leaderboardRows = computed(() => {
  const byModel = new Map<string, { model: string; runs: number; best: number | null; bestRow: any }>()

  for (const r of dashboardRecords.value) {
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

  return Array.from(byModel.values()).map((g) => ({
    model: g.model,
    tier: g.bestRow?.tier || '—',
    runs: g.runs,
    best: g.best,
    bestBy: g.bestRow ? contributorOf(g.bestRow) : '—',
    engine: g.bestRow?.engine || '—'
  }))
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
