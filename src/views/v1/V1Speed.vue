<script setup lang="ts">
/**
 * V1 Speed — honest speed anatomy with a unified machine explorer.
 *
 * Local fleet and cloud APIs live in separate top-level tabs. Within each
 * local machine, every measured run is visible (not cherry-picked), grouped
 * by canonical model, with bench numbers and matched-pair diffs inline.
 */
import { computed, ref, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import {
  sweCellsByExam,
  dashboardRecords,
  modelRegistry,
  fleetMachines,
  depthFindings,
  scorecardSweMeta,
} from '@/lib/store'
import { machineExplorerBoards, benchBoards, codingHarnessRows, benchVsRealRows, benchVsRealSummary, sortHarnessRows, type HarnessSortKey } from '@/lib/speedFrontier'
import ScorePill from '@/components/v1/ScorePill.vue'
import ExamBadge from '@/components/v1/ExamBadge.vue'
import ExamCoverageChip from '@/components/v1/ExamCoverageChip.vue'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import MachineSpecs from '@/components/v1/MachineSpecs.vue'
import MatchedPairList from '@/components/v1/MatchedPairList.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Gauge, Timer, Zap, Hourglass, ArrowRight, Cloud, HardDrive,
  ChevronDown, Server, GitCompareArrows, ExternalLink, Layers,
} from 'lucide-vue-next'

const MACHINE_TAB_MAX = 5
const GENERIC_MACHINE_TOKENS = new Set(['cookys', 'linux', 'windows', 'macos', 'mac'])

const { locale } = useI18n()
const router = useRouter()
const zh = computed(() => locale.value === 'zh')

const explorerBoards = computed(() =>
  machineExplorerBoards(sweCellsByExam.value, dashboardRecords.value, modelRegistry.value),
)

const harnessPool = computed(() =>
  codingHarnessRows(sweCellsByExam.value, dashboardRecords.value, modelRegistry.value),
)
const harnessSort = ref<HarnessSortKey>('efficiency')
const harnessRows = computed(() => sortHarnessRows(harnessPool.value, harnessSort.value))
const harnessLocalCount = computed(() => harnessPool.value.filter((r) => r.isLocal).length)
const harnessCloudCount = computed(() => harnessPool.value.filter((r) => !r.isLocal).length)

const benchRealSummary = computed(() =>
  benchVsRealSummary(
    benchVsRealRows(sweCellsByExam.value, dashboardRecords.value, modelRegistry.value),
  ),
)

const localBoards = computed(() => explorerBoards.value.filter((b) => !b.isCloud))

const pageTab = ref<'harness' | 'local'>('harness')

const currentExamId = computed(() => scorecardSweMeta.value?.current_exam ?? null)

const selectedMachine = ref('')
const useMachineTabs = computed(() => localBoards.value.length <= MACHINE_TAB_MAX)

watch(
  localBoards,
  (boards) => {
    if (!boards.length) {
      selectedMachine.value = ''
      return
    }
    if (!boards.some((b) => b.machine === selectedMachine.value)) {
      selectedMachine.value = boards[0].machine
    }
  },
  { immediate: true },
)

const activeLocalBoard = computed(
  () => localBoards.value.find((b) => b.machine === selectedMachine.value) ?? localBoards.value[0] ?? null,
)

const machineShortLabel = (profile: string): string => {
  const tokens = profile
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !GENERIC_MACHINE_TOKENS.has(t))
  return tokens.join('-') || profile
}

const machineInfo = (profile: string): string | null => {
  const tokens = new Set(profile.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const m = fleetMachines.value.find((fm) =>
    [fm.profile, ...fm.aliases].some((a) =>
      (a ?? '').toLowerCase().split(/[^a-z0-9]+/).some((t) => t && tokens.has(t) && !['cookys', 'linux', 'windows'].includes(t)),
    ),
  )
  if (!m) return null
  const vram = m.vram_pool_gb ?? m.vram_total_gb ?? m.vram_per_gpu_gb
  return [m.gpu_name, vram != null ? `${Math.round(vram)}GB` : null].filter(Boolean).join(' · ') || null
}

const goModel = (canonical: string) => router.push(`/v1/model/${encodeURIComponent(canonical)}`)

const bench = computed(() => benchBoards(dashboardRecords.value))

const activeBenchBoard = computed(() => {
  if (!activeLocalBoard.value) return null
  const m = activeLocalBoard.value.machine
  return bench.value.find((b) => {
    const tokens = machineTokens(b.profile)
    const mt = machineTokens(m)
    for (const t of tokens) if (mt.has(t)) return true
    return b.profile === m
  }) ?? null
})

function machineTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !GENERIC_MACHINE_TOKENS.has(t)),
  )
}

