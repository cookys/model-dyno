<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { RouterLink } from 'vue-router'
import { History, Trophy } from 'lucide-vue-next'
import vegaEmbed from 'vega-embed'
import { useI18n } from '@/lib/i18n'
import { scorecardSweMeta, selectedExam, sweCellsByExam, loading } from '@/lib/store'
import { isDark, chartTheme, chartBlueScheme } from '@/lib/theme'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { foldedVariantsBadge, indicatorIconBadge, machineCell, modelCell, modelName, sweRate, sweCI, overlaps, num, pct, fmt, agencyBadge, suspectErrorBadge, runClassBadge } from '@/components/CellHelpers'
import { classifyCell, partitionBySection } from '@/lib/runClass'
import { resolveExamMeta } from '@/lib/examMeta'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import {
  chooseBestScorecardCell,
  groupByCanonicalModel,
  variantCount as foldedVariantCount,
} from '@/lib/modelFolding'

import { useBoardFilter } from '@/lib/useBoardFilter'
import BoardFilterBanner from '@/components/BoardFilterBanner.vue'

const { t } = useI18n()
const boardFilter = useBoardFilter()

let vegaView: any = null
const chartContainer = ref<HTMLDivElement | null>(null)

const isMobile = ref(false)
const chartOpen = ref(true)
let mq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent | MediaQueryList) => { isMobile.value = e.matches; chartOpen.value = !e.matches }

const MIN_GRADED = 8

/** plan 053: exam size SSOT from scorecard meta (not invented). */
const examMeta = computed(() => resolveExamMeta(scorecardSweMeta.value))

const foldedScorecardGroups = computed(() =>
  groupByCanonicalModel(
    // Filter before folding so a family view picks its representative within the family.
    boardFilter.applyTo(sweCellsByExam.value),
    chooseBestScorecardCell,
    (c) => `${c.model}-${c.profile || ''}-${c.machine || ''}-${c.canonical_version || ''}`,
  )
)

const comparableRepresentativeCells = computed(() => {
  return foldedScorecardGroups.value
    .map((group) => group.representative)
    .filter((c) => {
      if (num(sweRate(c)) === null || (c.n_graded || 0) < MIN_GRADED) return false
      return classifyCell(
        { n_graded: c.n_graded, comparable: c.comparable, owed: c.owed, n_exam: c.n_canon ?? c.n_exam, n_canon: c.n_canon },
        examMeta.value,
      ).rankable
    })
})

const wilsonLow = (c: any): number | null => {
  const ci = sweCI(c)
  return num(ci?.[0]) ?? num(sweRate(c))
}

// Determine top ranked cell to compute statistical ties.
const topCell = computed(() => {
  if (!comparableRepresentativeCells.value.length) return null
  return comparableRepresentativeCells.value.reduce((best, cur) => {
    const bestRank = wilsonLow(best) ?? -1
    const curRank = wilsonLow(cur) ?? -1
    return curRank > bestRank ? cur : best
  }, comparableRepresentativeCells.value[0])
})

const tiesTop = (c: any) => {
  const top = topCell.value
  if (!top || c === top) return false
  const rankable = classifyCell(
    { n_graded: c.n_graded, comparable: c.comparable, owed: c.owed, n_exam: c.n_canon ?? c.n_exam, n_canon: c.n_canon },
    examMeta.value,
  ).rankable
  if (!rankable) return false
  return overlaps(sweCI(c), sweCI(top))
}

const isArchived = computed(() => {
  const current = scorecardSweMeta.value?.current_exam
  const selected = selectedExam.value
  return !!(selected && current && selected !== current)
})

const archivedBanner = computed(() => {
  if (!isArchived.value) return ''
  const label = scorecardSweMeta.value?.exam_versions?.find((v) => v.version === selectedExam.value)?.label || selectedExam.value
  return t('swe.scorecard.archivedBanner').replace('{exam}', String(label))
})

