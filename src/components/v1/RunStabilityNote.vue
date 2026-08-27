<script setup lang="ts">
/**
 * Multi-run headline range — shown when producer stamped n_runs > 1.
 * Does not invent a stability index; just surfaces headline_range.
 */
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{
  nRuns?: number | null
  range?: [number, number] | null
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const visible = computed(
  () => (props.nRuns ?? 0) > 1 && Array.isArray(props.range) && props.range.length === 2,
)
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
</script>

<template>
  <span
    v-if="visible"
    class="text-[10px] font-mono text-muted-foreground"
    :title="zh
      ? `此 cell 重跑 ${nRuns} 次；headline 落在 ${pct(range![0])}–${pct(range![1])}（producer 聚合，非穩定度評分）`
      : `This cell has ${nRuns} runs; headline ranged ${pct(range![0])}–${pct(range![1])} (producer aggregate, not a stability score)`"
  >
    {{ zh ? `${nRuns}×跑` : `${nRuns} runs` }} · {{ pct(range![0]) }}–{{ pct(range![1]) }}
  </span>
</template>
