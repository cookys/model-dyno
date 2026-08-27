<script setup lang="ts">
import { computed } from 'vue'
import { Hourglass, MoreHorizontal } from 'lucide-vue-next'
import { useI18n } from '@/lib/i18n'
import { scorecardSweMeta } from '@/lib/store'
import type { SweCell } from '@/lib/store'
import { examCoverageState, showExamCoverageChip } from '@/lib/examCoverage'

const props = defineProps<{
  cell?: Pick<SweCell, 'n_graded' | 'n_exam' | 'n_canon' | 'owed' | 'n_passed'> | null
  nGraded?: number | null
  nExam?: number | null
  owed?: number | null
  comparableMin?: number
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const minGraded = computed(
  () => props.comparableMin ?? scorecardSweMeta.value?.comparable_min ?? 30,
)

const state = computed(() => {
  const c = props.cell
  return examCoverageState(
    c?.n_graded ?? props.nGraded,
    c?.n_exam ?? c?.n_canon ?? props.nExam,
    c?.owed ?? props.owed,
    minGraded.value,
  )
})

const visible = computed(() => showExamCoverageChip(state.value))

const tooltip = computed(() => {
  const s = state.value
  if (!s) return ''
  const passed = props.cell?.n_passed
  const scoreLine = passed != null
    ? (zh.value ? `解出 ${passed}/${s.nGraded}` : `solved ${passed}/${s.nGraded}`)
    : (zh.value ? `收據 ${s.nGraded} 題` : `receipt ${s.nGraded} tasks`)
  if (s.kind === 'thin') {
    return zh.value
      ? `考卷 ${s.nExam} 題 · ${scoreLine} · 未達滿卷門檻（<${minGraded.value}）`
      : `Exam ${s.nExam} tasks · ${scoreLine} · below full-run threshold (<${minGraded.value})`
  }
  return zh.value
    ? `考卷 ${s.nExam} 題 · ${scoreLine} · 欠 ${s.owed} 題`
    : `Exam ${s.nExam} tasks · ${scoreLine} · ${s.owed} owed`
})
</script>

<template>
  <span
    v-if="visible && state"
    class="inline-flex items-center gap-0.5 rounded border px-1 py-0.5 font-mono text-[10px] font-bold leading-none"
    :class="state.kind === 'thin'
      ? 'border-border/60 bg-muted/50 text-muted-foreground'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'"
    :title="tooltip"
  >
    <MoreHorizontal v-if="state.kind === 'thin'" class="h-2.5 w-2.5" aria-hidden="true" />
    <Hourglass v-else class="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
    <span v-if="state.kind === 'owed'">{{ state.owed }}</span>
  </span>
</template>