const scorecardRows = computed(() => {
  return foldedScorecardGroups.value.map((group) => {
    const c = group.representative
    const rate = num(sweRate(c))
    const ci = sweCI(c)
    const tie = tiesTop(c)
    const cls = classifyCell(
      { n_graded: c.n_graded, comparable: c.comparable, owed: c.owed, n_exam: c.n_canon ?? c.n_exam, n_canon: c.n_canon },
      examMeta.value,
    )
    const comparable = cls.rankable
    const ranked = comparable && (c.n_graded || 0) >= MIN_GRADED
    const rankScore = ranked ? (wilsonLow(c) ?? -1) : -1

    return {
      __record: c,
      __stale: !cls.rankable,
      model: c.model,
      profile: c.profile && c.profile !== '?' ? c.profile : '—',
      tags: c.tags || null,
      machine: c.machine || '—',
      n: `${c.n_passed ?? '?'}/${c.n_graded ?? '?'}`,
      nGraded: c.n_graded || 0,
      nCanon: c.n_canon ?? null,
      nRaw: c.n_graded || 0,
      eff: rate,
      ci,
      comparable,
      ranked,
      rankScore,
      owed: cls.owed,
      _section: cls.section,
      _nGraded: cls.n,
      _nExam: cls.nExam,
      _owed: cls.owed,
      tie,
      pps: num(c.pps),
      tokSolved: num(c.tok_per_solved),
      tokWaste: num(c.tok_fail_ratio),
      secSolved: num(c.med_wall_pass) ?? num(c.sec_per_solved),
      usdSolved: c.price_known ? num(c.usd_per_solved) : null,
      perHour: num(c.solved_per_hour),
      variantCount: foldedVariantCount(group),
      variants: group.records.map((v) => ({
        model: modelName(v),
        profile: v.profile && v.profile !== '?' ? v.profile : '—',
        machine: v.machine || '—',
        n: `${v.n_passed ?? '?'}/${v.n_graded ?? '?'}`,
        eff: pct(sweRate(v)),
        ci: sweCI(v) ? `[${pct(sweCI(v)?.[0])}–${pct(sweCI(v)?.[1])}]` : '—',
        perHour: fmt(num(v.solved_per_hour), 1),
        comparable: classifyCell(
          { n_graded: v.n_graded, comparable: v.comparable, owed: v.owed, n_exam: v.n_canon ?? v.n_exam, n_canon: v.n_canon },
          examMeta.value,
        ).rankable,
      })),
      id: group.key
    }
  })
})

const mainScorecardData = computed(() =>
  partitionBySection(scorecardRows.value, (r) => r._section).main
)
const incompleteScorecardData = computed(() => {
  const inc = partitionBySection(scorecardRows.value, (r) => r._section).incomplete
  return [...inc].sort((a, b) => (b.nRaw || 0) - (a.nRaw || 0) || ((b.eff ?? 0) as number) - ((a.eff ?? 0) as number))
})

const incompleteCount = computed(() => incompleteScorecardData.value.length)

