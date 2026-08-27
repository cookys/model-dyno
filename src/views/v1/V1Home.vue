<script setup lang="ts">
/**
 * V1 Home — "pick for me".
 * The entry question is the one every visitor actually has: WHAT CAN MY
 * MACHINE RUN WELL? Pick a hardware budget → see the measured champion for
 * that budget (a model that completed the full exam on a machine that small),
 * anchored against the best cloud agent so the score means something.
 */
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import {
  sweCellsByExam,
  fleetMachines,
  modelRegistry,
  runConfigs,
  scorecardSweMeta,
} from '@/lib/store'
import {
  BUDGET_PRESETS,
  fleetExamplesForBudget,
  localPicksForBudget,
  cloudAnchor,
  plainVerdict,
  ratioPhrase,
  anchorRatio,
  passFraction,
  type BudgetPreset,
} from '@/lib/advisor'
import { variantReceiptsForModel, launchRecipesForModel } from '@/lib/receipts'
import ScorePill from '@/components/v1/ScorePill.vue'
import ExamBadge from '@/components/v1/ExamBadge.vue'
import ExamCoverageChip from '@/components/v1/ExamCoverageChip.vue'
import Term from '@/components/v1/Term.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Copy, Cloud, ChevronRight, Cpu, Trophy, ShieldCheck, FlaskConical, TriangleAlert, Gauge } from 'lucide-vue-next'

const { locale } = useI18n()

const selectedBudgetId = ref('gpu-24')
const selectedPreset = computed<BudgetPreset>(
  () => BUDGET_PRESETS.find((p) => p.id === selectedBudgetId.value) ?? BUDGET_PRESETS[1],
)

const anchor = computed(() => cloudAnchor(sweCellsByExam.value))

const picks = computed(() =>
  localPicksForBudget(
    Number.isFinite(selectedPreset.value.maxGb) ? selectedPreset.value.maxGb : Number.MAX_SAFE_INTEGER,
    sweCellsByExam.value,
    fleetMachines.value,
    modelRegistry.value,
  ),
)

const champion = computed(() => picks.value[0] ?? null)
const runnerUps = computed(() => picks.value.slice(1, 4))

/** Distinct local models with a full-exam receipt anywhere in the fleet — the whole candidate pool. */
const localModelsTested = computed(() => {
  const seen = new Set<string>()
  for (const c of sweCellsByExam.value) {
    if ((c.identity?.access ?? '') !== 'local') continue
    if ((c.n_graded ?? 0) < 30) continue
    seen.add(c.identity?.canonical_model ?? c.model)
  }
  return seen.size
})

const budgetLabel = computed(() =>
  Number.isFinite(selectedPreset.value.maxGb)
    ? `≤${selectedPreset.value.maxGb}GB`
    : locale.value === 'zh' ? '不限' : 'unlimited',
)

const championVerdict = computed(() =>
  champion.value ? plainVerdict(champion.value, anchor.value, locale.value === 'zh' ? 'zh' : 'en') : null,
)

const currentExamId = computed(() => scorecardSweMeta.value?.current_exam ?? null)

const championCommand = computed(() => {
  if (!champion.value) return null
  const receipts = variantReceiptsForModel(
    champion.value.canonical, sweCellsByExam.value, modelRegistry.value,
  )
  const recipes = launchRecipesForModel(champion.value.canonical, receipts, runConfigs.value)
  return recipes[0]?.command ?? null
})

const copied = ref(false)
const copyCommand = async () => {
  if (!championCommand.value) return
  await navigator.clipboard.writeText(championCommand.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1600)
}

const anchorName = computed(() =>
  anchor.value ? (anchor.value.identity?.canonical_model ?? anchor.value.model) : null,
)

const examTotal = computed(() => scorecardSweMeta.value?.n_exam ?? scorecardSweMeta.value?.n_canon ?? 34)

const scoredDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—')

const fmtTok = (v: number | undefined) => (v != null ? `${v.toFixed(1)}` : null)
const wallMinutes = (v: number | undefined) => (v != null ? (v / 60).toFixed(1) : null)
</script>

