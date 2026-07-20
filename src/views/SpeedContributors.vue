<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, loading } from '@/lib/store'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { contributorOf, hwOf, num, fmt } from '@/components/CellHelpers'

const { t } = useI18n()

const contributorRows = computed(() => {
  const byC = new Map<string, { contributor: string; profile: string; hw: string; os: string; runs: number; best: number | null }>()

  for (const r of dashboardRecords.value) {
    const c = contributorOf(r)
    const tg = num(r.tg128_tps)
    const cur = byC.get(c) || {
      contributor: c,
      profile: r.profile || '—',
      hw: hwOf(r),
      os: r.os_version || r.os_family || '—',
      runs: 0,
      best: null
    }
    cur.runs += 1
    if (tg !== null && (cur.best === null || tg > cur.best)) {
      cur.best = tg
    }
    byC.set(c, cur)
  }

  return Array.from(byC.values())
})

const cols = computed<Column<any>[]>(() => [
  {
    key: 'contributor',
    label: t('col.contributor'),
    render: (r) => h('a', { href: `#/owner/${encodeURIComponent(r.contributor)}`, class: 'text-primary hover:underline font-medium' }, r.contributor)
  },
  { key: 'profile', label: t('col.profile'), mobileHide: true },
  { key: 'hw', label: t('col.hardware'), mobileHide: true },
  { key: 'os', label: t('col.os'), mobileHide: true },
  {
    key: 'best',
    label: t('col.bestTg128'),
    num: true,
    render: (r) => h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, fmt(r.best))
  },
  { key: 'runs', label: t('col.runs'), num: true, mobileHide: true }
])
</script>

<template>
  <Card class="border-border bg-card shadow-lg">
    <CardHeader class="pb-2">
      <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
        <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
        {{ t('idx.contributors.title') }}
      </CardTitle>
      <p class="text-xs text-muted-foreground">
        {{ t('idx.contributors') }}
      </p>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground animate-pulse font-mono">
        {{ t('state.loading') }}
      </div>
      <DataTable
        v-else
        :columns="cols"
        :rows="contributorRows"
        row-id-key="contributor"
        :expandable="true"
        :default-sort="'best'"
        :default-dir="'desc'"
      />
    </CardContent>
  </Card>
</template>
