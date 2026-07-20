<script setup lang="ts">
import { computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, nowMs, loading, dashboardSharedCells, scorecardSweCells, scorecardSweMeta } from '@/lib/store'
import { matchSweCellsByOwner } from '@/lib/identity'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  contributorOf,
  num,
  fmt,
  shortDate,
  ageDays,
  modelCell,
  sweRate,
  sweCI,
  pct
} from '@/components/CellHelpers'

const props = defineProps<{
  id: string
}>()

const { t } = useI18n()
const router = useRouter()

const goBack = () => {
  if (window.history.state && window.history.state.back) {
    router.back()
  } else {
    router.push('/speed/contributors')
  }
}

const STALE_DAYS = 90

const ownerRuns = computed(() => {
  return dashboardRecords.value.filter((r) => contributorOf(r) === props.id)
})

const r0 = computed<Record<string, any>>(() => {
  return ownerRuns.value[0] || {}
})

const uniqueModelsCount = computed(() => {
  const models = ownerRuns.value.map((r) => r.model_alias).filter(Boolean)
  return new Set(models).size
})

const headerText = computed(() => {
  const n = ownerRuns.value.length
  const mc = uniqueModelsCount.value
  return t('owner.detail.header')
    .replace('{n}', String(n))
    .replace('{runs}', n > 1 ? t('owner.detail.runs') : t('owner.detail.run'))
    .replace('{modelCount}', String(mc))
    .replace('{models}', mc > 1 ? t('owner.detail.models') : t('owner.detail.model'))
})

const mappedRows = computed(() => {
  return ownerRuns.value.map((r, i) => {
    const isStale = (ageDays(r.timestamp, nowMs.value) ?? 0) > STALE_DAYS
    return {
      __record: r,
      __stale: isStale,
      model: r.model_alias || '—',
      engine: [r.engine, r.engine_tag].filter(Boolean).join(':') || '—',
      quant: r.quant || '—',
      backend: r.test_backend || '—',
      pp: num(r.pp512_tps),
      tg: num(r.tg128_tps),
      date: shortDate(r.timestamp),
      // Stable ID
      id: `${i}-${r.model_alias || ''}-${r.timestamp || ''}`
    }
  })
})

const cols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    render: (r) => h('a', { href: `#/model/${encodeURIComponent(r.model)}`, class: 'text-primary hover:underline font-medium' }, r.model)
  },
  { key: 'engine', label: t('col.engine'), mobileHide: true },
  { key: 'quant', label: t('col.quant'), mobileHide: true },
  {
    key: 'backend',
    label: t('col.backend'),
    mobileHide: true,
    render: (r) => r.backend && r.backend !== '—'
      ? h('span', { class: 'text-xs text-brand border border-brand/30 bg-brand/20 px-2 py-0.5 rounded-full font-medium' }, r.backend)
      : '—'
  },
  { key: 'pp', label: t('col.pp512'), num: true, mobileHide: true, render: (r) => fmt(r.pp) },
  {
    key: 'tg',
    label: t('col.tg128'),
    num: true,
    render: (r) => r.tg === null
      ? '—'
      : h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, fmt(r.tg))
  },
  {
    key: 'date',
    label: t('col.date'),
    mobileHide: true,
    render: (r) => {
      const kids = [r.date]
      if (r.__stale) {
        kids.push(h('span', { class: 'text-[10px] text-amber-700 dark:text-amber-500 border border-amber-500/30 bg-amber-950/20 px-1.5 py-0.5 rounded ml-2 font-sans font-medium' }, t('state.stale')))
      }
      return h('span', {}, kids)
    }
  }
])

const matchedSweCells = computed(() => {
  return matchSweCellsByOwner(props.id, scorecardSweCells.value, dashboardSharedCells.value)
})