<template>
  <div class="space-y-8">
    <!-- Hero: what this site is, in one breath -->
    <div class="text-center space-y-3 pt-2 pb-1 max-w-3xl mx-auto">
      <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        {{ locale === 'zh' ? '你的機器，該跑哪個模型？' : 'What should YOUR machine run?' }}
      </h2>
      <p class="text-sm text-muted-foreground leading-relaxed">
        <template v-if="locale === 'zh'">
          我們讓每個模型當 coding agent，實際解 {{ examTotal }} 道從自己專案抽出的真實題目 —
          不是行銷跑分。下面每個建議都能追到一份真機實測收據。
        </template>
        <template v-else>
          We make every model work as a coding agent on {{ examTotal }} real tasks pulled from our own
          projects — not marketing benchmarks. Every recommendation below traces to a receipt.
        </template>
      </p>
    </div>

    <!-- Step 1: pick your hardware -->
    <div class="space-y-3">
      <div class="flex items-center gap-2 text-sm font-bold text-foreground">
        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs">1</span>
        {{ locale === 'zh' ? '你有什麼設備？' : 'What gear do you have?' }}
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          v-for="preset in BUDGET_PRESETS"
          :key="preset.id"
          type="button"
          class="rounded-xl border-2 p-4 text-left transition-all cursor-pointer space-y-1"
          :class="selectedBudgetId === preset.id
            ? 'border-brand bg-brand/5 shadow-md'
            : 'border-border bg-card hover:border-brand/40'"
          @click="selectedBudgetId = preset.id"
        >
          <div class="flex items-center gap-2">
            <Cpu class="h-4 w-4 shrink-0" :class="selectedBudgetId === preset.id ? 'text-brand' : 'text-muted-foreground'" />
            <span class="font-bold text-sm">{{ locale === 'zh' ? preset.title.zh : preset.title.en }}</span>
          </div>
          <div class="text-xs text-muted-foreground leading-snug">
            {{ locale === 'zh' ? preset.examples.zh : preset.examples.en }}
          </div>
          <div class="text-[10px] font-mono text-muted-foreground/70">
            {{ locale === 'zh' ? '實測機隊' : 'fleet' }}:
            {{ fleetExamplesForBudget(preset, fleetMachines).length }}
            {{ locale === 'zh' ? '台' : 'machines' }}
          </div>
        </button>
      </div>
    </div>

    <!-- Step 2: the measured answer -->
    <div class="space-y-3">
      <div class="flex items-center gap-2 text-sm font-bold text-foreground">
        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs">2</span>
        {{ locale === 'zh' ? '我們測過的裡面，這檔位誰最強' : 'The best of what we have measured, at this budget' }}
      </div>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ locale === 'zh'
          ? `這不是全市場排名：候選池只有全站 ${localModelsTested} 個測滿整卷的本地模型，其中 ${picks.length} 個放得進 ${budgetLabel}（權重留 15% 給 context，或本來就在這麼小的機器上實測），按分數排。分數跟權重走、速度跟機器走；沒上榜通常只代表我們還沒測，不代表它不好。`
          : `Not a market-wide ranking: the candidate pool is the ${localModelsTested} local models that completed the full exam on our fleet — ${picks.length} fit ${budgetLabel} (weights with 15% context headroom, or measured on hardware that small), ranked by score. Scores travel with the weights; speed stays with the machine. Absent usually means untested, not bad.` }}
      </p>

      <template v-if="champion">
        <!-- Honest warning when even the best fit performs poorly -->
        <div
          v-if="(champion.cell.headline ?? 0) < 0.3"
          class="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300"
        >
          <TriangleAlert class="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {{ locale === 'zh'
              ? '誠實說：目前放得進這檔位的模型，最好的也解不到三成題。這檔位當 coding agent 還不實用 — 加預算、或先用雲端。'
              : 'Honestly: the best model that fits this budget solves under 30% of the exam. This tier is not yet practical for coding agents — upgrade the budget or use a cloud API.' }}
          </span>
        </div>

        <!-- Champion card -->
        <Card class="border-2 border-brand/40 bg-gradient-to-br from-brand/5 to-transparent shadow-lg overflow-hidden">
          <CardContent class="p-5 sm:p-6 space-y-4">
            <div class="flex items-start justify-between flex-wrap gap-3">
              <div class="space-y-1.5 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <Trophy class="h-5 w-5 text-amber-500 shrink-0" />
                  <RouterLink
                    :to="`/v1/model/${encodeURIComponent(champion.canonical)}`"
                    class="text-xl font-bold font-mono text-foreground hover:text-brand hover:underline"
                  >
                    {{ champion.canonical }}
                  </RouterLink>
                  <ExamBadge
                    :version="champion.cell.canonical_version"
                    :current-exam="currentExamId"
                  />
                  <span
                    v-if="champion.registry?.quant"
                    class="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                  >
                    <Term k="quant" :label="champion.registry.quant" />
                  </span>
                </div>
                <p class="text-sm text-foreground/90 leading-relaxed">{{ championVerdict }}</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <ScorePill
                  :passed="champion.cell.n_passed"
                  :total="champion.cell.n_graded"
                  :ci="champion.cell.headline_ci ?? null"
                />
                <ExamCoverageChip :cell="champion.cell" />
              </div>
            </div>

            <!-- Receipt facts strip -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="rounded-lg bg-muted/50 p-2.5 space-y-0.5">
                <div class="text-muted-foreground">{{ locale === 'zh' ? '分數量測於' : 'Score measured on' }}</div>
                <div class="font-mono font-semibold truncate" :title="champion.machine?.gpu_name ?? undefined">
                  {{ champion.machine?.gpu_name ?? champion.cell.machine }}
                </div>
                <div class="text-muted-foreground/70 font-mono">
                  {{ champion.measuredOnGb != null ? `${champion.measuredOnGb} GB` : '—' }}
                  <span v-if="champion.fitBasis === 'weights'">
                    {{ locale === 'zh' ? '· 分數不吃硬體，權重裝得下就成立' : '· score is hardware-independent' }}
                  </span>
                </div>
              </div>
              <div class="rounded-lg bg-muted/50 p-2.5 space-y-0.5">
                <div class="text-muted-foreground"><Term k="agentic" :label="locale === 'zh' ? '實戰輸出' : 'Agentic speed'" /></div>
                <div class="font-mono font-semibold">
                  {{ fmtTok(champion.cell.agentic_tok_s) ? `${fmtTok(champion.cell.agentic_tok_s)} tok/s` : '—' }}
                </div>
                <div class="text-muted-foreground/70">
                  <template v-if="champion.fitBasis === 'weights'">
                    {{ locale === 'zh' ? `在 ${champion.measuredOnGb}GB 機器量的 — 你的機器速度會不同` : `on the ${champion.measuredOnGb}GB machine — yours will differ` }}
                  </template>
                  <template v-else>
                    {{ wallMinutes(champion.cell.med_wall) ? (locale === 'zh' ? `中位每題 ${wallMinutes(champion.cell.med_wall)} 分鐘` : `${wallMinutes(champion.cell.med_wall)} min/task median`) : '' }}
                  </template>
                </div>
              </div>
              <div class="rounded-lg bg-muted/50 p-2.5 space-y-0.5">
                <div class="text-muted-foreground">{{ locale === 'zh' ? '權重大小' : 'Weights' }}</div>
                <div class="font-mono font-semibold">
                  {{ champion.registry?.weights_gb != null ? `${champion.registry.weights_gb} GB` : '—' }}
                </div>
                <div class="text-muted-foreground/70 truncate">{{ champion.registry?.alias ?? '' }}</div>
              </div>
              <div class="rounded-lg bg-muted/50 p-2.5 space-y-0.5">
                <div class="text-muted-foreground">{{ locale === 'zh' ? '收據日期' : 'Receipt date' }}</div>
                <div class="font-mono font-semibold">{{ scoredDate(champion.cell.scored_at) }}</div>
                <div class="text-muted-foreground/70 font-mono truncate" :title="champion.cell.cell">{{ champion.cell.cell }}</div>
              </div>
            </div>

            <!-- Copy command -->
            <div v-if="championCommand" class="flex items-center gap-2">
              <code class="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground/90">
                {{ championCommand }}
              </code>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                @click="copyCommand"
              >
                <Check v-if="copied" class="h-3.5 w-3.5" />
                <Copy v-else class="h-3.5 w-3.5" />
                {{ copied ? (locale === 'zh' ? '已複製' : 'Copied') : (locale === 'zh' ? '複製啟動指令' : 'Copy launch command') }}
              </button>
            </div>
          </CardContent>
        </Card>

        <!-- Runner-ups -->
        <div v-if="runnerUps.length" class="space-y-2">
          <div class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {{ locale === 'zh' ? '同檔位次選' : 'Runner-ups in this budget' }}
          </div>
          <RouterLink
            v-for="pick in runnerUps"
            :key="pick.canonical"
            :to="`/v1/model/${encodeURIComponent(pick.canonical)}`"
            class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 hover:border-brand/40 transition-colors group"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-mono font-semibold text-sm truncate group-hover:text-brand">{{ pick.canonical }}</span>
              <span v-if="pick.registry?.quant" class="text-[10px] font-mono text-muted-foreground shrink-0">{{ pick.registry.quant }}</span>
              <span
                v-if="pick.weightsGb != null"
                class="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0"
                :title="locale === 'zh'
                  ? (pick.fitBasis === 'measured' ? '就在這個檔位大小的機器上實測過（速度數字可直接參考）' : `權重 ${pick.weightsGb}GB 裝得進這檔位；分數量測於 ${pick.measuredOnGb ?? '?'}GB 機器，速度數字不可直接參考`)
                  : (pick.fitBasis === 'measured' ? 'Measured on hardware this small (speed transfers too)' : `Weights (${pick.weightsGb}GB) fit this budget; score measured on a ${pick.measuredOnGb ?? '?'}GB machine — speed does not transfer`)"
              >
                {{ pick.weightsGb }}GB{{ pick.fitBasis === 'measured' ? (locale === 'zh' ? ' · 同級實測' : ' · same-tier run') : '' }}
              </span>
              <span
                v-if="ratioPhrase(anchorRatio(pick.cell, anchor), locale === 'zh' ? 'zh' : 'en')"
                class="text-[11px] text-muted-foreground shrink-0 hidden sm:inline"
              >
                {{ locale === 'zh'
                  ? `≈ 雲端最強的 ${ratioPhrase(anchorRatio(pick.cell, anchor), 'zh')}`
                  : `≈ ${ratioPhrase(anchorRatio(pick.cell, anchor), 'en')} of best cloud` }}
              </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <ScorePill :passed="pick.cell.n_passed" :total="pick.cell.n_graded" :ci="pick.cell.headline_ci ?? null" compact />
              <ChevronRight class="h-4 w-4 text-muted-foreground" />
            </div>
          </RouterLink>
        </div>
      </template>

      <Card v-else class="border-dashed">
        <CardContent class="p-6 text-center text-sm text-muted-foreground">
          {{ locale === 'zh'
            ? '測滿整卷的模型裡，沒有任何一個的權重放得進這個檔位，也沒有在這麼小的機器上實測過的 — 我們不猜、不外推，等收據進來才給建議。'
            : 'None of the fully-examined models fit this budget by weights, and none were measured on hardware this small — we don\'t extrapolate; recommendations wait for receipts.' }}
        </CardContent>
      </Card>

      <!-- Cloud anchor context -->
      <div v-if="anchor" class="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        <Cloud class="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          <template v-if="locale === 'zh'">
            參考基準：目前雲端最強 coding agent 是 <RouterLink :to="`/v1/model/${encodeURIComponent(anchorName!)}`" class="font-mono font-semibold text-foreground hover:text-brand hover:underline">{{ anchorName }}</RouterLink>（{{ passFraction(anchor) }} 題）。上面的「幾成功力」都是跟它比。不想自己架機器的話，付 API 錢用它就是天花板。
          </template>
          <template v-else>
            Reference: the strongest cloud coding agent right now is <RouterLink :to="`/v1/model/${encodeURIComponent(anchorName!)}`" class="font-mono font-semibold text-foreground hover:text-brand hover:underline">{{ anchorName }}</RouterLink> ({{ passFraction(anchor) }}). All "% of best cloud" phrases compare against it.
          </template>
        </span>
      </div>
    </div>

    <!-- Explore further -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
      <RouterLink to="/v1/rank" class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group">
        <Trophy class="h-5 w-5 text-amber-500 shrink-0" />
        <div class="min-w-0">
          <div class="font-bold text-sm group-hover:text-brand">{{ locale === 'zh' ? '完整排行榜' : 'Full ranking' }}</div>
          <div class="text-xs text-muted-foreground">{{ locale === 'zh' ? '雲端＋本地同卷比' : 'Cloud + local, same exam' }}</div>
        </div>
      </RouterLink>
      <RouterLink to="/v1/speed" class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group">
        <Gauge class="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <div class="text-sm font-bold group-hover:text-brand">{{ locale === 'zh' ? '實戰有多快？' : 'How fast in practice?' }}</div>
          <div class="text-[11px] text-muted-foreground">{{ locale === 'zh' ? '雲端 vs 本地 harness' : 'Cloud vs local harness' }}</div>
        </div>
        <ChevronRight class="h-4 w-4 ml-auto text-muted-foreground" />
      </RouterLink>
      <RouterLink to="/v1/mods" class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group">
        <FlaskConical class="h-5 w-5 text-purple-500 shrink-0" />
        <div class="min-w-0">
          <div class="font-bold text-sm group-hover:text-brand">{{ locale === 'zh' ? '改裝真相' : 'Mod truths' }}</div>
          <div class="text-xs text-muted-foreground">{{ locale === 'zh' ? '量化／去審查／推測解碼實測' : 'Quant / abliteration / spec-decode, measured' }}</div>
        </div>
      </RouterLink>
      <RouterLink to="/v1/method" class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group">
        <ShieldCheck class="h-5 w-5 text-emerald-500 shrink-0" />
        <div class="min-w-0">
          <div class="font-bold text-sm group-hover:text-brand">{{ locale === 'zh' ? '為什麼可信' : 'Why trust this' }}</div>
          <div class="text-xs text-muted-foreground">{{ locale === 'zh' ? '題目來源與三道驗收閘門' : 'Task provenance & the 3 gates' }}</div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