const ttftGroups = computed(() => {
  const groups = new Map<string, { machine: string; config: string; cold: number | null; hot: number | null; note: string | null }>()
  for (const d of depthFindings.value) {
    if (d.metric !== 'ttft_s' || d.value == null) continue
    const key = `${d.machine}|${d.config}`
    const g = groups.get(key) ?? {
      machine: d.machine ?? '—',
      config: d.config ?? '—',
      cold: null,
      hot: null,
      note: null,
    }
    if (d.state === 'cold') { g.cold = d.value; g.note = g.note ?? d.note }
    else if (d.state === 'hot') g.hot = d.value
    groups.set(key, g)
  }
  return Array.from(groups.values()).sort((a, b) => (a.cold ?? 1e9) - (b.cold ?? 1e9))
})

const fmt = (v: number | null | undefined, digits = 0) =>
  v == null ? '—' : v.toFixed(digits)

const ratioClass = (r: number) =>
  r >= 0.95
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
    : r >= 0.55
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'

const METRICS = [
  {
    icon: Zap,
    zh: { name: 'Prefill（讀題速度）', what: '模型「讀進」你的 prompt 和 code 的速度（pp512）。', feel: '決定貼一大段 code 之後要等多久才開始回。' },
    en: { name: 'Prefill (reading speed)', what: 'How fast the model ingests your prompt and code (pp512).', feel: 'Determines the wait after pasting a big chunk of code.' },
  },
  {
    icon: Gauge,
    zh: { name: 'Decode bench（短題吐字）', what: '短 prompt、無工具的吐字速度（tg128）— 網路上行銷圖最愛引用的數字。', feel: '真實工作永遠到不了這個速度，當上限看。' },
    en: { name: 'Decode bench (short-prompt)', what: 'Token generation on a short prompt with no tools (tg128) — the number marketing charts love.', feel: 'Real work never reaches it; treat it as a ceiling.' },
  },
  {
    icon: Timer,
    zh: { name: '實戰吞吐（真的在解題時）', what: '在真的解 34 題 coding 任務時量到的 tok/s — 含長 context、工具往返。', feel: '這才是你看著 agent 工作時的體感速度。' },
    en: { name: 'Real-workload throughput', what: 'tok/s measured while actually solving the 34-task exam — long contexts and tool round-trips included.', feel: 'This is the speed you feel watching an agent work.' },
  },
  {
    icon: Hourglass,
    zh: { name: 'TTFT（第一個字要等多久）', what: '從送出到第一個 token 的延遲，隨 context 長度暴增。', feel: '120k context 的冷啟動可能要等你去倒杯水。' },
    en: { name: 'TTFT (time to first token)', what: 'Latency from send to first token; explodes with context length.', feel: 'A cold 120k-context start can be a coffee-break wait.' },
  },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="space-y-1">
      <h2 class="text-xl font-bold tracking-tight">{{ zh ? '多快？看得懂的速度解剖' : 'How fast? Speed, dissected honestly' }}</h2>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '同一套 coding harness、同一份考卷 — 本地 serving 與雲端 API 可以且應該放在一起比實戰 tok/s 與過題率。預設是混合對照；要拆硬體細節再切「本地拆解」。'
          : 'Same coding harness, same exam — local serving and cloud APIs belong in one view for real-workload tok/s and pass rate. Default is the mixed harness board; switch to Local drill-down for per-machine detail.' }}
      </p>
      <p v-if="benchRealSummary" class="text-[11px] font-mono text-muted-foreground">
        <template v-if="benchRealSummary.medianRatio != null">
          {{ zh
            ? `行銷 bench 對照：${benchRealSummary.nJoins} 組同權重同機 join；實戰/agentic 中位約 bench tg128 的 ${(benchRealSummary.medianRatio * 100).toFixed(0)}%。`
            : `Bench vs real: ${benchRealSummary.nJoins} same-weights same-machine joins; median agentic ≈ ${(benchRealSummary.medianRatio * 100).toFixed(0)}% of bench tg128.` }}
        </template>
        <template v-else>
          {{ zh
            ? `行銷 bench 對照：${benchRealSummary.nJoins} 組 join（無可用 ratio）。`
            : `Bench vs real: ${benchRealSummary.nJoins} joins (no ratio available).` }}
        </template>
      </p>
    </div>

    <!-- Collapsible metric explainer -->
    <details class="group rounded-xl border border-border bg-card">
      <summary class="flex items-center gap-2 cursor-pointer select-none p-3.5 text-xs font-semibold hover:text-brand list-none">
        <ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180 shrink-0" />
        {{ zh ? '「tok/s」其實有四種 — 點開看差別' : '"tok/s" is four different numbers — click to learn' }}
      </summary>
      <div class="px-3.5 pb-3.5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card v-for="m in METRICS" :key="m.zh.name">
          <CardContent class="p-4 space-y-1.5">
            <div class="flex items-center gap-2">
              <component :is="m.icon" class="h-4 w-4 text-brand shrink-0" />
              <span class="font-bold text-xs">{{ zh ? m.zh.name : m.en.name }}</span>
            </div>
            <p class="text-[11px] text-foreground/85 leading-relaxed">{{ zh ? m.zh.what : m.en.what }}</p>
            <p class="text-[11px] text-muted-foreground leading-relaxed italic">{{ zh ? m.zh.feel : m.en.feel }}</p>
          </CardContent>
        </Card>
      </div>
    </details>

    <ExamVersionBar :switchable="false" />

    <!-- Page mode: mixed harness comparison (default) vs local drill-down -->
    <div class="space-y-1.5">
      <Tabs v-model="pageTab" class="w-full">
        <TabsList class="h-auto p-1">
          <TabsTrigger value="harness" class="gap-1.5 text-xs font-semibold">
            <Layers class="h-3.5 w-3.5" />
            {{ zh ? 'Harness 對照' : 'Harness comparison' }}
            <span class="text-muted-foreground font-mono font-normal text-[10px]">
              {{ harnessLocalCount }} {{ zh ? '本地' : 'local' }} + {{ harnessCloudCount }} {{ zh ? '雲端' : 'cloud' }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="local" class="gap-1.5 text-xs font-semibold">
            <Server class="h-3.5 w-3.5" />
            {{ zh ? '本地機器拆解' : 'Local drill-down' }}
            <span class="text-muted-foreground font-mono font-normal text-[10px]">
              {{ localBoards.length }} {{ zh ? '台' : 'boxes' }}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- ========== HARNESS MIXED COMPARISON ========== -->
    <section v-show="pageTab === 'harness'" class="space-y-3">
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '每一列 = 一次完整考卷實測（≥30 題）。本地列是「你家硬體 + 你的 serve 設定」的體感；雲端列是「訂閱/API 路線」的體感 — 兩者都是真實接 coding harness 的數字，可以橫比來選路線。'
          : 'Each row is one full-exam run (≥30 tasks). Local = your hardware + serve config; cloud = subscription/API route — both are real coding-harness numbers and belong in one comparison.' }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[11px] text-muted-foreground font-semibold">{{ zh ? '排序' : 'Sort' }}</span>
        <button
          v-for="opt in ([
            { k: 'efficiency', zh: '解題效率', en: 'Solved/hour' },
            { k: 'score', zh: '正確率', en: 'Pass rate' },
            { k: 'speed', zh: '實戰 tok/s', en: 'Real tok/s' },
          ] as const)"
          :key="opt.k"
          type="button"
          class="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="harnessSort === opt.k
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-border text-muted-foreground hover:text-foreground'"
          @click="harnessSort = opt.k as HarnessSortKey"
        >{{ zh ? opt.zh : opt.en }}</button>
        <span class="text-[10px] text-muted-foreground font-mono ml-auto">
          {{ harnessRows.length }} {{ zh ? '列可比' : 'comparable rows' }}
        </span>
      </div>

      <Card class="overflow-hidden">
        <CardContent class="p-0 overflow-x-auto">
          <table class="w-full text-xs min-w-[800px]">
            <thead class="border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
              <tr>
                <th class="px-3 py-2.5 text-left w-8">#</th>
                <th class="px-3 py-2.5 text-left">{{ zh ? '模型' : 'Model' }}</th>
                <th class="px-3 py-2.5 text-left">{{ zh ? '路線' : 'Route' }}</th>
                <th class="px-3 py-2.5 text-left">{{ zh ? '條件' : 'Conditions' }}</th>
                <th class="px-3 py-2.5 text-right">{{ zh ? '實戰 tok/s' : 'Real tok/s' }}</th>
                <th class="px-3 py-2.5 text-right">{{ zh ? '分數' : 'Score' }}</th>
                <th class="px-3 py-2.5 text-left">{{ zh ? '考卷' : 'Exam' }}</th>
                <th
                  class="px-3 py-2.5 text-right"
                  :title="zh ? '每小時解掉幾題（含失敗題耗時）— 能力×速度' : 'Tasks solved per wall-clock hour (fail time included) — capability × speed'"
                >{{ zh ? '每小時解題' : 'Solved/hr' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(r, idx) in harnessRows"
                :key="r.cell.cell"
                class="border-b border-border/40 last:border-0 hover:bg-muted/30 cursor-pointer"
                :class="!r.rankable ? 'opacity-75' : ''"
                :title="r.cell.cell"
                @click="goModel(r.canonical)"
              >
                <td class="px-3 py-2.5 font-mono text-muted-foreground">{{ idx + 1 }}</td>
                <td class="px-3 py-2.5">
                  <span class="font-mono font-semibold hover:text-brand">{{ r.canonical }}</span>
                  <span v-if="!r.rankable" class="ml-1" title="experiment leg">🧪</span>
                </td>
                <td class="px-3 py-2.5">
                  <span
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                    :class="r.isLocal
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'"
                  >
                    <component :is="r.isLocal ? HardDrive : Cloud" class="h-2.5 w-2.5" />
                    <span class="max-w-[140px] truncate" :title="r.routeLabel">{{ r.routeLabel }}</span>
                  </span>
                </td>
                <td class="px-3 py-2.5">
                  <div class="flex flex-wrap gap-1 max-w-[200px]">
                    <span
                      v-for="chip in r.chips.slice(0, 4)"
                      :key="chip"
                      class="rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[9px]"
                    >{{ chip }}</span>
                    <span v-if="r.chips.length > 4" class="text-[9px] text-muted-foreground">+{{ r.chips.length - 4 }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="relative h-2 w-16 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div
                        class="absolute inset-y-0 left-0 rounded-full"
                        :class="r.isLocal ? 'bg-emerald-500/60' : 'bg-sky-500/60'"
                        :style="{ width: `${Math.max(4, Math.round((r.agentic / (harnessRows[0]?.agentic || 1)) * 100))}%` }"
                      />
                    </div>
                    <span class="font-mono font-bold">{{ r.agentic.toFixed(1) }}</span>
                  </div>
                </td>
                <td class="px-3 py-2.5 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <ScorePill
                      :passed="r.passed"
                      :total="r.graded"
                      :ci="r.cell.headline_ci ?? null"
                      compact
                      bare
                      show-percent
                    />
                    <ExamCoverageChip :cell="r.cell" />
                  </div>
                </td>
                <td class="px-3 py-2.5">
                  <ExamBadge :version="r.examVersion" :current-exam="currentExamId" />
                </td>
                <td class="px-3 py-2.5 text-right font-mono">
                  {{ r.solvedPerHour != null ? r.solvedPerHour.toFixed(2) : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p class="text-[11px] text-muted-foreground">
        {{ zh
          ? '「解題效率」= 同一考卷下的每小時解題數（能力×速度）。行銷 bench 保留率（實戰÷tg128）只在「本地拆解」有配對時才算 — 雲端列與多數 SGLang/NVFP4 設定沒有可比 bench。要比「誰考得好」的統計細節 →'
          : 'Solved/hr folds accuracy × speed on the same exam. Marketing-bench survival (real÷tg128) lives under Local drill-down and only when the same weights were benched on that box — cloud rows and most SGLang/NVFP4 configs have no join. For statistical score detail →' }}
        <RouterLink to="/v1/rank" class="text-brand hover:underline">{{ zh ? '排行頁' : 'Rank' }}</RouterLink>
      </p>
    </section>

    <!-- ========== LOCAL DRILL-DOWN ========== -->
    <section v-show="pageTab === 'local'" class="space-y-3">
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '選一台機器 → 按模型分組 → 每列是一次實測（含 engine / 量化 / drafter 等條件）。bench 與實戰並排在同一列；「實戰保留幾成」只在同機器同權重檔才有意義。'
          : 'Pick a machine → groups by model → each row is one measured run (engine / quant / drafter chips). Bench and real workload sit on the same row; the survival ratio only makes sense on the same box with the same weights.' }}
      </p>

      <Tabs
        v-if="localBoards.length > 1 && useMachineTabs"
        v-model="selectedMachine"
        class="w-full"
      >
        <TabsList class="h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger
            v-for="b in localBoards"
            :key="b.machine"
            :value="b.machine"
            class="font-mono text-xs shrink-0"
            :title="b.machine"
          >
            {{ machineShortLabel(b.machine) }}
            <span class="text-muted-foreground font-normal">({{ b.totalRuns }})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div v-else-if="localBoards.length > 1" class="flex items-center gap-2 flex-wrap">
        <label for="speed-machine-select" class="text-xs text-muted-foreground shrink-0">{{ zh ? '機器' : 'Machine' }}</label>
        <select
          id="speed-machine-select"
          v-model="selectedMachine"
          class="h-8 min-w-[min(100%,20rem)] flex-1 rounded-md border border-input bg-background text-xs font-mono px-2.5 py-1"
        >
          <option v-for="b in localBoards" :key="b.machine" :value="b.machine">
            {{ b.machine }} ({{ b.totalRuns }} {{ zh ? '次實測' : 'runs' }})
          </option>
        </select>
      </div>

      <template v-if="activeLocalBoard">
        <Card class="overflow-hidden">
          <CardContent class="p-0">
            <div class="border-b border-border/60 bg-muted/20 px-3 py-2">
              <details class="group/mach">
                <summary class="flex items-center gap-2 cursor-pointer select-none list-none">
                  <HardDrive class="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span class="font-mono text-xs font-bold">{{ activeLocalBoard.machine }}</span>
                  <span v-if="machineInfo(activeLocalBoard.machine)" class="text-[10px] text-muted-foreground font-mono truncate">
                    {{ machineInfo(activeLocalBoard.machine) }}
                  </span>
                  <span class="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
                    {{ activeLocalBoard.groups.length }} {{ zh ? '隻模型' : 'models' }} ·
                    {{ activeLocalBoard.totalRuns }} {{ zh ? '次實測' : 'runs' }}
                    <template v-if="activeLocalBoard.totalPairs">
                      · {{ activeLocalBoard.totalPairs }} {{ zh ? '組 A/B' : 'A/B pairs' }}
                    </template>
                  </span>
                  <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform group-open/mach:rotate-180 shrink-0" />
                </summary>
                <div class="mt-2">
                  <MachineSpecs :profile="activeLocalBoard.machine" />
                </div>
              </details>
            </div>

            <div class="divide-y divide-border/40">
              <details
                v-for="g in activeLocalBoard.groups"
                :key="g.canonical"
                class="group/model"
                :open="g.runs.length > 1 || g.pairs.length > 0"
              >
                <summary class="flex items-center gap-2 cursor-pointer select-none px-3 py-2.5 hover:bg-muted/30 list-none">
                  <ChevronDown class="h-3.5 w-3.5 text-muted-foreground transition-transform group-open/model:rotate-180 shrink-0" />
                  <button
                    type="button"
                    class="font-mono text-xs font-bold hover:text-brand text-left"
                    @click.stop="goModel(g.canonical)"
                  >{{ g.canonical }}</button>
                  <span class="text-[10px] text-muted-foreground font-mono">
                    {{ g.runs.length }} {{ zh ? '次' : 'runs' }}
                  </span>
                  <span
                    v-if="g.pairs.length"
                    class="inline-flex items-center gap-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-400"
                  >
                    <GitCompareArrows class="h-2.5 w-2.5" />
                    {{ g.pairs.length }} A/B
                  </span>
                  <div class="relative flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-[120px] ml-auto hidden sm:block">
                    <div
                      class="absolute inset-y-0 left-0 rounded-full bg-emerald-500/60"
                      :style="{ width: `${Math.max(4, Math.round((g.runs[0].agentic / activeLocalBoard.maxAgentic) * 100))}%` }"
                    />
                  </div>
                  <span class="font-mono text-xs font-bold shrink-0 w-16 text-right">
                    {{ g.runs[0].agentic.toFixed(1) }}
                    <span class="text-[10px] font-normal text-muted-foreground">tok/s</span>
                  </span>
                </summary>

                <div class="overflow-x-auto border-t border-border/30">
                  <table class="w-full text-xs min-w-[720px]">
                    <thead class="bg-muted/30 text-[10px] text-muted-foreground">
                      <tr>
                        <th class="px-3 py-2 text-left">{{ zh ? '條件' : 'Conditions' }}</th>
                        <th class="px-3 py-2 text-right">{{ zh ? '實戰' : 'Real' }}</th>
                        <th class="px-3 py-2 text-right">bench tg128</th>
                        <th
                          class="px-3 py-2 text-right"
                          :title="zh ? '實戰 tok/s ÷ 同機同權重的 tg128 bench；無配對則空白' : 'Real tok/s ÷ tg128 bench on same box + weights; blank when no join'"
                        >{{ zh ? '保留幾成' : 'Keeps' }}</th>
                        <th class="px-3 py-2 text-right">{{ zh ? '分數' : 'Score' }}</th>
                        <th class="px-3 py-2 text-center w-10">A/B</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="r in g.runs"
                        :key="r.cell.cell"
                        class="border-t border-border/20 hover:bg-muted/20"
                        :class="!r.rankable ? 'opacity-75' : ''"
                        :title="r.cell.cell"
                      >
                        <td class="px-3 py-2">
                          <div class="flex flex-wrap gap-1">
                            <span
                              v-for="chip in r.chips"
                              :key="chip"
                              class="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]"
                            >{{ chip }}</span>
                            <span v-if="!r.chips.length" class="text-muted-foreground text-[10px]">—</span>
                            <span v-if="!r.rankable" class="text-[10px]" title="experiment leg">🧪</span>
                          </div>
                          <div v-if="r.alias" class="text-[10px] text-muted-foreground font-mono truncate max-w-[280px] mt-0.5" :title="r.alias">
                            {{ r.alias }}
                          </div>
                        </td>
                        <td class="px-3 py-2 text-right font-mono font-bold">{{ r.agentic.toFixed(1) }}</td>
                        <td class="px-3 py-2 text-right font-mono text-muted-foreground">
                          {{ r.benchTg128 != null ? r.benchTg128.toFixed(1) : '—' }}
                        </td>
                        <td class="px-3 py-2 text-right">
                          <span
                            v-if="r.ratio != null"
                            class="inline-block rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold"
                            :class="ratioClass(r.ratio)"
                          >{{ Math.round(r.ratio * 100) }}%{{ r.ratio > 1 ? '↑' : '' }}</span>
                          <span v-else class="text-muted-foreground" :title="zh ? '此機器上尚無同權重的 tg128 bench 實測' : 'No tg128 bench for these weights on this machine'">—</span>
                        </td>
                        <td class="px-3 py-2 text-right">
                          <ScorePill
                            :passed="r.cell.n_passed"
                            :total="r.cell.n_graded"
                            :ci="r.cell.headline_ci ?? null"
                            compact
                            bare
                            show-percent
                          />
                        </td>
                        <td class="px-3 py-2 text-center font-mono text-[10px] text-muted-foreground">
                          {{ r.pairCount || '—' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="g.pairs.length" class="border-t border-border/40 bg-muted/10 px-3 py-3 space-y-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="text-[11px] font-semibold text-muted-foreground">
                      {{ zh ? '同模型、單變因 A/B（這台機器上）' : 'Single-variable A/B on this machine' }}
                    </span>
                    <RouterLink
                      :to="`/v1/mods`"
                      class="text-[10px] text-brand hover:underline inline-flex items-center gap-1"
                    >
                      {{ zh ? '全部改裝對照 →' : 'All mod comparisons →' }}
                      <ExternalLink class="h-2.5 w-2.5" />
                    </RouterLink>
                  </div>
                  <MatchedPairList :pairs="g.pairs" />
                </div>
              </details>
            </div>
          </CardContent>
        </Card>

        <!-- Bench-only advanced grid for this machine -->
        <details v-if="activeBenchBoard" class="group rounded-xl border border-border bg-card">
          <summary class="flex items-center gap-2 cursor-pointer select-none p-3.5 text-xs font-semibold hover:text-brand list-none">
            <ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180 shrink-0" />
            <Gauge class="h-3.5 w-3.5 shrink-0" />
            {{ zh ? `進階：這台機器的 bench 全表（${activeBenchBoard.rows.length} 筆 tg128）` : `Advanced: full bench grid on this machine (${activeBenchBoard.rows.length} tg128 rows)` }}
            <span class="ml-auto text-[10px] text-muted-foreground font-mono font-normal">
              {{ zh ? '上限值' : 'ceiling' }} {{ activeBenchBoard.maxTg.toFixed(0) }} tok/s
            </span>
          </summary>
          <div class="px-3.5 pb-3.5 overflow-x-auto">
            <table class="w-full text-xs min-w-[520px]">
              <thead class="text-[10px] text-muted-foreground border-b border-border/60">
                <tr>
                  <th class="py-1.5 text-left">{{ zh ? '權重檔' : 'Weights' }}</th>
                  <th class="py-1.5 text-left hidden sm:table-cell">{{ zh ? '引擎' : 'Engine' }}</th>
                  <th class="py-1.5 text-right">pp512</th>
                  <th class="py-1.5 text-right">tg128</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in activeBenchBoard.rows" :key="i" class="border-b border-border/30 last:border-0">
                  <td class="py-1.5 font-mono truncate max-w-[220px]" :title="r.model_alias">{{ r.model_alias }}</td>
                  <td class="py-1.5 font-mono text-muted-foreground hidden sm:table-cell">{{ r.engine ?? '—' }}</td>
                  <td class="py-1.5 text-right font-mono">{{ r.pp512_tps != null ? r.pp512_tps.toFixed(0) : '—' }}</td>
                  <td class="py-1.5 text-right font-mono font-bold">{{ r.tg128_tps!.toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>
      <p v-else class="text-sm text-muted-foreground">{{ zh ? '這份 snapshot 沒有本地實戰速度量測。' : 'No local real-workload measurements in this snapshot.' }}</p>
    </section>

    <!-- 120k TTFT study -->
    <section v-if="ttftGroups.length" class="space-y-2">
      <h3 class="text-sm font-bold">
        {{ zh ? '120k context：第一個字要等多久？' : '120k context: how long until the first token?' }}
      </h3>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '把整個 repo 塞進 context 的那種 session，冷啟動與熱啟動差距是數量級的。'
          : 'For fill-the-context-with-the-whole-repo sessions, cold vs hot start differs by orders of magnitude.' }}
      </p>
      <div class="grid sm:grid-cols-2 gap-3">
        <Card v-for="g in ttftGroups" :key="g.machine + g.config">
          <CardContent class="p-4 space-y-2">
            <div class="font-mono text-xs font-semibold">{{ g.config }}</div>
            <div class="text-[10px] text-muted-foreground font-mono">{{ g.machine }}</div>
            <div class="flex items-center gap-3 pt-1">
              <div class="flex-1 rounded-lg bg-muted/40 p-2.5 text-center">
                <div class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ zh ? '冷啟動' : 'Cold' }}</div>
                <div class="font-mono font-bold text-lg">{{ fmt(g.cold, 1) }}<span class="text-xs font-normal text-muted-foreground"> s</span></div>
              </div>
              <ArrowRight class="h-4 w-4 text-muted-foreground shrink-0" />
              <div class="flex-1 rounded-lg bg-emerald-500/10 p-2.5 text-center">
                <div class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ zh ? '熱啟動' : 'Hot' }}</div>
                <div class="font-mono font-bold text-lg">{{ fmt(g.hot, 1) }}<span class="text-xs font-normal text-muted-foreground"> s</span></div>
              </div>
            </div>
            <p v-if="g.note" class="text-[10px] text-muted-foreground leading-relaxed">{{ g.note }}</p>
          </CardContent>
        </Card>
      </div>
    </section>

    <router-link
      to="/speed/heatmap"
      class="flex items-center gap-2 rounded-xl border border-border bg-card p-3.5 hover:border-brand/40 transition-colors group text-sm"
    >
      <Gauge class="h-4 w-4 shrink-0" />
      <span class="font-semibold group-hover:text-brand">
        {{ zh ? `完整 ${dashboardRecords.length} 筆 prefill/decode 量測（heatmap）` : `All ${dashboardRecords.length} prefill/decode measurements (heatmap)` }}
      </span>
      <ArrowRight class="h-4 w-4 ml-auto shrink-0 text-muted-foreground group-hover:text-brand" />
    </router-link>
  </div>
</template>
