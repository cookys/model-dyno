<script setup lang="ts">
import { computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, nowMs, loading, scorecardSweCells, scorecardSweMeta } from '@/lib/store'
import { matchSweCellsByModelAlias } from '@/lib/identity'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  contributorOf,
  hwOf,
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
  alias: string
}>()

const { t } = useI18n()
const router = useRouter()

const goBack = () => {
  if (window.history.state && window.history.state.back) {
    router.back()
  } else {
    router.push('/speed/leaderboard')
  }
}

const STALE_DAYS = 90

const modelRuns = computed(() => {
  return dashboardRecords.value.filter((r) => r.model_alias === props.alias)
})

const bestRun = computed(() => {
  if (!modelRuns.value.length) return null
  let best = modelRuns.value[0]
  for (const r of modelRuns.value) {
    const rSpeed = num(r.tg128_tps)
    const bSpeed = num(best.tg128_tps)
    if (rSpeed !== null && (bSpeed === null || rSpeed > bSpeed)) {
      best = r
    }
  }
  return best
})

const headerText = computed(() => {
  const n = modelRuns.value.length
  const best = bestRun.value
  if (!best) return ''
  return t('model.detail.header')
    .replace('{n}', String(n))
    .replace('{runs}', n > 1 ? t('model.detail.runs') : t('model.detail.run'))
    .replace('{tier}', best.tier || '?')
    .replace('{speed}', fmt(num(best.tg128_tps)))
    .replace('{contributor}', contributorOf(best))
    .replace('{hw}', hwOf(best))
})

const mappedRows = computed(() => {
  return modelRuns.value.map((r, i) => {
    const isStale = (ageDays(r.timestamp, nowMs.value) ?? 0) > STALE_DAYS
    return {
      __record: r,
      __stale: isStale,
      contributor: contributorOf(r),
      profile: r.profile,
      hw: hwOf(r),
      engine: [r.engine, r.engine_tag].filter(Boolean).join(':') || '—',
      quant: r.quant || '—',
      backend: r.test_backend || '—',
      pp: num(r.pp512_tps),
      tg: num(r.tg128_tps),
      tier: r.tier || '—',
      model: r.model_alias,
      date: shortDate(r.timestamp),
      // Stable ID
      id: `${i}-${contributorOf(r)}-${r.timestamp || ''}`
    }
  })
})

const matchedSweCells = computed(() => {
  return matchSweCellsByModelAlias(props.alias, scorecardSweCells.value)
})

const matchedSweRows = computed(() => {
  return matchedSweCells.value.map((cell, idx) => {
    const source = (cell as { identity?: { access?: string } }).identity?.access || (cell as { source?: string }).source || '—'
    const rate = sweRate(cell)
    const ci = sweCI(cell)
    const owner = (cell as { owner?: string }).owner || ''
    return {
      __record: cell,
      model: cell.model,
      source,
      comparable: cell.comparable !== false,
      n: `${cell.n_passed ?? '?'} / ${cell.n_graded ?? '?'}`,
      nGraded: num(cell.n_graded),
      headline: rate,
      headline_ci: ci,
      id: `${cell.model}-${idx}-${source}-${cell.profile || ''}-${owner}`
    }
  })
})

const hasSpeedRuns = computed(() => modelRuns.value.length > 0)
const hasSweRuns = computed(() => matchedSweRows.value.length > 0)

const sweSourceLabel = (source: string) => {
  const normalized = (source || '').toLowerCase()
  if (normalized === 'cloud') return t('swe.source.cloud')
  if (normalized === 'local') return t('swe.source.local')
  if (normalized === 'shared') return t('swe.source.shared')
  if (normalized === 'survey-p4c') return t('swe.source.survey')
  if (normalized === '—') return t('swe.source.unknown')
  return source || t('swe.source.unknown')
}

const sweSourceClass = (source: string) => {
  const normalized = (source || '').toLowerCase()
  if (normalized === 'cloud') return 'text-brand border-brand/30 bg-brand/20'
  if (normalized === 'local') return 'text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
  if (normalized === 'shared') return 'text-violet-700 dark:text-violet-400 border-violet-500/30 bg-violet-950/20'
  if (normalized === 'survey-p4c') return 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-950/20'
  return 'text-muted-foreground border-border bg-muted'
}

const sweExamLabel = computed(() => {
  const metaLabel = scorecardSweMeta.value?.current_exam_label
  const metaVersion = scorecardSweMeta.value?.current_exam
  if (metaLabel) return metaLabel
  if (metaVersion) return metaVersion
  return t('swe.examUnknown')
})

const sweCols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    render: (r) => modelCell(r.__record)
  },
  {
    key: 'source',
    label: t('col.source'),
    mobileHide: true,
    render: (r) => h('span', {
      class: `inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${sweSourceClass(r.source)}`
    }, sweSourceLabel(r.source))
  },
  { key: 'n', label: t('col.passedGraded'), num: true, mobileHide: true },
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

const cols = computed<Column<any>[]>(() => [
  {
    key: 'contributor',
    label: t('col.contributor'),
    render: (r) => h('a', { href: `#/owner/${encodeURIComponent(r.contributor)}`, class: 'text-primary hover:underline' }, r.contributor)
  },
  { key: 'hw', label: t('col.hardware') },
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
      : h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold' }, fmt(r.tg))
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
        {{ t('model.detail.noRuns').replace('{alias}', alias) }}
      </CardContent>
    </Card>

    <Card v-if="hasSpeedRuns || loading" class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-5 bg-primary rounded-full"></span>
          {{ alias }}
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

    <Card v-if="hasSweRuns && !loading" class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('model.detail.sweTitle') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground" v-if="!loading">
          {{ t('swe.examLabel').replace('{exam}', sweExamLabel) }}
        </p>
      </CardHeader>
      <CardContent>
        <div v-if="!matchedSweRows.length" class="py-8 text-center text-sm text-muted-foreground">
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
