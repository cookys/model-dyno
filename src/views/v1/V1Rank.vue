<script setup lang="ts">
/**
 * V1 Rank — "who is strongest", readable by non-experts.
 * One folded row per model, "solved X / N" leads, percentages and CI live in
 * hover text, cloud vs local is a visible badge, and anything that didn't
 * finish the full exam sits collapsed at the bottom instead of polluting the
 * ranking. Row click = the model's file.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { scorecardSweMeta, sweCellsByExam, taskDomains } from '@/lib/store'
import { frontierComparison } from '@/lib/speedFrontier'
import { domainLabel } from '@/lib/domainBreakdown'
import {
  chooseBestScorecardCell,
  groupByCanonicalModel,
  variantCount as foldedVariantCount,
} from '@/lib/modelFolding'
import { classifyCell } from '@/lib/runClass'
import { resolveExamMeta } from '@/lib/examMeta'
import { sweRate, sweCI, num } from '@/components/CellHelpers'
import ScorePill from '@/components/v1/ScorePill.vue'
import ExamBadge from '@/components/v1/ExamBadge.vue'
import ExamCoverageChip from '@/components/v1/ExamCoverageChip.vue'
import CredibilityChip from '@/components/v1/CredibilityChip.vue'
import RunStabilityNote from '@/components/v1/RunStabilityNote.vue'
import UsageQuadrantGrid from '@/components/v1/UsageQuadrantGrid.vue'
import DomainHeatmapTable from '@/components/v1/DomainHeatmapTable.vue'
import Term from '@/components/v1/Term.vue'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy, Cloud, HardDrive, ChevronDown, Swords } from 'lucide-vue-next'

const { locale } = useI18n()
const router = useRouter()

const scope = ref<'all' | 'local' | 'cloud'>('all')

const MIN_GRADED = 8
const examMeta = computed(() => resolveExamMeta(scorecardSweMeta.value))
const currentExamId = computed(() => scorecardSweMeta.value?.current_exam ?? null)

interface RankRow {
  key: string
  canonical: string
  cell: any
  isLocal: boolean
  passed: number
  graded: number
  ci: [number, number] | null
  rankScore: number
  rankable: boolean
  variants: number
  medWallMin: number | null
  solvedPerHour: number | null
  tokPerSolved: number | null
  usdPerSolved: number | null
  priceKnown: boolean
  billing: string | null
  scoredAt: string | null
  tie: boolean
  examVersion: string | null
  nRuns: number | null
  headlineRange: [number, number] | null
}

const folded = computed(() =>
  groupByCanonicalModel(
    sweCellsByExam.value,
    chooseBestScorecardCell,
    (c) => `${c.model}-${c.profile || ''}-${c.machine || ''}-${c.canonical_version || ''}`,
  ),
)

const allRows = computed<RankRow[]>(() => {
  return folded.value.map((group) => {
    const c = group.representative
    const cls = classifyCell(
      { n_graded: c.n_graded, comparable: c.comparable, owed: c.owed, n_exam: c.n_canon ?? c.n_exam, n_canon: c.n_canon },
      examMeta.value,
    )
    const ci = sweCI(c)
    const rankable = cls.rankable && (c.n_graded || 0) >= MIN_GRADED && num(sweRate(c)) !== null
    return {
      key: group.key,
      canonical: c.identity?.canonical_model || c.model,
      cell: c,
      isLocal: (c.identity?.access ?? '') === 'local',
      passed: c.n_passed ?? 0,
      graded: c.n_graded ?? 0,
      ci,
      rankScore: rankable ? (num(ci?.[0]) ?? num(sweRate(c)) ?? -1) : -1,
      rankable,
      variants: foldedVariantCount(group),
      medWallMin: c.med_wall != null ? c.med_wall / 60 : null,
      solvedPerHour: c.solved_per_hour ?? null,
      // OUTPUT tokens per solved task (the feed derives it from usage.output_tokens).
      // Output — not input — on purpose: input counts are inflated on routes with no
      // cache discount, which would make local cells look wasteful for a billing reason
      // rather than a model one. Output is comparable across cache regimes.
      tokPerSolved: c.tok_per_solved ?? null,
      usdPerSolved: c.usd_per_solved ?? null,
      priceKnown: c.price_known === true,
      billing: c.billing ?? null,
      scoredAt: c.scored_at ? c.scored_at.slice(0, 10) : null,
      tie: false,
      examVersion: c.canonical_version ?? null,
      nRuns: c.n_runs ?? null,
      headlineRange: c.headline_range ?? null,
    }
  })
})

const scoped = computed(() =>
  allRows.value.filter((r) => {
    if (scope.value === 'local') return r.isLocal
    if (scope.value === 'cloud') return !r.isLocal
    return true
  }),
)

const rankedRows = computed(() => {
  const rows = scoped.value.filter((r) => r.rankable).sort((a, b) => b.rankScore - a.rankScore)
  const top = rows[0]
  if (top?.ci) {
    for (const r of rows) {
      if (r === top || !r.ci) continue
      r.tie = Math.max(r.ci[0], top.ci[0]) <= Math.min(r.ci[1], top.ci[1])
    }
  }
  return rows
})

const unrankedRows = computed(() =>
  scoped.value.filter((r) => !r.rankable).sort((a, b) => b.graded - a.graded),
)

const fmtTok = (n: number | null) =>
  n == null ? '—' : n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))

/** `—` when no published rate exists (a data gap, never $0 — plan 056), `~` when the cell
 *  is billed by subscription and the number is notional rather than money actually spent. */
