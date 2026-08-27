<script setup lang="ts">
/**
 * V1 Model Detail — the model's file, verdict first.
 * A visitor should get the answer ("use the NVFP4 build, it solves 29/34,
 * ~88% of the best cloud agent, runs on a 24GB card") in the first screen,
 * and only then scroll into the evidence: version comparisons, lineage,
 * domain strengths, and the raw receipt table with experiment legs labelled.
 */
import { computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { dashboardRecords, sweCellsByExam, modelRegistry, fleetMachines, taskDomains } from '@/lib/store'
import { variantReceiptsForModel, wilsonLowOf, type VariantReceipt } from '@/lib/receipts'
import { matchedPairsForModel } from '@/lib/matchedPairs'
import { domainScoresFromVerdicts, failedTasksFromCell } from '@/lib/taskMatrix'
import { cloudAnchor, anchorRatio, ratioPhrase, passFraction, machineForCell } from '@/lib/advisor'
import { domainLabel } from '@/lib/domainBreakdown'
import DataTable, { type Column } from '@/components/DataTable.vue'
import { Card, CardContent } from '@/components/ui/card'
import RecipeCard from '@/components/v1/RecipeCard.vue'
import LineageTreeView from '@/components/v1/LineageTreeView.vue'
import DomainRadarBar from '@/components/v1/DomainRadarBar.vue'
import EngineComparisonTable from '@/components/v1/EngineComparisonTable.vue'
import QuantComparisonTable from '@/components/v1/QuantComparisonTable.vue'
import ScorePill from '@/components/v1/ScorePill.vue'
import CredibilityChip from '@/components/v1/CredibilityChip.vue'
import RunStabilityNote from '@/components/v1/RunStabilityNote.vue'
import Term from '@/components/v1/Term.vue'
import ChannelParityCard from '@/components/v1/ChannelParityCard.vue'
import ExamCoverageChip from '@/components/v1/ExamCoverageChip.vue'
import MatchedPairList from '@/components/v1/MatchedPairList.vue'
import { hwOf, num } from '@/components/CellHelpers'
import { ArrowLeft, Cloud, HardDrive, ChevronDown, Cpu } from 'lucide-vue-next'

const props = defineProps<{ alias: string }>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const router = useRouter()

const goBack = () => {
  if (window.history.state && window.history.state.back) router.back()
  else router.push('/v1/rank')
}

const receipts = computed(() =>
  variantReceiptsForModel(props.alias, sweCellsByExam.value, modelRegistry.value),
)

const bestReceipt = computed(() => {
  const ranked = receipts.value
    .filter((r) => r.rankable)
    .sort((a, b) => wilsonLowOf(b.cell) - wilsonLowOf(a.cell))
  return ranked[0] ?? receipts.value[0] ?? null
})

const isLocal = computed(() => (bestReceipt.value?.cell.identity?.access ?? '') === 'local')
const anchor = computed(() => cloudAnchor(sweCellsByExam.value))
const isAnchor = computed(() => {
  const a = anchor.value
  return a != null && (a.identity?.canonical_model ?? a.model) === props.alias
})

const measuredMachine = computed(() =>
  bestReceipt.value ? machineForCell(bestReceipt.value.cell, fleetMachines.value) : null,
)

const scoredDate = computed(() => {
  const iso = bestReceipt.value?.cell.scored_at
  return iso ? String(iso).slice(0, 10) : null
})

/** The verdict paragraph — every clause traces to a receipt field. */
const verdict = computed(() => {
  const r = bestReceipt.value
  if (!r || !r.rankable) {
    return zh.value
      ? '這個模型還沒有完成滿卷的可比成績 — 下面的收據僅供參考。'
      : 'This model has no full-exam rankable result yet — receipts below are reference only.'
  }
  const c = r.cell
  const parts: string[] = []
  if (zh.value) {
    parts.push(`最佳配置在 ${c.n_graded} 道真實 coding 題中解出 ${c.n_passed} 題`)
    if (!isAnchor.value && anchor.value) {
      const ratio = ratioPhrase(anchorRatio(c, anchor.value), 'zh')
      const aName = anchor.value.identity?.canonical_model ?? anchor.value.model
      if (ratio) parts.push(`約為雲端最強 ${aName}（${passFraction(anchor.value)}）的 ${ratio}功力`)
    } else if (isAnchor.value) {
      parts.push('是目前全站的雲端最強錨點')
    }
    if (r.registry?.quant) parts.push(`該配置用 ${r.registry.quant} 量化`)
    if (r.axes.engine) parts.push(`跑在 ${r.axes.engine}${r.axes.engineInferred ? '（推斷）' : ''}`)
    if (measuredMachine.value?.gpu_name) parts.push(`實測機器是 ${measuredMachine.value.gpu_name}`)
    return parts.join('，') + '。'
  }
  parts.push(`Best config solved ${c.n_passed} of ${c.n_graded} real coding tasks`)
  if (!isAnchor.value && anchor.value) {
    const ratio = ratioPhrase(anchorRatio(c, anchor.value), 'en')
    const aName = anchor.value.identity?.canonical_model ?? anchor.value.model
    if (ratio) parts.push(`roughly ${ratio} of the best cloud agent ${aName} (${passFraction(anchor.value)})`)
  } else if (isAnchor.value) {
    parts.push('currently the site-wide cloud anchor')
  }
  if (r.registry?.quant) parts.push(`using the ${r.registry.quant} quant`)
  if (r.axes.engine) parts.push(`served by ${r.axes.engine}${r.axes.engineInferred ? ' (inferred)' : ''}`)
  if (measuredMachine.value?.gpu_name) parts.push(`measured on ${measuredMachine.value.gpu_name}`)
  return parts.join(', ') + '.'
})

// ---- Controlled single-variable pairs for this model --------------------------

const modelPairs = computed(() => matchedPairsForModel(receipts.value))

// ---- Domain strengths derived from the BEST receipt's own per-task verdicts ----

const bestDomainScores = computed(() =>
  bestReceipt.value
    ? domainScoresFromVerdicts(bestReceipt.value.cell, taskDomains.value)
    : [],
)

const failedTasks = computed(() =>
  bestReceipt.value
    ? failedTasksFromCell(bestReceipt.value.cell, taskDomains.value)
    : [],
)

const dLabel = (d: string | null) => {
  if (!d) return '—'
  return zh.value ? domainLabel(d).zh : domainLabel(d).en
}

// ---- Full receipt table (all variants, experiment legs labelled) -------------

const fmtDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—')

interface VariantRow {
  id: string
  cellName: string
  quant: string
  axes: string
  score: string
  rate: number | null
  role: string
  machine: string
  date: string
  rankable: boolean
}

const variantRows = computed<VariantRow[]>(() =>
  receipts.value.map((r: VariantReceipt, i): VariantRow => {
    const axes: string[] = []
    if (r.axes.engine) axes.push(r.axes.engine + (r.axes.engineInferred ? '*' : ''))
    if (r.axes.spec && r.axes.spec !== 'none') axes.push(`spec:${r.axes.spec}`)
    if (r.axes.tp != null) axes.push(`TP${r.axes.tp}`)
    if (r.axes.ctxK != null) axes.push(`ctx ${r.axes.ctxK}k`)
    if (r.axes.thinking) axes.push(`think ${r.axes.thinking}`)
    if (r.axes.tempZero) axes.push('temp 0')
    if (r.modType !== 'official') axes.push(r.modType)
    return {
      id: r.cell.cell ?? `${i}`,
      cellName: r.cell.cell ?? '—',
      quant: r.registry?.quant ?? '—',
      axes: axes.join(' · ') || '—',
      score: r.cell.n_passed != null && r.cell.n_graded != null ? `${r.cell.n_passed}/${r.cell.n_graded}` : '—',
      rate: r.cell.headline ?? null,
      role: r.rankable
        ? (zh.value ? '✅ 可比' : '✅ rankable')
        : (r.cell.run_role ? `🧪 ${r.cell.run_role}` : (zh.value ? '🧪 實驗腿/不完整' : '🧪 experiment/partial')),
      machine: r.cell.machine ?? '—',
      date: fmtDate(r.cell.scored_at),
      rankable: r.rankable,
    }
  }),
)

const variantCols = computed<Column<VariantRow>[]>(() => [
  {
    key: 'cellName',
    label: zh.value ? 'Cell（收據）' : 'Cell (receipt)',
    render: (r) => h('span', { class: 'font-mono text-[10px] break-all' }, r.cellName),
  },
  { key: 'quant', label: zh.value ? '量化' : 'Quant' },
  { key: 'axes', label: zh.value ? '變因' : 'Axes', mobileHide: true },
  {
    key: 'rate',
    label: zh.value ? '成績' : 'Score',
    num: true,
    render: (r) => h(
      'span',
      { class: r.rankable ? 'font-mono font-bold text-emerald-600 dark:text-emerald-400' : 'font-mono text-muted-foreground' },
      r.score,
    ),
  },
  { key: 'role', label: zh.value ? '身份' : 'Role' },
  { key: 'machine', label: zh.value ? '機器' : 'Machine', mobileHide: true },
  { key: 'date', label: zh.value ? '實測日' : 'Date', mobileHide: true },
])

// ---- Cross-hardware speed records ---------------------------------------------

const modelRuns = computed(() => {
  const key = props.alias.toLowerCase()
  return dashboardRecords.value.filter((r) => {
    const alias = (r.model_alias ?? '').toLowerCase()
    return alias === key || alias.includes(key) || key.includes(alias)
  })
})

const speedRows = computed(() =>
  modelRuns.value.map((r, i) => ({
    id: `${i}-${r.profile}`,
    hw: hwOf(r),
    profile: r.profile,
    engine: [r.engine, r.engine_tag].filter(Boolean).join(':') || '—',
    quant: r.quant || '—',
    tg: num(r.tg128_tps),
    pp: num(r.pp512_tps),
  })),
)

const speedCols = computed<Column<any>[]>(() => [
  { key: 'hw', label: zh.value ? '測試硬體' : 'Hardware' },
  { key: 'profile', label: 'Profile', mobileHide: true },
  { key: 'engine', label: zh.value ? '引擎' : 'Engine', mobileHide: true },
  { key: 'quant', label: zh.value ? '量化' : 'Quant' },
  {
    key: 'tg',
    label: zh.value ? '生成速度 (tg128)' : 'tg128 tok/s',
    num: true,
    render: (r) => r.tg ? h('span', { class: 'font-mono font-bold text-emerald-600 dark:text-emerald-400' }, `${r.tg} t/s`) : '—',
  },
  {
    key: 'pp',
    label: zh.value ? '處理速度 (pp512)' : 'pp512 tok/s',
    num: true,
    mobileHide: true,
    render: (r) => r.pp ? h('span', { class: 'font-mono' }, `${r.pp} t/s`) : '—',
  },
])
</script>

<template>
  <div class="space-y-6">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      @click="goBack"
    >
      <ArrowLeft class="h-3.5 w-3.5" />
      {{ zh ? '返回' : 'Back' }}
    </button>

    <!-- Verdict header -->
    <Card class="border-2 border-brand/30 bg-gradient-to-br from-brand/5 to-transparent">
      <CardContent class="p-5 sm:p-6 space-y-4">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div class="space-y-2 min-w-0">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h2 class="text-2xl font-bold font-mono text-foreground">{{ alias }}</h2>
              <span
                class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                :class="isLocal
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'"
              >
                <HardDrive v-if="isLocal" class="h-3 w-3" />
                <Cloud v-else class="h-3 w-3" />
                {{ isLocal ? (zh ? '本地模型' : 'local') : (zh ? '雲端 API' : 'cloud API') }}
              </span>
            </div>
            <p class="text-sm text-foreground/90 leading-relaxed max-w-2xl">{{ verdict }}</p>
            <div class="flex items-center gap-3 flex-wrap">
              <CredibilityChip :cell="bestReceipt?.cell" />
              <RunStabilityNote
                :n-runs="bestReceipt?.cell.n_runs"
                :range="bestReceipt?.cell.headline_range ?? null"
              />
            </div>
            <div class="flex items-center gap-3 text-xs font-mono text-muted-foreground flex-wrap">
              <span v-if="scoredDate">{{ zh ? '收據日期' : 'receipt' }}: {{ scoredDate }}</span>
              <a
                v-if="bestReceipt?.registry?.hf_repo"
                :href="`https://huggingface.co/${bestReceipt.registry.hf_repo}`"
                target="_blank"
                class="text-brand hover:underline"
              >
                {{ bestReceipt.registry.hf_repo }}
              </a>
            </div>
          </div>
          <div v-if="bestReceipt?.rankable" class="shrink-0 flex items-center gap-1">
            <ScorePill
              :passed="bestReceipt.cell.n_passed"
              :total="bestReceipt.cell.n_graded"
              :ci="bestReceipt.cell.headline_ci ?? null"
            />
            <ExamCoverageChip :cell="bestReceipt.cell" />
          </div>
        </div>

        <!-- How to run it -->
        <RecipeCard v-if="isLocal" :record="bestReceipt?.cell ?? { model: alias }" :model-name="alias" />
      </CardContent>
    </Card>

    <!-- Route check: same model, different access channels -->
    <ChannelParityCard :alias="alias" :cells="sweCellsByExam" />

    <!-- Which build should I download? -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ zh ? '該下載哪個版本？' : 'Which build should you download?' }}
        <span class="text-xs font-normal text-muted-foreground ml-1">
          {{ zh ? '同一模型、不同' : 'same model, different ' }}<Term k="quant" />{{ zh ? '與引擎的同卷實測' : ' & engines, same exam' }}
        </span>
      </h3>
      <QuantComparisonTable :model="alias" />
      <EngineComparisonTable :model="alias" />
    </section>

    <!-- Controlled single-variable experiments -->
    <section v-if="modelPairs.length" class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ zh ? '受控實驗：只改一個變因' : 'Controlled experiments: one variable changed' }}
        <span class="text-xs font-normal text-muted-foreground ml-1">
          {{ zh ? '同卷同機，僅一個條件不同的成對收據' : 'same exam & machine, exactly one condition differs' }}
        </span>
      </h3>
      <MatchedPairList :pairs="modelPairs" />
    </section>

    <!-- Domain strengths -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ zh ? '強項在哪個領域？' : 'Where is it strong?' }}
        <span v-if="bestDomainScores.length" class="text-xs font-normal text-muted-foreground ml-1">
          {{ zh ? '從最佳收據的逐題判定直接推導' : 'derived from the best receipt’s per-task verdicts' }}
        </span>
      </h3>
      <div v-if="bestDomainScores.length" class="rounded-xl border border-border/80 bg-card p-4 space-y-2">
        <div
          v-for="d in bestDomainScores"
          :key="d.domainId"
          class="flex items-center gap-2 text-xs"
        >
          <span class="w-40 truncate font-medium">{{ zh ? d.label.zh : d.label.en }}</span>
          <div class="relative flex-1 h-3 rounded-full bg-muted overflow-hidden border border-border/40">
            <div
              class="absolute inset-y-0 left-0 bg-gradient-to-r from-brand to-emerald-500 rounded-full"
              :style="{ width: `${Math.round(d.passRate * 100)}%` }"
            />
          </div>
          <span class="w-16 text-right font-mono font-bold text-[11px]">
            {{ d.passed }}/{{ d.total }}
          </span>
        </div>
        <p class="text-[10px] text-muted-foreground pt-1">
          {{ zh
            ? '分母是該領域在考卷裡的實際題數 — 小分母（1-3 題）波動大，別過度解讀。'
            : 'Denominators are the exam’s real per-domain task counts — tiny ones (1-3 tasks) are noisy, don’t over-read.' }}
        </p>
      </div>
      <DomainRadarBar v-else :models="[alias]" />
    </section>

    <!-- Failed / error tasks from best receipt -->
    <section v-if="failedTasks.length" class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ zh ? '沒過的題' : 'Tasks that failed' }}
        <span class="text-xs font-normal text-muted-foreground ml-1">
          {{ zh ? '來自最佳收據的逐題判定' : 'from the best receipt’s per-task verdicts' }}
        </span>
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="t in failedTasks"
          :key="t.taskId"
          class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono"
          :class="t.verdict === 'ERROR'
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : 'border-border bg-muted/50 text-muted-foreground'"
          :title="t.taskId"
        >
          {{ dLabel(t.domain) }}
          <Term v-if="t.verdict === 'ERROR'" k="errorVerdict" :label="t.verdict" />
          <span v-else>{{ t.verdict }}</span>
        </span>
      </div>
    </section>

    <!-- Family lineage -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold">
        {{ zh ? '家族與衍生版本' : 'Family & derivatives' }}
        <span class="text-xs font-normal text-muted-foreground ml-1">
          {{ zh ? '含' : 'incl. ' }}<Term k="abliterated" />{{ zh ? '與' : ' and ' }}<Term k="draft" :label="zh ? '草稿模型' : 'draft models'" />
        </span>
      </h3>
      <LineageTreeView :model="alias" />
    </section>

    <!-- Raw receipts, collapsed -->
    <details v-if="variantRows.length" class="group">
      <summary class="flex items-center gap-2 cursor-pointer text-sm font-bold hover:text-brand select-none">
        <ChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" />
        {{ zh ? `全部 ${variantRows.length} 筆原始收據（含實驗腿，不入榜但公開）` : `All ${variantRows.length} raw receipts (experiment legs shown, never ranked)` }}
      </summary>
      <div class="mt-3">
        <DataTable
          :columns="variantCols"
          :rows="variantRows"
          row-id-key="id"
          :default-sort="'rate'"
          :default-dir="'desc'"
          :expandable="false"
        />
      </div>
    </details>

    <!-- Cross-hardware speed, collapsed -->
    <details v-if="speedRows.length" class="group">
      <summary class="flex items-center gap-2 cursor-pointer text-sm font-bold hover:text-brand select-none">
        <Cpu class="h-4 w-4" />
        <ChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" />
        {{ zh ? `跨硬體速度實測（${speedRows.length} 筆）` : `Cross-hardware speed runs (${speedRows.length})` }}
      </summary>
      <div class="mt-3">
        <DataTable
          :columns="speedCols"
          :rows="speedRows"
          row-id-key="id"
          :default-sort="'tg'"
          :default-dir="'desc'"
          :expandable="false"
        />
      </div>
    </details>
  </div>
</template>