const matchedSweRows = computed(() => {
  const ownerRows = matchedSweCells.value.scorecard.map((cell, idx) => {
    const source = (cell as { identity?: { access?: string } }).identity?.access || (cell as { source?: string }).source || 'scorecard'
    const rate = sweRate(cell)
    const ci = sweCI(cell)
    const owner = (cell as { owner?: string }).owner || ''
    return {
      __record: cell,
      workspace: 'scorecard',
      model: cell.model,
      source,
      comparable: cell.comparable !== false,
      n: `${cell.n_passed ?? '?'} / ${cell.n_graded ?? '?'}`,
      nGraded: num(cell.n_graded),
      headline: rate,
      headline_ci: ci,
      id: `scorecard-${cell.model}-${idx}-${cell.profile || ''}-${owner}`
    }
  })

  const sharedRows = matchedSweCells.value.shared.map((cell, idx) => {
    const source = cell.harness ? `harness:${cell.harness}` : 'shared'
    const rate = sweRate(cell as any)
    const ci = sweCI(cell as any)
    const owner = (cell as { owner?: string }).owner || ''
    return {
      __record: cell,
      workspace: 'shared',
      model: cell.model,
      source,
      comparable: cell.comparable !== false,
      n: `${cell.n_passed ?? '?'} / ${cell.n_graded ?? '?'}`,
      nGraded: num(cell.n_graded),
      headline: rate,
      headline_ci: ci,
      id: `shared-${cell.model}-${idx}-${owner}-${cell.harness || ''}-${cell.machine || ''}`
    }
  })

  return [...ownerRows, ...sharedRows]
})

const hasSpeedRuns = computed(() => ownerRuns.value.length > 0)
const hasSweRuns = computed(() => matchedSweRows.value.length > 0)

const sweSourceLabel = (source: string) => {
  const normalized = (source || '').toLowerCase()
  if (normalized === 'cloud') return t('swe.source.cloud')
  if (normalized === 'local') return t('swe.source.local')
  if (normalized === 'shared') return t('swe.source.shared')
  if (normalized === 'scorecard') return t('swe.source.scorecard')
  if (normalized.startsWith('harness:')) return source.slice(8) || t('swe.source.unknown')
  if (normalized === '—') return t('swe.source.unknown')
  return source || t('swe.source.unknown')
}

const sweSourceClass = (source: string) => {
  const normalized = (source || '').toLowerCase()
  if (normalized === 'cloud') return 'text-brand border-brand/30 bg-brand/20'
  if (normalized === 'local') return 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
  if (normalized === 'shared') return 'text-violet-700 dark:text-violet-400 border-violet-500/30 bg-violet-950/20'
  if (normalized === 'scorecard') return 'text-slate-700 dark:text-slate-300 border-slate-500/30 bg-slate-950/20'
  if (normalized.startsWith('harness:')) return 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-950/20'
  return 'text-muted-foreground border-border bg-muted'
}

const sweCols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    render: (r) => modelCell(r.__record)
  },
  {
    key: 'workspace',
    label: t('swe.workspace'),
    mobileHide: true,
    render: (r) => h('span', { class: 'text-xs font-medium text-muted-foreground uppercase tracking-wide' }, t(r.workspace === 'scorecard' ? 'swe.source.scorecard' : 'swe.source.shared'))
  },
  {
    key: 'source',
    label: t('col.source'),
    mobileHide: true,
    render: (r) => h('span', {
      class: `inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${sweSourceClass(r.source)}`
    }, sweSourceLabel(r.source))
  },
  { key: 'n', label: t('col.passedGraded'), mobileHide: true },
  {
    key: 'headline',
    label: t('col.passRateHeadlineCI'),
    num: true,
    sortVal: (r) => r.headline ?? -1,
    render: (r) => {
      if (r.headline === null) return '—'
      return h('span', {}, [
        h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, pct(r.headline)),
        h('span', { class: 'text-muted-foreground text-xs font-normal ml-1 font-sans' }, `[${pct(r.headline_ci?.[0])}–${pct(r.headline_ci?.[1])}]`)
      ])
    }
  },
  {
    key: 'comparable',
    label: t('swe.comparable'),
    mobileHide: true,
    render: (r) => r.comparable
      ? h('span', { class: 'inline-flex items-center text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-medium' }, t('swe.comparableYes'))
      : h('span', { class: 'inline-flex items-center text-xs px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-950/20 text-amber-700 dark:text-amber-400 font-medium' }, t('swe.comparableNo'))
  }
])

