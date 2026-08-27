<script setup lang="ts">
/**
 * Jargon term with a plain-language hover explanation.
 * The glossary is the single place v1 explains its vocabulary — every page
 * uses the same wording, so readers only have to learn a term once.
 */
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'

const GLOSSARY: Record<string, { zh: [string, string]; en: [string, string] }> = {
  quant: {
    zh: ['量化', '把模型權重壓小以塞進較小的顯示卡。壓得越兇檔案越小、速度越快，但可能變笨 — 這站直接實測每個量化版本掉幾題。'],
    en: ['quantization', 'Compressing model weights to fit smaller GPUs. More compression = smaller + faster, but possibly dumber — we measure exactly how many tasks each level loses.'],
  },
  abliterated: {
    zh: ['去審查版', '社群改過權重、移除拒答行為的版本。改權重可能傷能力 — 這站把原版和改版考同一份卷來驗證。'],
    en: ['abliterated', 'Community-modified weights with refusals removed. Modifying weights can hurt ability — we give both versions the same exam.'],
  },
  specdecode: {
    zh: ['推測解碼', '用一個小模型先猜、大模型驗收的加速技巧。不會改變答案品質，但加速幅度視情況而定 — 有時反而更慢。'],
    en: ['speculative decoding', 'A small "draft" model guesses ahead and the big model verifies. Output quality is unchanged; speedup varies — sometimes it is a net loss.'],
  },
  ci: {
    zh: ['波動範圍', '同一份 30 幾題的考卷重考一次，分數合理的浮動區間（95% Wilson 信賴區間）。兩個模型的區間重疊，就不能說誰比較強。'],
    en: ['uncertainty band', 'The plausible score range if the same ~34-task exam were re-taken (95% Wilson CI). Overlapping bands = a statistical tie.'],
  },
  tied: {
    zh: ['統計並列', '分數差距小於考卷本身的波動範圍，視為同一水準 — 排名先後只是運氣。'],
    en: ['statistical tie', 'The gap is smaller than the exam noise; treat them as the same level.'],
  },
  gates: {
    zh: ['三道驗收閘門', '每個分數公佈前檢查三件事：伺服器有沒有掛掉（環境）、agent 有沒有真的動手寫 code（工具）、預算有沒有卡到上限（截斷）。任何一關失守，低分就不能怪模型。'],
    en: ['3 credibility gates', 'Before a score is trusted we check: did infra fall over, did the agent actually write code, and did budget caps truncate work. Any failure means a low score is not the model\'s fault.'],
  },
  agentic: {
    zh: ['實戰吞吐', '模型在真的解題（讀檔、改 code、跑測試）時的實際輸出速度，不是行銷用的短句復讀速度。'],
    en: ['agentic throughput', 'Token speed measured while actually solving tasks (reading files, editing, running tests) — not marketing-style short-prompt replay.'],
  },
  fullrun: {
    zh: ['滿卷', '完整考完當期考卷（30+ 題）的成績。沒考完的分數會被高估或低估，只列參考、不入排名。'],
    en: ['full run', 'Completed the entire current exam (30+ tasks). Partial runs are listed for reference but never ranked.'],
  },
  local: {
    zh: ['本地', '模型權重下載到自己的機器上跑，code 不出門、不用付 API 費。'],
    en: ['local', 'Weights run on your own machine — code never leaves, no API bills.'],
  },
  draft: {
    zh: ['草稿模型', '推測解碼裡負責先猜的小模型，本身不拿來單獨回答問題。'],
    en: ['draft model', 'The small guessing model used by speculative decoding; not used standalone.'],
  },
  errorVerdict: {
    zh: ['ERROR', '驗收或 harness 在該題出錯（環境/工具），不是模型「選擇不做」。'],
    en: ['ERROR', 'Verifier or harness failed on this task (environment/tools) — not the model choosing to skip.'],
  },
  experimentLeg: {
    zh: ['實驗腿', '刻意偏離正式設定的跑法（如 temp=0 考試腿），可見但不入排行榜。'],
    en: ['experiment leg', 'A deliberate off-vendor run (e.g. temp=0 exam leg) — visible but never ranked.'],
  },
  weightsFit: {
    zh: ['權重適配', '權重檔案大小裝得進你的顯存檔位；分數可比，速度數字可能來自更大機器。'],
    en: ['weights fit', 'Weight file fits your VRAM tier; score is comparable but speed may come from a bigger machine.'],
  },
  measuredFit: {
    zh: ['同級實測', '分數與速度都在這檔位大小的機器上量過，可直接參考。'],
    en: ['same-tier measured', 'Score and speed were both measured on hardware this small — directly transferable.'],
  },
  solvedPerHour: {
    zh: ['每小時解題', '牆鐘時間內平均解掉幾題（含失敗題耗時）— 能力×速度的實用指標。'],
    en: ['solved per hour', 'Tasks solved per wall-clock hour (fail time included) — capability × speed.'],
  },
}

const props = defineProps<{
  k: keyof typeof GLOSSARY | string
  /** Override the displayed text (explanation still comes from the glossary). */
  label?: string
}>()

const { locale } = useI18n()
const entry = computed(() => GLOSSARY[props.k]?.[locale.value === 'zh' ? 'zh' : 'en'] ?? null)
</script>

<template>
  <span v-if="entry" class="relative inline-block group">
    <span class="border-b border-dotted border-muted-foreground/60 cursor-help">{{ label ?? entry[0] }}</span>
    <span
      class="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-xs leading-relaxed text-popover-foreground shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100"
    >
      <span class="font-bold block mb-0.5">{{ entry[0] }}</span>
      {{ entry[1] }}
    </span>
  </span>
  <span v-else>{{ label ?? k }}</span>
</template>
