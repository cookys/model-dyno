<script setup lang="ts">
import { computed, h } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardSharedCells, loading } from '@/lib/store'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { harnessCell, machineCell, modelCell, num, pct, suspectErrorBadge } from '@/components/CellHelpers'

const { t } = useI18n()

const allShared = computed(() => dashboardSharedCells.value || [])

const comparableCells = computed(() => {
  return allShared.value.filter((c) => c.comparable !== false && num(c.headline) !== null)
})

const rows = computed(() => {
  return comparableCells.value.map((c) => ({
    __record: c,
    model: c.model,
    owner: c.owner && c.owner !== '?' ? c.owner : '—',
    harness: c.harness && c.harness !== '?' ? c.harness : '—',
    machine: c.machine && c.machine !== '?' ? c.machine : '—',
    n: `${c.n_passed ?? '?'}/${c.n_graded ?? '?'}`,
    nGraded: c.n_graded || 0,
    headline: num(c.headline),
    headline_ci: c.headline_ci,
    capability_est: num(c.capability_est),
    id: `${c.model}-${c.owner}-${c.harness}-${c.machine}`
  }))
})

const cols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    description: t('table.tip.modelGroup'),
    render: (r) => modelCell(r.__record)
  },
  {
    key: 'owner',
    label: t('col.owner'),
    description: t('table.tip.owner'),
    mobileHide: true,
    render: (r) => r.owner === '—'
      ? '—'
      : h('a', { href: `#/owner/${encodeURIComponent(r.owner)}`, class: 'text-primary hover:underline' }, r.owner)
  },
  { key: 'harness', label: t('col.harnessShared'), mobileHide: true, render: (r) => harnessCell(r.harness, t) },
  { key: 'machine', label: t('col.machineSwe'), mobileHide: true, render: (r) => machineCell(r.machine) },
  { key: 'n', label: t('col.passedGraded'), sortVal: (r) => r.nGraded, mobileHide: true },
  {
    key: 'headline',
    label: t('col.passRateHeadlineCI'),
    description: t('table.tip.headline'),
    num: true,
    render: (r) => r.headline === null
      ? '—'
      : h('span', {}, [
          h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold' }, pct(r.headline)),
          h('span', { class: 'text-muted-foreground text-xs font-normal ml-1' }, `[${pct(r.headline_ci?.[0])}–${pct(r.headline_ci?.[1])}]`),
          r.__record.suspect_error_count > 0
            ? h('span', { class: 'ml-2 inline-flex align-middle' }, [suspectErrorBadge(r.__record.suspect_error_count, t)])
            : null
        ])
  }
])
</script>

<template>
  <Card class="border-border bg-card shadow-lg">
    <CardHeader class="pb-2">
      <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
        <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
        {{ t('swe.shared.title') }}
      </CardTitle>
      <div class="text-xs text-muted-foreground leading-relaxed" v-html="t('swe.shared.desc')"></div>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground animate-pulse font-mono">
        {{ t('state.loading') }}
      </div>
      <div v-else-if="!rows.length" class="p-6 text-center border border-dashed border-border rounded-md bg-muted/10">
        <template v-if="allShared.length">
          <p class="text-sm text-muted-foreground font-medium">
            {{ t('swe.shared.partialRuns').replace('{count}', String(allShared.length)) }}
          </p>
        </template>
        <template v-else>
          <p class="text-sm text-muted-foreground">
            {{ t('swe.shared.noRuns') }}
          </p>
          <code class="block mt-2 bg-zinc-950 dark:bg-zinc-950/40 p-2 rounded text-emerald-500 dark:text-emerald-700 dark:text-emerald-400 border border-border/30 text-xs max-w-lg mx-auto">
            python3 scripts/run-swe-personal.py --workspace shared --owner &lt;handle&gt;
          </code>
        </template>
      </div>
      <DataTable
        v-else
        :columns="cols"
        :rows="rows"
        row-id-key="id"
        :default-sort="'headline'"
        :default-dir="'desc'"
        :expandable="true"
      />
    </CardContent>
  </Card>
</template>
