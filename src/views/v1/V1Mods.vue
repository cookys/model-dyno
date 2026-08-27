<script setup lang="ts">
/**
 * V1 Mods — "internet claims vs our receipts".
 * Every card asks a question people actually google (does quantization make
 * it dumber? is the uncensored version worse? is spec-decode free speed?),
 * answers in ONE plain sentence derived from receipts, and folds the evidence
 * underneath. Nothing here is editorial opinion — verdict sentences are
 * computed from CI overlap on real cells, or come from the producer's
 * curated findings (which carry their own evidence + repro commands).
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import {
  sweCellsByExam,
  modelRegistry,
  findings,
  specDecodeFindings,
  depthFindings,
} from '@/lib/store'
import {
  variantReceiptsForModel,
  quantGroupsForModel,
  tiedWithBest,
  wilsonLowOf,
  type VariantReceipt,
} from '@/lib/receipts'
import { matchedPairsForModel, type MatchedPair } from '@/lib/matchedPairs'
import ScorePill from '@/components/v1/ScorePill.vue'
import ExamCoverageChip from '@/components/v1/ExamCoverageChip.vue'
import Term from '@/components/v1/Term.vue'
import MatchedPairList from '@/components/v1/MatchedPairList.vue'
import { Card, CardContent } from '@/components/ui/card'
import { FlaskConical, GitCompareArrows, Scale, Scissors, Zap, Layers, ChevronDown } from 'lucide-vue-next'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const canonicals = computed(() => {
  const set = new Set<string>()
  for (const c of sweCellsByExam.value) {
    const m = c.identity?.canonical_model ?? c.model
    if (m) set.add(m)
  }
  return Array.from(set)
})

// --- Quantization: models with ≥2 measured quant levels -----------------------

interface QuantStory {
  canonical: string
  groups: ReturnType<typeof quantGroupsForModel>
  verdict: string
}

const quantStories = computed<QuantStory[]>(() => {
  const out: QuantStory[] = []
  for (const canon of canonicals.value) {
    const receipts = variantReceiptsForModel(canon, sweCellsByExam.value, modelRegistry.value)
      .filter((r) => r.rankable && (r.cell.n_graded ?? 0) >= 30)
    const groups = quantGroupsForModel(receipts)
    if (groups.length < 2) continue
    const best = groups[0]
    const worst = groups[groups.length - 1]
    const gap = (best.best.cell.n_passed ?? 0) - (worst.best.cell.n_passed ?? 0)
    const allTied = groups.slice(1).every((g) => tiedWithBest(g, best))
    const verdict = zh.value
      ? allTied
        ? `${canon}：${groups.length} 個量化版本的差距都在波動範圍內 — 挑最小、最快的那個就好。`
        : `${canon}：最好（${best.key}）與最差（${worst.key}）差 ${gap} 題，超出波動範圍 — 量化選擇是真的有差。`
      : allTied
        ? `${canon}: all ${groups.length} quant levels are within exam noise — pick the smallest/fastest one.`
        : `${canon}: best (${best.key}) vs worst (${worst.key}) differ by ${gap} tasks, beyond noise — the quant choice really matters.`
    out.push({ canonical: canon, groups, verdict })
  }
  return out.sort((a, b) => b.groups.length - a.groups.length)
})

// --- Abliteration: official vs modified weights in the same family -------------

interface AbliterationStory {
  family: string
  official: { canonical: string; receipt: VariantReceipt }
  abliterated: { canonical: string; receipt: VariantReceipt }
  verdict: string
}

function bestReceiptOf(canon: string): VariantReceipt | null {
  const rs = variantReceiptsForModel(canon, sweCellsByExam.value, modelRegistry.value)
    .filter((r) => r.rankable && (r.cell.n_graded ?? 0) >= 30)
  if (!rs.length) return null
  return rs.reduce((best, r) => (wilsonLowOf(r.cell) > wilsonLowOf(best.cell) ? r : best))
}

const ciOverlap = (a: VariantReceipt, b: VariantReceipt): boolean | null => {
  const ca = a.cell.headline_ci
  const cb = b.cell.headline_ci
  if (!ca || !cb) return null
  return Math.max(ca[0], cb[0]) <= Math.min(ca[1], cb[1])
}

const abliterationStories = computed<AbliterationStory[]>(() => {
  const byFamily = new Map<string, { official?: { canonical: string; receipt: VariantReceipt }; abliterated?: { canonical: string; receipt: VariantReceipt } }>()
  for (const canon of canonicals.value) {
    const r = bestReceiptOf(canon)
    if (!r?.registry?.family) continue
    const slot = byFamily.get(r.registry.family) ?? {}
    if (r.modType === 'abliterated') {
      if (!slot.abliterated || (r.cell.headline ?? 0) > (slot.abliterated.receipt.cell.headline ?? 0)) {
        slot.abliterated = { canonical: canon, receipt: r }
      }
    } else if (r.modType === 'official') {
      if (!slot.official || (r.cell.headline ?? 0) > (slot.official.receipt.cell.headline ?? 0)) {
        slot.official = { canonical: canon, receipt: r }
      }
    }
    byFamily.set(r.registry.family, slot)
  }
  const out: AbliterationStory[] = []
  for (const [family, slot] of byFamily) {
    if (!slot.official || !slot.abliterated) continue
    const o = slot.official.receipt.cell
    const a = slot.abliterated.receipt.cell
    const gap = (o.n_passed ?? 0) - (a.n_passed ?? 0)
    const overlap = ciOverlap(slot.official.receipt, slot.abliterated.receipt)
    const verdict = zh.value
      ? overlap === true
        ? `${family} 家族：去審查版與原版的差距（${gap} 題）在波動範圍內 — 這一對看不出能力代價。`
        : `${family} 家族：去審查版比原版少解 ${gap} 題，超出波動範圍 — 改權重是有實測代價的。`
      : overlap === true
        ? `${family} family: the ${gap}-task gap is within exam noise — no measurable ability cost in this pair.`
        : `${family} family: the abliterated build solves ${gap} fewer tasks, beyond noise — modifying weights has a measured cost.`
    out.push({ family, official: slot.official, abliterated: slot.abliterated, verdict })
  }
  return out
})

// --- Controlled single-variable pairs across every model -----------------------

const matchedPairs = computed<MatchedPair[]>(() => {
  const out: MatchedPair[] = []
  for (const canon of canonicals.value) {
    const rs = variantReceiptsForModel(canon, sweCellsByExam.value, modelRegistry.value)
    out.push(...matchedPairsForModel(rs))
  }
  // Real (beyond-noise) gaps first, then by gap size.
  return out.sort((a, b) => {
    const ra = a.withinNoise === false ? 0 : 1
    const rb = b.withinNoise === false ? 0 : 1
    return ra - rb || b.deltaPassed - a.deltaPassed
  })
})

// --- Spec-decode / depth / curated findings -----------------------------------

const specRows = computed(() => specDecodeFindings.value)
const specWins = computed(() => specRows.value.filter((r) => (r.speedup ?? 0) > 1.05).length)
const specLosses = computed(() => specRows.value.filter((r) => r.speedup != null && r.speedup < 1).length)

const depthRows = computed(() => depthFindings.value)

const fmtSpeedup = (v: number | null) => (v != null ? `${v.toFixed(2)}×` : '—')
const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—')
</script>

<template>
  <div class="space-y-8">
    <div class="space-y-1">
      <h2 class="text-xl font-bold tracking-tight flex items-center gap-2">
        <FlaskConical class="h-5 w-5 text-purple-500" />
        {{ zh ? '改裝真相：傳言 vs 實測' : 'Mod truths: claims vs receipts' }}
      </h2>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '網路上關於量化、去審查、加速技巧的說法，多半沒附證據。這頁的每個結論都由同一份考卷的實測收據推導，含反例。'
          : 'Claims about quantization, abliteration and speed tricks rarely come with evidence. Every verdict here is derived from same-exam receipts — including the losses.' }}
      </p>
    </div>

    <!-- Q1: Quantization -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Scale class="h-4 w-4 text-brand" />
        {{ zh ? '「量化會讓模型變笨嗎？」' : '"Does quantization make models dumber?"' }}
        <span class="text-xs font-normal text-muted-foreground">— <Term k="quant" /></span>
      </h3>
      <Card v-for="story in quantStories" :key="story.canonical">
        <CardContent class="p-4 space-y-3">
          <p class="text-sm font-medium leading-relaxed">{{ story.verdict }}</p>
          <div class="grid gap-1.5">
            <div
              v-for="g in story.groups"
              :key="g.key"
              class="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-mono text-xs font-bold w-24 shrink-0">{{ g.key }}</span>
                <span v-if="g.best.registry?.weights_gb != null" class="text-[10px] text-muted-foreground shrink-0">
                  {{ g.best.registry.weights_gb }} GB
                </span>
                <span v-if="g !== story.groups[0] && tiedWithBest(g, story.groups[0])" class="text-[10px] rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400 shrink-0">
                  {{ zh ? '與最佳並列' : 'tied w/ best' }}
                </span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[10px] font-mono text-muted-foreground hidden sm:inline">{{ fmtDate(g.best.cell.scored_at) }}</span>
                <ScorePill :passed="g.best.cell.n_passed" :total="g.best.cell.n_graded" :ci="g.best.cell.headline_ci ?? null" compact />
                <ExamCoverageChip :cell="g.best.cell" />
              </div>
            </div>
          </div>
          <RouterLink
            :to="`/v1/model/${encodeURIComponent(story.canonical)}`"
            class="inline-block text-xs text-brand hover:underline"
          >
            {{ zh ? '看完整收據 →' : 'Full receipts →' }}
          </RouterLink>
        </CardContent>
      </Card>
      <p v-if="!quantStories.length" class="text-xs text-muted-foreground">
        {{ zh ? '目前還沒有同一模型 ≥2 個量化版本考完滿卷的資料。' : 'No model has ≥2 quant levels with full runs yet.' }}
      </p>
    </section>

    <!-- Q2: Abliteration -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Scissors class="h-4 w-4 text-rose-500" />
        {{ zh ? '「去審查版會變笨嗎？」' : '"Do uncensored builds get dumber?"' }}
        <span class="text-xs font-normal text-muted-foreground">— <Term k="abliterated" /></span>
      </h3>
      <Card v-for="story in abliterationStories" :key="story.family">
        <CardContent class="p-4 space-y-3">
          <p class="text-sm font-medium leading-relaxed">{{ story.verdict }}</p>
          <div class="grid sm:grid-cols-2 gap-2">
            <div
              v-for="side in [
                { label: zh ? '官方原版' : 'Official', entry: story.official, cls: 'border-emerald-500/30' },
                { label: zh ? '去審查版' : 'Abliterated', entry: story.abliterated, cls: 'border-rose-500/30' },
              ]"
              :key="side.label"
              class="rounded-lg border bg-muted/30 p-3 space-y-1.5"
              :class="side.cls"
            >
              <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{{ side.label }}</div>
              <RouterLink
                :to="`/v1/model/${encodeURIComponent(side.entry.canonical)}`"
                class="font-mono text-sm font-semibold hover:text-brand hover:underline block truncate"
              >
                {{ side.entry.canonical }}
              </RouterLink>
              <ScorePill
                :passed="side.entry.receipt.cell.n_passed"
                :total="side.entry.receipt.cell.n_graded"
                :ci="side.entry.receipt.cell.headline_ci ?? null"
                compact
              />
              <div class="text-[10px] text-muted-foreground font-mono">
                {{ side.entry.receipt.registry?.quant ?? '' }} · {{ fmtDate(side.entry.receipt.cell.scored_at) }}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <p v-if="!abliterationStories.length" class="text-xs text-muted-foreground">
        {{ zh ? '目前沒有同家族「原版 vs 去審查版」都考完滿卷的配對。' : 'No family has both official and abliterated full runs yet.' }}
      </p>
    </section>

    <!-- Q3: Controlled single-variable experiments -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <GitCompareArrows class="h-4 w-4 text-violet-500" />
        {{ zh ? '「只改一個變因會怎樣？」— 受控對照實驗' : '"What if you change ONE thing?" — controlled pairs' }}
      </h3>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? '同一個模型、同一份考卷、同一台機器，兩次測試之間只有一個條件不同（drafter、TP、thinking、取樣溫度實值、量化出品者、特殊旗標…）— 條件來自跑分機自己記錄的結構化標籤，不是從檔名猜的。紅色 = 差距超出重考波動；灰色 = 在波動範圍內，不要拿去下結論。展開「差在哪幾題」可以看到翻掉的是哪些題、屬於哪個領域。'
          : 'Same model, same exam, same machine — the two runs differ in exactly ONE condition (drafter, TP, thinking, real sampling temp, quant publisher, variant flags…), read from the producer\'s structured run tags, not guessed from file names. Red = beyond re-run noise; grey = within noise, do not over-read it. Expand "which tasks flipped" to see the exact tasks and their domains.' }}
      </p>
      <MatchedPairList :pairs="matchedPairs" show-model />
    </section>

    <!-- Q4: Speculative decoding -->
    <section class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Zap class="h-4 w-4 text-amber-500" />
        {{ zh ? '「推測解碼是免費加速嗎？」' : '"Is speculative decoding free speed?"' }}
        <span class="text-xs font-normal text-muted-foreground">— <Term k="specdecode" /></span>
      </h3>
      <Card v-if="specRows.length">
        <CardContent class="p-4 space-y-3">
          <p class="text-sm font-medium leading-relaxed">
            {{ zh
              ? `不是。我們 ${specRows.length} 筆實測中 ${specWins} 筆有感加速（>1.05×），但 ${specLosses} 筆反而變慢 — 值不值得開，取決於模型配對與工作負載。`
              : `No. Of ${specRows.length} measurements, ${specWins} showed real speedup (>1.05×) but ${specLosses} were net LOSSES — worth it only for the right pair and workload.` }}
          </p>
          <details class="group">
            <summary class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none">
              <ChevronDown class="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              {{ zh ? `展開全部 ${specRows.length} 筆收據` : `All ${specRows.length} receipts` }}
            </summary>
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="border-b border-border text-muted-foreground">
                  <tr>
                    <th class="px-2 py-1.5 text-left">{{ zh ? '目標模型' : 'Target' }}</th>
                    <th class="px-2 py-1.5 text-left">{{ zh ? '方法' : 'Method' }}</th>
                    <th class="px-2 py-1.5 text-left hidden sm:table-cell">{{ zh ? '工作負載' : 'Workload' }}</th>
                    <th class="px-2 py-1.5 text-right">{{ zh ? '加速' : 'Speedup' }}</th>
                    <th class="px-2 py-1.5 text-left hidden md:table-cell">{{ zh ? '機器' : 'Machine' }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in specRows" :key="i" class="border-b border-border/30 last:border-0">
                    <td class="px-2 py-1.5 font-mono">{{ r.target ?? '—' }}</td>
                    <td class="px-2 py-1.5 font-mono">{{ r.method ?? '—' }}</td>
                    <td class="px-2 py-1.5 text-muted-foreground hidden sm:table-cell">{{ r.workload ?? '—' }}</td>
                    <td
                      class="px-2 py-1.5 text-right font-mono font-bold"
                      :class="(r.speedup ?? 1) >= 1.05 ? 'text-emerald-600 dark:text-emerald-400' : (r.speedup ?? 1) < 1 ? 'text-rose-600 dark:text-rose-400' : ''"
                    >
                      {{ fmtSpeedup(r.speedup) }}
                    </td>
                    <td class="px-2 py-1.5 font-mono text-muted-foreground hidden md:table-cell">{{ r.machine ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>
    </section>

    <!-- Q4: Deep context -->
    <section v-if="depthRows.length" class="space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <Layers class="h-4 w-4 text-sky-500" />
        {{ zh ? '「長脈絡下還跑得動嗎？」' : '"Does it survive deep context?"' }}
      </h3>
      <Card>
        <CardContent class="p-4 space-y-2">
          <p class="text-xs text-muted-foreground leading-relaxed">
            {{ zh
              ? '行銷跑分幾乎都用短 prompt。真的拿來當 coding agent，context 動輒 3 萬 token 起跳 — 這是我們在真實深度下量的等待時間。'
              : 'Marketing numbers use short prompts. Real agent work starts at ~30k context — these are waits measured at real depth.' }}
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="border-b border-border text-muted-foreground">
                <tr>
                  <th class="px-2 py-1.5 text-left">{{ zh ? '配置' : 'Config' }}</th>
                  <th class="px-2 py-1.5 text-right">{{ zh ? '深度' : 'Context' }}</th>
                  <th class="px-2 py-1.5 text-left">{{ zh ? '狀態' : 'State' }}</th>
                  <th class="px-2 py-1.5 text-right">{{ zh ? '數值' : 'Value' }}</th>
                  <th class="px-2 py-1.5 text-left hidden md:table-cell">{{ zh ? '機器' : 'Machine' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in depthRows" :key="i" class="border-b border-border/30 last:border-0">
                  <td class="px-2 py-1.5 font-mono">{{ r.config ?? '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono">{{ r.context != null ? `${(r.context / 1000).toFixed(0)}k` : '—' }}</td>
                  <td class="px-2 py-1.5 text-muted-foreground">{{ r.state ?? '—' }}</td>
                  <td class="px-2 py-1.5 text-right font-mono font-semibold">
                    {{ r.value != null ? `${r.value}${r.metric?.includes('ttft') ? ' s' : ''}` : '—' }}
                  </td>
                  <td class="px-2 py-1.5 font-mono text-muted-foreground hidden md:table-cell">{{ r.machine ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>

    <!-- Curated findings from the producer -->
    <section v-if="findings.length" class="space-y-3">
      <h3 class="text-sm font-bold">{{ zh ? '其他實測發現' : 'Other measured findings' }}</h3>
      <div class="grid md:grid-cols-2 gap-3">
        <Card v-for="f in findings" :key="f.id">
          <CardContent class="p-4 space-y-2">
            <div class="font-bold text-sm">{{ zh ? (f.title_zh ?? f.title_en) : (f.title_en ?? f.title_zh) }}</div>
            <div v-if="zh ? f.claim_zh : f.claim_en" class="text-xs text-muted-foreground">
              <span class="font-semibold">{{ zh ? '傳言：' : 'Claim: ' }}</span>{{ zh ? f.claim_zh : f.claim_en }}
            </div>
            <div class="text-xs text-foreground/90 leading-relaxed">
              <span class="font-semibold text-emerald-600 dark:text-emerald-400">{{ zh ? '實測：' : 'Measured: ' }}</span>{{ zh ? (f.measured_zh ?? f.measured_en) : (f.measured_en ?? f.measured_zh) }}
            </div>
            <div v-if="f.evidence.length" class="flex flex-wrap gap-1.5 pt-1">
              <span
                v-for="(e, i) in f.evidence"
                :key="i"
                class="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono"
                :title="e.detail ?? undefined"
              >
                {{ e.metric }}: {{ e.value }}
              </span>
            </div>
            <div class="text-[10px] text-muted-foreground font-mono pt-1">
              {{ fmtDate(f.date) }}<span v-if="f.source"> · {{ f.source }}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  </div>
</template>