const cols = computed<Column<any>[]>(() => [
  {
    key: 'model',
    label: t('col.model'),
    render: (r) => {
      const kids = [modelCell(r.__record)]
      if (r.variantCount > 0) {
        kids.push(foldedVariantsBadge(r.variantCount, t))
      }
      if (r._section === 'incomplete') {
        kids.push(runClassBadge({
          section: r._section,
          n: r._nGraded,
          nExam: r._nExam,
          owed: r._owed,
        }) as any)
      }
      const canonical = r.__record?.identity?.canonical_model
      if (canonical) {
        kids.push(
          h(
            RouterLink,
            {
              to: { path: '/swe/comp', query: { model: canonical } },
              class: 'text-[10px] text-brand hover:underline inline-flex items-center gap-0.5 whitespace-nowrap font-sans font-medium',
              title: t('scorecard.routes.tip')
            },
            () => t('scorecard.routes.label')
          )
        )
      }
      // Two compact lines: name + inline badges on line 1, the routes ↗ link on line 2.
      // (The old single flex-wrap row let the name/badges/link each wrap on a narrow column →
      //  3–4-line rows. A fixed 2-line column keeps rows short and tidy.)
      return h('span', { class: 'flex flex-col items-start gap-0.5 min-w-0' }, kids)
    }
  },
  {
    key: 'profile',
    label: t('col.evalProfile'),
    mobileHide: true,
    tabletHide: true,
    render: (r) => r.profile === '—' ? '—' : h('span', { class: 'text-muted-foreground font-mono text-xs' }, r.profile)
  },
  { key: 'machine', label: t('col.machineSwe'), mobileHide: true, render: (r) => machineCell(r.machine) },
  { key: 'n', label: t('col.passedGraded'), sortVal: (r) => r.nGraded, mobileHide: true },
  {
    key: 'coverage',
    label: t('col.coverage'),
    num: true,
    mobileHide: true,
    sortVal: (r) => (r.comparable ? 1e6 : 0) + r.nGraded,
    render: (r) => (r.nCanon === null ? '—' : `${r.nGraded}/${r.nCanon}`)
  },
  {
    key: 'eff',
    label: t('col.passRateHeadlineCI'),
    num: true,
    sortVal: (r) => (r.ranked ? 1e6 : 0) + (r.rankScore ?? -1),
    render: (r) => {
      if (r.eff === null) return '—'
      const kids = [
        h('span', { class: 'text-emerald-700 dark:text-emerald-400 font-semibold font-mono' }, pct(r.eff)),
        h('span', { class: 'text-muted-foreground text-xs font-normal ml-1 font-sans' }, `[${pct(r.ci?.[0])}–${pct(r.ci?.[1])}]`)
      ]
      if (r.tie) {
        kids.push(indicatorIconBadge(
          Trophy,
          t('tip.tieTop'),
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-amber-950/25 dark:text-amber-400',
          t('tip.tieTop'),
        ))
      }
      if (r.__record.suspect_error_count > 0) {
        kids.push(suspectErrorBadge(r.__record.suspect_error_count, t))
      }
      if (r.owed > 0) {
        const title = t('tip.owed').replace('{n}', String(r.owed))
        kids.push(indicatorIconBadge(
          History,
          title,
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:bg-amber-950/25 dark:text-amber-400',
          title,
        ))
      }
      return h('span', { class: 'inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-1' }, kids)
    }
  },
  {
    key: 'agency',
    label: t('col.agency'),
    mobileHide: true,
    sortVal: (r) => r.__record.agency?.noop_pct ?? -1,
    render: (r) => agencyBadge(r.__record.agency, r.__record)
  },
  { key: 'pps', label: t('col.pps'), num: true, mobileHide: true, tabletHide: true, render: (r) => fmt(r.pps, 0) },
  { key: 'tokSolved', label: t('col.tokSolved'), num: true, mobileHide: true, tabletHide: true, render: (r) => fmt(r.tokSolved, 0) },
  // median output tokens on FAILED tasks : on SOLVED ones. tok/✓ divides all output
  // by the passes, so a cell that spent its budget solving and one that burned it
  // retrying score the same; this separates them. >1 means the budget went to
  // flailing. Blank when either outcome subset is under the publisher's privacy floor.
  { key: 'tokWaste', label: t('col.tokWaste'), num: true, mobileHide: true, tabletHide: true, render: (r) => fmt(r.tokWaste, 2) },
  { key: 'secSolved', label: t('col.solveSpeedPass'), num: true, mobileHide: true, tabletHide: true, render: (r) => fmt(r.secSolved, 0) },
  {
    key: 'usdSolved',
    label: t('col.usdSolved'),
    num: true,
    mobileHide: true,
    render: (r) => {
      if (r.usdSolved === null) {
        return h('span', { class: 'text-muted-foreground/50', title: t('tip.priceUnknown') }, '—')
      }
      if (r.usdSolved === 0) {
        return h('span', { class: 'text-xs border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-950/25 px-1.5 py-0.5 rounded-full font-sans font-medium', title: t('tip.localFree') }, '$0')
      }
      return h('span', { class: 'font-mono' }, `$${r.usdSolved.toFixed(3)}`)
    }
  },
  { key: 'perHour', label: t('col.perHour'), num: true, mobileHide: true, render: (r) => fmt(r.perHour, 1) }
])