const fmtUsd = (r: RankRow) => {
  if (r.usdPerSolved == null || !r.priceKnown) return '—'
  const tilde = r.billing === 'subscription' || r.billing === 'token_plan' ? '~' : ''
  return `${tilde}$${r.usdPerSolved < 1 ? r.usdPerSolved.toFixed(2) : r.usdPerSolved.toFixed(1)}`
}

const goModel = (r: RankRow) => router.push(`/v1/model/${encodeURIComponent(r.canonical)}`)

// ---- Cloud frontier: how far is the best local model from the best cloud model? ----
const frontier = computed(() => frontierComparison(sweCellsByExam.value, taskDomains.value))
// Tasks the local fleet broadly stalls on (largest cloud-vs-local solve-share gap).
const locallyHard = computed(() =>
  (frontier.value?.taskGaps ?? []).filter((g) => g.gap >= 0.15).slice(0, 6),
)
const dLabel = (d: string | null) => (d ? (locale.value === 'zh' ? domainLabel(d).zh : domainLabel(d).en) : '—')
const pct = (v: number) => `${Math.round(v * 100)}%`
</script>

<template>
  <div class="space-y-5">
    <ExamVersionBar />

    <div class="flex items-end justify-between flex-wrap gap-3">
      <div class="space-y-1">
        <h2 class="text-xl font-bold tracking-tight">{{ locale === 'zh' ? '誰最強？' : 'Who is strongest?' }}</h2>
        <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
          <template v-if="locale === 'zh'">
            雲端與本地模型考同一份卷。名次由分數的保守下限排序，
            <Term k="tied" /> 的模型視為同水準（獎盃標記）。
          </template>
          <template v-else>
            Cloud and local models take the same exam. Ranked by the conservative lower bound;
            a trophy marks a <Term k="tied" label="statistical tie" /> with #1.
          </template>
        </p>
      </div>

      <!-- Scope chips -->
      <div class="flex items-center gap-1 rounded-lg bg-muted/60 p-1 border border-border">
        <button
          v-for="opt in (['all', 'local', 'cloud'] as const)"
          :key="opt"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer"
          :class="scope === opt ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
          @click="scope = opt"
        >
          {{ opt === 'all' ? (locale === 'zh' ? '全部' : 'All')
            : opt === 'local' ? (locale === 'zh' ? '只看本地' : 'Local only')
            : (locale === 'zh' ? '只看雲端' : 'Cloud only') }}
        </button>
      </div>
    </div>

    <!-- Ranked table -->
    <Card class="overflow-hidden">
      <CardContent class="p-0">
        <table class="w-full text-sm">
          <thead class="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2.5 text-left w-10">#</th>
              <th class="px-3 py-2.5 text-left">{{ locale === 'zh' ? '模型' : 'Model' }}</th>
              <th class="px-3 py-2.5 text-right">
                {{ locale === 'zh' ? '解題成績' : 'Score' }}
              </th>
              <th class="px-3 py-2.5 text-right hidden md:table-cell">
                {{ locale === 'zh' ? '每題耗時（中位）' : 'Time per task (median)' }}
              </th>
              <th class="px-3 py-2.5 text-right hidden lg:table-cell" :title="locale === 'zh' ? '每小時解掉幾題（含失敗題耗時）— 能力×速度的實用指標' : 'Tasks solved per wall-clock hour (fail time included) — capability × speed'">
                {{ locale === 'zh' ? '解題/小時' : 'Solved/hr' }}
              </th>
              <th
                class="px-3 py-2.5 text-right hidden xl:table-cell"
                :title="locale === 'zh'
                  ? '每解一題花的輸出 token（中位以外的完整加總 ÷ 解出題數）。用輸出而非輸入：沒有 cache 折抵的路線輸入會膨脹，拿來比會冤枉本地模型。'
                  : 'Output tokens burned per solved task. Output, not input: input is inflated on routes without a cache discount, which would penalise local cells for a billing reason rather than a model one.'"
              >
                {{ locale === 'zh' ? 'token/題' : 'tok/solved' }}
              </th>
              <th
                class="px-3 py-2.5 text-right hidden xl:table-cell"
                :title="locale === 'zh'
                  ? '每解一題的現金成本(list price × 實測用量)。訂閱制標 ~ 表示名目值,真實限制是額度;沒有牌價的格顯示 — ,那是資料缺口而非免費。'
                  : 'Cash per solved task (list price × measured usage). ~ marks a subscription cell, where the figure is notional and the real constraint is quota. — means no published rate: a data gap, never free.'"
              >
                {{ locale === 'zh' ? '$/題' : '$/solved' }}
              </th>
              <th class="px-3 py-2.5 text-left hidden lg:table-cell">{{ locale === 'zh' ? '考卷' : 'Exam' }}</th>
              <th class="px-3 py-2.5 text-center hidden md:table-cell">
                <Term k="gates" :label="locale === 'zh' ? '可信度' : 'Credibility'" />
              </th>
              <th class="px-3 py-2.5 text-right hidden sm:table-cell">{{ locale === 'zh' ? '實測日' : 'Date' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in rankedRows"
              :key="r.key"
              class="border-b border-border/40 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
              @click="goModel(r)"
            >
              <td class="px-3 py-2.5 font-mono text-muted-foreground text-xs">{{ i + 1 }}</td>
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono font-semibold text-foreground">{{ r.canonical }}</span>
                  <span
                    class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                    :class="r.isLocal
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'"
                  >
                    <HardDrive v-if="r.isLocal" class="h-2.5 w-2.5" />
                    <Cloud v-else class="h-2.5 w-2.5" />
                    {{ r.isLocal ? (locale === 'zh' ? '本地' : 'local') : (locale === 'zh' ? '雲端' : 'cloud') }}
                  </span>
                  <span v-if="r.variants > 0" class="text-[10px] text-muted-foreground">
                    +{{ r.variants }} {{ locale === 'zh' ? '變體' : 'variants' }}
                  </span>
                  <Trophy v-if="i === 0 || r.tie" class="h-3.5 w-3.5 text-amber-500" :title="locale === 'zh' ? '與第一名統計並列' : 'Tied with #1'" />
                </div>
              </td>
              <td class="px-3 py-2.5 text-right">
                <div class="flex flex-col items-end gap-0.5">
                  <div class="flex items-center gap-1">
                    <ScorePill :passed="r.passed" :total="r.graded" :ci="r.ci" compact />
                    <ExamCoverageChip :cell="r.cell" />
                  </div>
                  <RunStabilityNote :n-runs="r.nRuns" :range="r.headlineRange" />
                </div>
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-xs hidden md:table-cell">
                {{ r.medWallMin != null ? `${r.medWallMin.toFixed(1)} ${locale === 'zh' ? '分鐘' : 'min'}` : '—' }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-xs hidden lg:table-cell">
                {{ r.solvedPerHour != null ? r.solvedPerHour.toFixed(1) : '—' }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-xs hidden xl:table-cell"
                  :class="r.tokPerSolved == null ? 'text-muted-foreground' : ''">
                {{ fmtTok(r.tokPerSolved) }}
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-xs hidden xl:table-cell"
                  :class="fmtUsd(r) === '—' ? 'text-muted-foreground' : ''"
                  :title="fmtUsd(r) === '—'
                    ? (locale === 'zh' ? '這一格沒有已發布的牌價 — 是資料缺口,不是免費' : 'No published rate for this cell — a data gap, not free')
                    : (r.billing === 'subscription' || r.billing === 'token_plan'
                        ? (locale === 'zh' ? '訂閱/方案制:此為名目值,真實限制是額度' : 'Subscription/plan: notional figure; the real constraint is quota')
                        : '')">
                {{ fmtUsd(r) }}
              </td>
              <td class="px-3 py-2.5 hidden lg:table-cell">
                <ExamBadge :version="r.examVersion" :current-exam="currentExamId" />
              </td>
              <td class="px-3 py-2.5 text-center hidden md:table-cell">
                <CredibilityChip :cell="r.cell" />
              </td>
              <td class="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                {{ r.scoredAt ?? '—' }}
              </td>
            </tr>
            <tr v-if="!rankedRows.length">
              <td colspan="10" class="px-3 py-8 text-center text-sm text-muted-foreground">
                {{ locale === 'zh' ? '這個範圍還沒有滿卷成績。' : 'No full-exam results in this scope yet.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>

    <!-- Cloud frontier: best local vs best cloud, in actual tasks -->
    <section v-if="frontier" class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Swords class="h-4 w-4 text-brand" />
        {{ locale === 'zh' ? '本地最強離雲端最強多遠？' : 'How far is the best local model from the best cloud model?' }}
      </h3>
      <Card>
        <CardContent class="p-4 space-y-4">
          <!-- Champions head-to-head -->
          <div class="grid sm:grid-cols-2 gap-3">
            <div class="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Cloud class="h-3 w-3" /> {{ locale === 'zh' ? '雲端最強' : 'Best cloud' }}
                </div>
                <div class="font-mono text-sm font-bold truncate">{{ frontier.bestCloud.model }}</div>
              </div>
              <ScorePill :passed="frontier.bestCloud.n_passed" :total="frontier.bestCloud.n_graded" :ci="frontier.bestCloud.headline_ci ?? null" compact />
              <ExamCoverageChip :cell="frontier.bestCloud" />
            </div>
            <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <HardDrive class="h-3 w-3" /> {{ locale === 'zh' ? '本地最強' : 'Best local' }}
                </div>
                <div class="font-mono text-sm font-bold truncate">{{ frontier.bestLocal.model }}</div>
              </div>
              <ScorePill :passed="frontier.bestLocal.n_passed" :total="frontier.bestLocal.n_graded" :ci="frontier.bestLocal.headline_ci ?? null" compact />
              <ExamCoverageChip :cell="frontier.bestLocal" />
            </div>
          </div>

          <!-- The exact tasks between them -->
          <div v-if="frontier.flip" class="space-y-1.5">
            <div class="text-xs font-semibold text-muted-foreground">
              {{ locale === 'zh'
                ? `差距的內容物：雲端冠軍多解 ${frontier.flip.aOnly.length} 題、本地冠軍反超 ${frontier.flip.bOnly.length} 題、${frontier.flip.bothPass} 題兩邊都過。`
                : `What the gap is made of: cloud champion solves ${frontier.flip.aOnly.length} tasks the local one doesn't; local wins ${frontier.flip.bOnly.length} back; ${frontier.flip.bothPass} solved by both.` }}
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="f in frontier.flip.aOnly"
                :key="f.taskId"
                class="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono"
                :title="f.taskId"
              >
                <Cloud class="h-2.5 w-2.5" /> {{ dLabel(f.domain) }}
                <span v-if="f.bVerdict === 'ERROR'" class="text-rose-500">(ERROR)</span>
              </span>
              <span
                v-for="f in frontier.flip.bOnly"
                :key="f.taskId"
                class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono"
                :title="f.taskId"
              >
                <HardDrive class="h-2.5 w-2.5" /> {{ dLabel(f.domain) }}
              </span>
            </div>
          </div>

          <!-- Tasks the local fleet broadly stalls on -->
          <div v-if="locallyHard.length" class="space-y-1.5 border-t border-border/60 pt-3">
            <div class="text-xs font-semibold text-muted-foreground">
              {{ locale === 'zh'
                ? `本地普遍卡住的題（${frontier.nLocalCells} 份本地成績 vs ${frontier.nCloudCells} 份雲端成績的過題率差）：`
                : `Tasks the local fleet broadly stalls on (solve-share across ${frontier.nLocalCells} local vs ${frontier.nCloudCells} cloud results):` }}
            </div>
            <div class="space-y-1">
              <div
                v-for="g in locallyHard"
                :key="g.taskId"
                class="flex items-center gap-2 text-[11px] font-mono"
                :title="g.taskId"
              >
                <span class="w-32 truncate">{{ dLabel(g.domain) }}</span>
                <span class="w-20 text-right text-emerald-700 dark:text-emerald-400">{{ locale === 'zh' ? '本地' : 'local' }} {{ pct(g.localShare) }}</span>
                <div class="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div class="absolute inset-y-0 left-0 bg-emerald-500/60" :style="{ width: pct(g.localShare) }" />
                  <div class="absolute inset-y-0 bg-sky-500/50" :style="{ left: pct(g.localShare), width: pct(Math.max(0, g.cloudShare - g.localShare)) }" />
                </div>
                <span class="w-20 text-sky-700 dark:text-sky-400">{{ locale === 'zh' ? '雲端' : 'cloud' }} {{ pct(g.cloudShare) }}</span>
              </div>
            </div>
          </div>

          <p class="text-[10px] text-muted-foreground leading-relaxed">
            {{ locale === 'zh'
              ? '兩位冠軍考的是同一份卷；「普遍卡住」看的是全體過題率差而不是單一模型，比較不受單卷波動影響。'
              : 'Both champions took the same exam; "broadly stalls" compares fleet-wide solve shares, not one model — less sensitive to single-run noise.' }}
          </p>
        </CardContent>
      </Card>
    </section>

    <!-- Usage quadrant (acc × speed buckets) -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ locale === 'zh' ? '又快又準在哪？' : 'Fast and accurate — where?' }}
      </h3>
      <UsageQuadrantGrid :cells="sweCellsByExam" />
    </section>

    <!-- Fleet domain heatmap -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ locale === 'zh' ? '全站領域強弱' : 'Fleet domain strengths' }}
      </h3>
      <DomainHeatmapTable />
    </section>

    <!-- Unranked, collapsed by default -->
    <details v-if="unrankedRows.length" class="group">
      <summary class="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none">
        <ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        {{ locale === 'zh'
          ? `沒考完整份卷的 ${unrankedRows.length} 筆（僅供參考，不入排名 — 分數可能偏高或偏低）`
          : `${unrankedRows.length} incomplete runs (reference only — scores may be inflated or deflated)` }}
      </summary>
      <Card class="mt-2 overflow-hidden opacity-80">
        <CardContent class="p-0">
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="r in unrankedRows"
                :key="r.key"
                class="border-b border-border/40 last:border-0 hover:bg-muted/30 cursor-pointer"
                @click="goModel(r)"
              >
                <td class="px-3 py-2 font-mono text-xs">{{ r.canonical }}</td>
                <td class="px-3 py-2 text-right">
                  <ScorePill :passed="r.passed" :total="r.graded" :ci="r.ci" compact />
                </td>
                <td class="px-3 py-2 text-right font-mono text-[10px] text-muted-foreground hidden sm:table-cell">
                  {{ r.scoredAt ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </details>
  </div>
</template>
