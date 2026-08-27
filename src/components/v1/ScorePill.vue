<script setup lang="ts">
/**
 * Score display for lay readers: "解出 X / N 題" leads, the bar shows the
 * fraction with the CI drawn as a lighter band, and the percentage + CI
 * wording live in the hover explanation instead of the primary text.
 */
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'

const props = defineProps<{
  passed: number | null | undefined
  total: number | null | undefined
  ci?: [number, number] | null
  /** Compact = number + bar only (table rows); default adds the 題 wording. */
  compact?: boolean
  /** Bare = number only, no fraction bar (tight cells that have their own bar). */
  bare?: boolean
  /** Percent-only pill (fraction in hover tooltip). */
  showPercent?: boolean
}>()

const { locale } = useI18n()

const rate = computed(() => {
  if (props.passed == null || !props.total) return null
  return props.passed / props.total
})

const pctLabel = computed(() =>
  rate.value == null ? null : `${(rate.value * 100).toFixed(1)}%`,
)

const pillClass = computed(() => {
  const r = rate.value
  if (r == null) return 'border-border/60 bg-muted/40 text-foreground'
  if (r >= 0.75) {
    return 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-950 dark:text-emerald-100'
  }
  if (r >= 0.5) {
    return 'border-amber-500/35 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100'
  }
  return 'border-rose-500/35 bg-rose-500/[0.08] text-rose-950 dark:text-rose-100'
})

const fractionLabel = computed(() => {
  if (props.passed == null || props.total == null) return null
  return `${props.passed}/${props.total}`
})

const tooltip = computed(() => {
  if (rate.value == null) return ''
  const pctStr = pctLabel.value ?? ''
  const ciStr = props.ci
    ? `${(props.ci[0] * 100).toFixed(0)}–${(props.ci[1] * 100).toFixed(0)}%`
    : null
  const frac = fractionLabel.value
  if (locale.value === 'zh') {
    const head = frac ? `${frac} 題 · ` : ''
    return `${head}過題率 ${pctStr}${ciStr ? `；重考同卷的合理波動範圍 ${ciStr}` : ''}`
  }
  const head = frac ? `${frac} tasks · ` : ''
  return `${head}Pass rate ${pctStr}${ciStr ? `; plausible re-run range ${ciStr}` : ''}`
})
</script>

<template>
  <div class="inline-flex items-center gap-2" :title="tooltip">
    <!-- Percent-only pill; fraction lives in tooltip -->
    <span
      v-if="showPercent"
      class="inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] font-bold tabular-nums leading-none tracking-tight shadow-sm"
      :class="pillClass"
    >
      {{ pctLabel ?? '—' }}
    </span>

    <!-- Classic: fraction (+ optional progress bar) -->
    <template v-else>
      <span class="font-mono font-bold text-sm tabular-nums whitespace-nowrap">
        {{ passed ?? '?' }}<span class="text-muted-foreground font-normal"> / {{ total ?? '?' }}</span><span
          v-if="!compact"
          class="text-muted-foreground font-normal text-xs"
        > {{ locale === 'zh' ? '題' : 'tasks' }}</span>
      </span>
      <span v-if="rate != null && !bare" class="relative h-2 w-24 overflow-hidden rounded-full bg-muted shrink-0">
        <span
          v-if="ci"
          class="absolute inset-y-0 rounded-full bg-brand/25"
          :style="{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }"
        />
        <span
          class="absolute inset-y-0 left-0 rounded-full bg-brand"
          :style="{ width: `${rate * 100}%` }"
        />
      </span>
    </template>
  </div>
</template>