const drawChart = () => {
  if (vegaView) {
    vegaView.finalize()
    vegaView = null
  }

  if (!chartContainer.value) return
  // plan 053: chart uses rankable FULL only
  if (!mainScorecardData.value.length) {
    chartContainer.value.innerHTML = ''
    return
  }

  const data = mainScorecardData.value
    .filter((row) => row.comparable && row.eff !== null)
    .map((row) => {
    const c = row.__record
    const ranked = (c.n_graded || 0) >= MIN_GRADED
    const r = sweRate(c) ?? 0
    const ci = sweCI(c)
    const lo = ci ? ci[0] : r
    const hi = ci ? ci[1] : r

    return {
      model: modelName(c),
      label: `${modelName(c)} · ${c.n_passed}/${c.n_graded}`,
      eff: +(r * 100).toFixed(1),
      lo: +(lo * 100).toFixed(1),
      hi: +(hi * 100).toFixed(1),
      n: `${c.n_passed}/${c.n_graded}`,
      ranked,
      rankScore: (ranked ? 100 : 0) + lo * 100
    }
  })

  if (!data.length) {
    if (chartContainer.value) chartContainer.value.innerHTML = ''
    return
  }

  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    background: "transparent",
    autosize: { type: "fit", contains: "padding" },
    config: chartTheme(isDark.value),
    data: { values: data },
    width: "container",
    height: { step: 24 },
    encoding: {
      y: {
        field: "label",
        type: "nominal",
        title: null,
        sort: { field: "rankScore", order: "descending" },
        axis: { labelLimit: 280 }
      },
      opacity: {
        field: "ranked",
        type: "nominal",
        scale: { domain: [true, false], range: [1, 0.4] },
        legend: null
      }
    },
    layer: [
      {
        mark: { type: "bar", height: 14, tooltip: true },
        encoding: {
          x: { field: "eff", type: "quantitative", title: t("vega.passRatePct"), scale: { domain: [0, 100] } },
          color: { field: "eff", type: "quantitative", scale: { scheme: chartBlueScheme(isDark.value) }, legend: null },
          tooltip: [
            { field: "model", title: t("vega.tt.model") },
            { field: "n", title: t("vega.tt.passedGraded") },
            { field: "eff", title: t("vega.tt.passRatePct"), format: ".1f" },
            { field: "lo", title: t("vega.tt.wilsonLow"), format: ".0f" },
            { field: "hi", title: t("vega.tt.wilsonHigh"), format: ".0f" },
            { field: "ranked", title: t("vega.tt.ranked") }
          ]
        }
      },
      {
        mark: { type: "rule", color: isDark.value ? "#e2e8f0" : "#475569", opacity: 0.7 },
        encoding: { x: { field: "lo", type: "quantitative" }, x2: { field: "hi" } }
      },
      {
        mark: { type: "text", align: "left", dx: 5, color: isDark.value ? "#e2e8f0" : "#475569", fontSize: 11, font: "Geist, system-ui, sans-serif" },
        encoding: { x: { field: "hi", type: "quantitative" }, text: { field: "eff", format: ".0f" } }
      }
    ]
  }

  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: "svg" })
    .then((res) => {
      vegaView = res.view
    })
    .catch((err) => {
      console.error('SweScorecard chart failed to render:', err)
    })
}

watch([mainScorecardData, chartContainer, isDark], () => {
  drawChart()
}, { immediate: true })

