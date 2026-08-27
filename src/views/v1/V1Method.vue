<script setup lang="ts">
/**
 * V1 Method — "why you can trust this page", written for people who have
 * never read an eval paper. Live counts come from the loaded snapshot; the
 * prose explains the rules that the rest of the UI silently enforces.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import {
  sweCellsByExam,
  fleetMachines,
  scorecardSweMeta,
  dashboardRecords,
  taskDomains,
  orderedExamVersions,
} from '@/lib/store'
import { taskStats } from '@/lib/taskMatrix'
import { errorRateByAccess } from '@/lib/speedFrontier'
import { domainLabel } from '@/lib/domainBreakdown'
import Term from '@/components/v1/Term.vue'
import { Card, CardContent } from '@/components/ui/card'
import { FileCode2, CheckCheck, ShieldCheck, Scale, AlertTriangle, Github, History, BarChart3, CircleSlash } from 'lucide-vue-next'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const cellCount = computed(() => sweCellsByExam.value.length)
const machineCount = computed(() => fleetMachines.value.length)
const speedCount = computed(() => dashboardRecords.value.length)
const examTotal = computed(() => scorecardSweMeta.value?.n_exam ?? scorecardSweMeta.value?.n_canon ?? 34)
const examName = computed(() => scorecardSweMeta.value?.current_exam_label ?? scorecardSweMeta.value?.current_exam ?? '')

// ---- Exam lineage: every version bump is public, with its reason ----
const examHistory = computed(() =>
  orderedExamVersions(scorecardSweMeta.value?.exam_versions ?? []),
)

// ---- Task difficulty spectrum, derived from the full per-task verdict grid ----
const stats = computed(() => taskStats(sweCellsByExam.value, taskDomains.value))
const hardest = computed(() => stats.value.slice(0, 5))
const easiest = computed(() => stats.value.slice(-3).reverse())
const saturated = computed(() => stats.value.filter((s) => s.band !== 'discriminating'))
const dLabel = (d: string | null) => (d ? (zh.value ? domainLabel(d).zh : domainLabel(d).en) : '—')

// ---- Toolchain error rate: ERROR is a harness casualty, not a wrong answer ----
const errorRates = computed(() => errorRateByAccess(sweCellsByExam.value))
const localErr = computed(() => errorRates.value.find((e) => e.access === 'local'))
const cloudErr = computed(() => errorRates.value.find((e) => e.access === 'cloud'))
</script>

<template>
  <div class="space-y-6 max-w-3xl mx-auto">
    <div class="space-y-2">
      <h2 class="text-xl font-bold tracking-tight">{{ zh ? '為什麼這裡的數字可信？' : 'Why trust these numbers?' }}</h2>
      <p class="text-sm text-muted-foreground leading-relaxed">
        {{ zh
          ? `這站目前有 ${cellCount} 份解題成績單、${speedCount} 筆速度實測，來自 ${machineCount} 台真實機器。以下是產生這些數字的規則 — 以及我們刻意不做的事。`
          : `This site currently holds ${cellCount} exam results and ${speedCount} speed measurements from ${machineCount} real machines. Here are the rules that produce them — and what we deliberately refuse to do.` }}
      </p>
    </div>

    <!-- 1. Where tasks come from -->
    <Card>
      <CardContent class="p-5 space-y-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <FileCode2 class="h-4 w-4 text-brand" />
          {{ zh ? '題目從哪來？' : 'Where do the tasks come from?' }}
        </h3>
        <div class="text-sm text-foreground/85 leading-relaxed space-y-2">
          <p v-if="zh">
            {{ examTotal }} 道題全部抽自<strong>我們自己專案裡真實解過的問題</strong>：修 bug、加功能、寫腳本，涵蓋後端、前端、CLI、資料管線。
            不是演算法謎題，也不是網路上模型可能背過答案的公開題庫。
          </p>
          <p v-else>
            All {{ examTotal }} tasks are pulled from <strong>problems we actually solved in our own projects</strong> — bug fixes, features, scripts across backend, frontend, CLI and data pipelines. Not algorithm puzzles, and not public benchmarks whose answers models may have memorized.
          </p>
          <p v-if="zh">
            模型以 <strong>coding agent</strong> 的身分作答：拿到真的 repo，自己讀 code、改檔案、跑測試 — 跟你實際使用的方式一樣，
            不是「貼一段題目請它輸出答案」。
          </p>
          <p v-else>
            Models answer as <strong>coding agents</strong>: given the real repo, they read code, edit files, run tests — the way you'd actually use them, not "paste a prompt, grade the reply".
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- 2. How scoring works -->
    <Card>
      <CardContent class="p-5 space-y-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <CheckCheck class="h-4 w-4 text-emerald-500" />
          {{ zh ? '怎麼算分？' : 'How is it scored?' }}
        </h3>
        <div class="text-sm text-foreground/85 leading-relaxed space-y-2">
          <p v-if="zh">
            每題有一組<strong>自動驗收測試</strong>：agent 改完 code 之後跑測試，全過 = 解出，否則 = 沒解出。沒有人為評分、沒有印象分數。
          </p>
          <p v-else>
            Each task has <strong>automated verification tests</strong>: after the agent's edits, tests either all pass (solved) or don't (not solved). No human judging, no vibes.
          </p>
          <p v-if="zh">
            <strong>所有模型考同一份卷</strong>（{{ examName }}）。雲端旗艦和 16GB 顯卡上的量化模型，題目一字不差 —
            所以「25/{{ examTotal }} vs 30/{{ examTotal }}」是真的可以直接比的。沒考完整份卷的成績會被移出排名（標示<Term k="fullrun" :label="zh ? '滿卷' : 'full run'" />規則）。
          </p>
          <p v-else>
            <strong>Every model takes the same frozen exam</strong> ({{ examName }}). A cloud flagship and a quantized model on a 16GB card get identical tasks — so scores compare directly. Anything short of a <Term k="fullrun" label="full run" /> is excluded from rankings.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- 2b. Exam lineage — every bump is public, with its reason -->
    <Card v-if="examHistory.length">
      <CardContent class="p-5 space-y-3">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <History class="h-4 w-4 text-violet-500" />
          {{ zh ? '考卷改版沿革（為什麼題數會變）' : 'Exam version history (why the task count changed)' }}
        </h3>
        <p class="text-sm text-foreground/85 leading-relaxed">
          {{ zh
            ? '考卷不是永遠不動 — 但每次改版都公開留痕：改了什麼、為什麼、哪天。不同版本的成績絕不混排。'
            : 'The exam does evolve — but every bump is public: what changed, why, and when. Scores from different versions are never mixed in one ranking.' }}
        </p>
        <ol class="relative border-l border-border/60 ml-1.5 space-y-3">
          <li v-for="v in examHistory" :key="v.version" class="pl-4 relative">
            <span
              class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
              :class="v.current ? 'bg-brand' : 'bg-muted-foreground/40'"
            />
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="font-mono text-xs font-bold">{{ v.label || v.version }}</span>
              <span v-if="v.n_tasks != null" class="text-[10px] text-muted-foreground font-mono">{{ v.n_tasks }} {{ zh ? '題' : 'tasks' }}</span>
              <span v-if="v.date" class="text-[10px] text-muted-foreground font-mono">{{ v.date.slice(0, 10) }}</span>
              <span v-if="v.current" class="rounded-full border border-brand/40 bg-brand/10 px-1.5 text-[10px] text-brand font-semibold">{{ zh ? '現行' : 'current' }}</span>
            </div>
            <p v-if="v.note" class="text-xs text-muted-foreground leading-relaxed mt-0.5">{{ v.note }}</p>
          </li>
        </ol>
      </CardContent>
    </Card>

    <!-- 2c. Which tasks actually discriminate — derived from the verdict grid -->
    <Card v-if="stats.length">
      <CardContent class="p-5 space-y-3">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <BarChart3 class="h-4 w-4 text-teal-500" />
          {{ zh ? '考卷長什麼樣？逐題難度譜' : 'What does the exam look like? Task difficulty spectrum' }}
        </h3>
        <p class="text-sm text-foreground/85 leading-relaxed">
          {{ zh
            ? `這不是黑箱：以下是全部 ${stats.length} 題在所有滿卷成績上的實際過題率。`
            : `No black box: here is the real fleet-wide pass rate for all ${stats.length} tasks across full-exam runs.` }}
        </p>
        <div class="grid sm:grid-cols-2 gap-3 text-xs">
          <div class="space-y-1.5">
            <div class="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">{{ zh ? '最難五題' : '5 hardest' }}</div>
            <div v-for="s in hardest" :key="s.taskId" class="flex items-center gap-2 font-mono">
              <span class="w-14 text-right font-bold">{{ Math.round(s.passRate * 100) }}%</span>
              <div class="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div class="absolute inset-y-0 left-0 bg-rose-500/70 rounded-full" :style="{ width: `${Math.round(s.passRate * 100)}%` }" />
              </div>
              <span class="w-28 truncate text-muted-foreground">{{ dLabel(s.domain) }}</span>
            </div>
          </div>
          <div class="space-y-1.5">
            <div class="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">{{ zh ? '最簡單三題' : '3 easiest' }}</div>
            <div v-for="s in easiest" :key="s.taskId" class="flex items-center gap-2 font-mono">
              <span class="w-14 text-right font-bold">{{ Math.round(s.passRate * 100) }}%</span>
              <div class="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div class="absolute inset-y-0 left-0 bg-emerald-500/70 rounded-full" :style="{ width: `${Math.round(s.passRate * 100)}%` }" />
              </div>
              <span class="w-28 truncate text-muted-foreground">{{ dLabel(s.domain) }}</span>
            </div>
          </div>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed">
          {{ zh
            ? (saturated.length
              ? `${saturated.length} 題目前是「全過或全不過」— 對排名沒有鑑別力，是下次改版的退題候選（也公開在這裡，不藏）。`
              : '目前沒有「全過或全不過」的題 — 每一題都對排名有鑑別力。')
            : (saturated.length
              ? `${saturated.length} task(s) are currently all-pass or all-fail — they carry no ranking signal and are retirement candidates for the next bump (disclosed here, not hidden).`
              : 'No task is currently all-pass or all-fail — every task carries ranking signal.') }}
          <RouterLink to="/v1/exam" class="text-brand hover:underline ml-1">
            {{ zh ? '→ 完整逐題表' : '→ full per-task table' }}
          </RouterLink>
        </p>
      </CardContent>
    </Card>

    <!-- 3. The three gates -->
    <Card>
      <CardContent class="p-5 space-y-3">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <ShieldCheck class="h-4 w-4 text-sky-500" />
          {{ zh ? '低分不一定是模型笨 — 三道驗收閘門' : 'A low score isn\'t always the model — the 3 gates' }}
        </h3>
        <p class="text-sm text-foreground/85 leading-relaxed">
          {{ zh
            ? '跑分最常見的造假不是改數字，而是「環境爛掉卻算模型輸」。每個分數公佈前要過三關：'
            : 'The most common benchmark lie isn\'t edited numbers — it\'s blaming the model for a broken environment. Every score passes three checks:' }}
        </p>
        <div class="grid gap-2">
          <div class="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
            <span class="font-bold">🔴 {{ zh ? '環境閘' : 'Infra gate' }}</span> —
            {{ zh ? '伺服器崩潰、API 斷線造成的失敗不算模型的錯，超標的整格成績作廢。' : 'Failures from server crashes or API outages don\'t count against the model; cells over the threshold are voided.' }}
          </div>
          <div class="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
            <span class="font-bold">🟠 {{ zh ? '工具閘' : 'Tool-use gate' }}</span> —
            {{ zh ? 'agent 全程健康卻一行 code 都沒寫（工具鏈不合），是配置問題不是能力問題，會被標記而不是當作低能力。' : 'A healthy agent that wrote zero code hit a toolchain mismatch — flagged as such, not booked as low ability.' }}
          </div>
          <div class="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
            <span class="font-bold">🟡 {{ zh ? '預算閘' : 'Budget gate' }}</span> —
            {{ zh ? '答到一半被 token 上限截斷的比例會標注出來，被上限壓住的低分不能直接當實力。' : 'The share of runs truncated by token caps is annotated; cap-floored scores aren\'t treated as ability.' }}
          </div>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed">
          {{ zh ? '排行榜上每列的「驗收」欄就是這三關的即時燈號。' : 'The "Gates" column on the ranking is the live status of these three checks.' }}
        </p>

        <!-- Live ERROR-rate receipt: local serving is genuinely more fragile -->
        <div v-if="localErr && cloudErr" class="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5">
          <div class="text-xs font-semibold">
            {{ zh ? '這三關不是裝飾 — 逐題判定裡的實際 ERROR 率：' : 'These gates are not decoration — the real ERROR share in per-task verdicts:' }}
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs font-mono">
            <div class="rounded-md bg-background/60 p-2 text-center">
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ zh ? '本地跑分' : 'Local runs' }}</div>
              <div class="font-bold">{{ (localErr.errorShare * 100).toFixed(1) }}%</div>
              <div class="text-[10px] text-muted-foreground">{{ localErr.nError }}/{{ localErr.nVerdicts }} {{ zh ? '題次' : 'verdicts' }}</div>
            </div>
            <div class="rounded-md bg-background/60 p-2 text-center">
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ zh ? '雲端跑分' : 'Cloud runs' }}</div>
              <div class="font-bold">{{ (cloudErr.errorShare * 100).toFixed(1) }}%</div>
              <div class="text-[10px] text-muted-foreground">{{ cloudErr.nError }}/{{ cloudErr.nVerdicts }} {{ zh ? '題次' : 'verdicts' }}</div>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground leading-relaxed">
            {{ zh
              ? 'ERROR（伺服器崩潰、工具鏈斷裂）≠ FAIL（答錯）。本地 serving 的 ERROR 率天生比雲端高 — 這正是為什麼低分要先過閘門檢查，才能歸因給模型能力。'
              : 'ERROR (server crash, broken toolchain) ≠ FAIL (wrong answer). Local serving has an inherently higher ERROR rate than cloud APIs — exactly why a low score must clear the gates before being blamed on the model.' }}
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- 4. Honesty rules -->
    <Card>
      <CardContent class="p-5 space-y-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <Scale class="h-4 w-4 text-amber-500" />
          {{ zh ? '我們刻意不做的事' : 'What we refuse to do' }}
        </h3>
        <ul class="text-sm text-foreground/85 leading-relaxed space-y-1.5 list-disc pl-5">
          <li>{{ zh ? '不用極短 prompt 的行銷速度 — 速度都在真實解題過程中量（實戰吞吐）。' : 'No short-prompt marketing speed — throughput is measured during real task-solving.' }}</li>
          <li>{{ zh ? '查無資料就顯示「—」，絕不用估計值填空。' : 'Missing data renders as "—", never an estimate.' }}</li>
          <li>{{ zh ? '差距小於考卷波動就標「統計並列」，不硬排先後。' : 'Gaps within exam noise are labeled statistical ties, not fake rankings.' }}</li>
          <li>{{ zh ? '每個數字都附收據：哪台機器、哪天、哪個 cell。' : 'Every number carries its receipt: which machine, which day, which cell.' }}</li>
        </ul>
      </CardContent>
    </Card>

    <!-- 4b. What this site CANNOT answer — data doesn't support it, so we say so -->
    <Card>
      <CardContent class="p-5 space-y-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <CircleSlash class="h-4 w-4 text-muted-foreground" />
          {{ zh ? '這個站回答不了的問題' : 'Questions this site cannot answer' }}
        </h3>
        <p class="text-sm text-foreground/85 leading-relaxed">
          {{ zh
            ? '沒有資料就不編數字。以下問題我們的量測目前不支撐，別在這裡找答案：'
            : 'No data, no invented numbers. Our measurements currently do not support these questions — don\'t look for answers here:' }}
        </p>
        <ul class="text-sm text-foreground/85 leading-relaxed space-y-1.5 list-disc pl-5">
          <li>
            <strong>{{ zh ? '「跑一題多少錢？」' : '"What does a task cost in $?"' }}</strong> —
            {{ zh ? '雲端 cell 的計價資料目前全數缺席（pricing unavailable），我們不拿官網牌價乘 token 數假裝算過。' : 'pricing data is absent for every cloud cell; we won\'t fake it by multiplying list prices by token counts.' }}
          </li>
          <li>
            <strong>{{ zh ? '「高並發 serving 表現？」' : '"How does it serve under concurrency?"' }}</strong> —
            {{ zh ? '所有實測都是單一 agent 連線（concurrency = 1），對多人共用的吞吐沒有發言權。' : 'every measurement is a single agent connection (concurrency = 1); we have no standing on multi-user throughput.' }}
          </li>
          <li>
            <strong>{{ zh ? '「寫作／翻譯／聊天好不好用？」' : '"Is it good at writing / translation / chat?"' }}</strong> —
            {{ zh ? '考卷只考 coding agent 任務。這是刻意的定位，不是疏漏 — 非 coding 用途請看別的評測。' : 'the exam only tests coding-agent tasks. That focus is deliberate — for non-coding use, read other evals.' }}
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 5. Limits -->
    <Card>
      <CardContent class="p-5 space-y-2">
        <h3 class="font-bold text-sm flex items-center gap-2">
          <AlertTriangle class="h-4 w-4 text-rose-500" />
          {{ zh ? '限制（讀數字前該知道的）' : 'Limits (read before quoting)' }}
        </h3>
        <div class="text-sm text-foreground/85 leading-relaxed space-y-2">
          <p v-if="zh">
            {{ examTotal }} 題的考卷，一兩題的差距屬於雜訊 — 這就是為什麼每個分數都帶<Term k="ci" :label="'波動範圍'" />。
            題目偏向我們自己的技術棧（Python / TypeScript / Rust / Shell 為主），你的場景可能不同。
          </p>
          <p v-else>
            On a {{ examTotal }}-task exam, one or two tasks are noise — hence the <Term k="ci" label="uncertainty band" /> on every score. Tasks skew toward our own stack (Python / TypeScript / Rust / Shell); your mileage may vary.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Receipts link -->
    <a
      href="https://github.com/cookys/model-dyno"
      target="_blank"
      class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group"
    >
      <Github class="h-5 w-5 shrink-0" />
      <div>
        <div class="font-bold text-sm group-hover:text-brand">{{ zh ? '原始收據全部開源' : 'All raw receipts are open' }}</div>
        <div class="text-xs text-muted-foreground">{{ zh ? '每筆 JSON、每個 diff、每次驗收 log 都在 GitHub 上' : 'Every JSON, diff and verification log lives on GitHub' }}</div>
      </div>
    </a>
  </div>
</template>