const sweExamLabel = computed(() => {
  const metaLabel = scorecardSweMeta.value?.current_exam_label
  const metaVersion = scorecardSweMeta.value?.current_exam
  if (metaLabel) return metaLabel
  if (metaVersion) return metaVersion
  return t('swe.examUnknown')
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <Button variant="ghost" class="text-muted-foreground hover:text-foreground text-xs p-0 h-auto cursor-pointer" @click="goBack">
        {{ t('common.back') }}
      </Button>
    </div>

    <Card v-if="!loading && !hasSpeedRuns && !hasSweRuns" class="border-border bg-card">
      <CardContent class="py-12 text-center text-destructive">
        {{ t('owner.detail.noRuns').replace('{id}', id) }}
      </CardContent>
    </Card>

    <template v-else-if="hasSpeedRuns">
      <!-- Rig Info Card (only when a real speed record exists — r0 is never an empty {} here) -->
      <Card class="border-border bg-card shadow-md">
        <CardHeader class="pb-2">
          <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
            {{ t('owner.detail.rigConfig') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
            <div class="bg-muted/40 p-2.5 rounded border border-border/40">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.profile') }}</span>
              <span class="block mt-0.5 text-foreground text-sm font-semibold truncate">{{ r0.profile || '—' }}</span>
            </div>
            <div class="bg-muted/40 p-2.5 rounded border border-border/40">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.owner') }}</span>
              <span class="block mt-0.5 text-foreground text-sm font-semibold truncate">{{ r0.owner || t('rig.unattributed') }}</span>
            </div>
            <div class="bg-muted/40 p-2.5 rounded border border-border/40">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.os') }}</span>
              <span class="block mt-0.5 text-foreground text-sm truncate" :title="[r0.os_family, r0.os_version].filter(Boolean).join(' · ')">{{ r0.os_version || r0.os_family || '—' }}</span>
            </div>
            <div class="bg-muted/40 p-2.5 rounded border border-border/40 md:col-span-2">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.cpu') }}</span>
              <span class="block mt-0.5 text-foreground text-xs truncate" :title="r0.cpu_model || ''">{{ r0.cpu_model || '—' }}</span>
            </div>
            <div class="bg-muted/40 p-2.5 rounded border border-border/40">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.ram') }}</span>
              <span class="block mt-0.5 text-foreground text-sm font-semibold truncate">{{ r0.ram_gb ? `${r0.ram_gb} GB` : '—' }}</span>
            </div>
            <div class="bg-muted/40 p-2.5 rounded border border-border/40 md:col-span-3">
              <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{{ t('rig.gpu') }}</span>
              <span class="block mt-0.5 text-foreground text-xs truncate" :title="r0.gpu_summary || ''">{{ r0.gpu_summary || '—' }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Runs Table Card -->
      <Card class="border-border bg-card shadow-lg">
        <CardHeader class="pb-2">
          <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
            {{ id }}
          </CardTitle>
          <p class="text-xs text-muted-foreground">
            {{ headerText }}
          </p>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground animate-pulse font-mono">
            {{ t('state.loading') }}
          </div>
          <DataTable
            v-else
            :columns="cols"
            :rows="mappedRows"
            row-id-key="id"
            :default-sort="'tg'"
            :default-dir="'desc'"
            :expandable="true"
          />
        </CardContent>
      </Card>
    </template>

    <Card v-if="hasSweRuns && !loading" class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('owner.detail.sweTitle') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground" v-if="!loading">
          {{ t('swe.examLabel').replace('{exam}', sweExamLabel) }}
        </p>
      </CardHeader>
      <CardContent>
        <div v-if="!matchedSweRows.length" class="py-8 text-center text-muted-foreground">
          {{ t('empty.sweCells') }}
        </div>
        <DataTable
          v-else
          :columns="sweCols"
          :rows="matchedSweRows"
          row-id-key="id"
          :default-sort="'headline'"
          :default-dir="'desc'"
          :expandable="false"
        />
      </CardContent>
    </Card>
  </div>
</template>