onMounted(() => {
  if (typeof window !== "undefined" && window.matchMedia) {
    mq = window.matchMedia("(max-width: 47.99rem)")
    isMobile.value = mq.matches
    chartOpen.value = !mq.matches
    mq.addEventListener("change", onMq)
  }
  drawChart()
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
    <ExamVersionBar />
    <BoardFilterBanner :filter="boardFilter.active.value" @clear="boardFilter.clearFilter" />

    <!-- Chart Card -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('swe.passRateByModel.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground" v-html="t('swe.scorecard.desc1')"></p>
      </CardHeader>
      <CardContent>
        <div v-if="loading" class="h-48 flex items-center justify-center text-muted-foreground text-sm font-mono animate-pulse">
          {{ t('state.rendering') }}
        </div>
        <div v-else-if="!mainScorecardData.length && !incompleteScorecardData.length" class="text-muted-foreground text-sm p-4 text-center">
          {{ t('empty.sweCells') }}
        </div>
        <template v-else>
          <button type="button" class="md:hidden w-full mb-2 py-2 text-xs font-medium rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground transition-colors" @click="chartOpen = !chartOpen">
            {{ chartOpen ? t("chart.hide") : t("chart.show") }}
          </button>
          <div v-if="chartOpen" class="w-full">
            <div ref="chartContainer" class="w-full"></div>
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Scorecard Table Card (plan 053 dual-section) -->
    <Card class="border-border bg-card shadow-lg">
      <CardHeader class="pb-2">
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('swe.scorecard.title') }}
        </CardTitle>
        <p class="text-xs text-muted-foreground">{{ t('swe.scorecard.scope') }}</p>
        <p class="text-xs text-muted-foreground" v-html="t('swe.scorecard.desc2')"></p>
        <div
          v-if="archivedBanner"
          class="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{{ archivedBanner }}</span>
        </div>
        <div
          v-if="incompleteCount > 0"
          class="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{{ t('swe.scorecard.staleBanner').replace('{n}', String(incompleteCount)) }}</span>
        </div>
      </CardHeader>
      <CardContent class="space-y-5">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h3 class="text-sm font-semibold text-foreground">{{ t('runClass.section.main') }}</h3>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('runClass.section.count').replace('{n}', String(mainScorecardData.length)) }}
            </span>
          </div>
          <DataTable
            v-if="mainScorecardData.length"
            :columns="cols"
            :rows="mainScorecardData"
            row-id-key="id"
            :default-sort="'eff'"
            :default-dir="'desc'"
            :expandable="true"
            fixed-layout
          >
            <template #detail="{ row }">
              <div v-if="row.variantCount > 0" class="space-y-2">
                <div>
                  <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                  <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
                </div>
                <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
                  <table class="w-full text-left text-[11px]">
                    <thead class="border-b border-border/60 text-muted-foreground">
                      <tr>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.evalProfile') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passedGraded') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.perHour') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="variant in row.variants" :key="`${variant.model}-${variant.profile}-${variant.machine}`" :class="variant.comparable ? '' : 'opacity-50'">
                        <td class="px-2 py-1.5 font-mono">{{ variant.model }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.profile }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.machine }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.n }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.perHour }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </DataTable>
          <div v-else class="text-muted-foreground text-sm p-3 text-center">{{ t('empty.sweCells') }}</div>
        </div>

        <div v-if="incompleteScorecardData.length" class="border-t border-border/60 pt-4 space-y-2">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="space-y-1">
              <h3 class="text-sm font-semibold text-muted-foreground">{{ t('runClass.section.incomplete') }}</h3>
              <p class="text-xs text-muted-foreground">{{ t('runClass.section.incompleteDesc') }}</p>
            </div>
            <span class="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
              {{ t('runClass.section.count').replace('{n}', String(incompleteScorecardData.length)) }}
            </span>
          </div>
          <DataTable
            :columns="cols"
            :rows="incompleteScorecardData"
            row-id-key="id"
            :default-sort="'nRaw'"
            :default-dir="'desc'"
            :expandable="true"
            fixed-layout
          >
            <template #detail="{ row }">
              <div v-if="row.variantCount > 0" class="space-y-2">
                <div>
                  <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
                  <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
                </div>
                <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
                  <table class="w-full text-left text-[11px]">
                    <thead class="border-b border-border/60 text-muted-foreground">
                      <tr>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.model') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.evalProfile') }}</th>
                        <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passedGraded') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
                        <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.perHour') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="variant in row.variants" :key="`${variant.model}-${variant.profile}-${variant.machine}`" :class="variant.comparable ? '' : 'opacity-50'">
                        <td class="px-2 py-1.5 font-mono">{{ variant.model }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.profile }}</td>
                        <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ variant.machine }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.n }}</td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.eff }} <span class="text-muted-foreground">{{ variant.ci }}</span></td>
                        <td class="px-2 py-1.5 text-right font-mono">{{ variant.perHour }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </DataTable>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
