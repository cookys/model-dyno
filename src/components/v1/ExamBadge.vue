<script setup lang="ts">
import { computed } from 'vue'
import { ClipboardList } from 'lucide-vue-next'
import { useI18n } from '@/lib/i18n'
import { scorecardSweMeta } from '@/lib/store'
import { examAlias, examSemver, examTooltip } from '@/lib/examDisplay'

const props = defineProps<{
  version: string | null | undefined
  currentExam?: string | null
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const meta = computed(() =>
  props.version
    ? scorecardSweMeta.value?.exam_versions?.find((v) => v.version === props.version) ?? null
    : null,
)

const alias = computed(() => examAlias(meta.value?.n_tasks, props.version))
const semver = computed(() => examSemver(meta.value?.label))
const stale = computed(
  () => !!props.version && !!props.currentExam && props.version !== props.currentExam,
)
const tooltip = computed(() => examTooltip(meta.value, props.version, zh.value))
</script>

<template>
  <span
    v-if="alias"
    class="inline-flex items-start gap-px whitespace-nowrap"
    :title="tooltip"
  >
    <span
      class="inline-flex items-center gap-0.5 rounded border px-1 py-0.5 font-mono text-[10px] font-bold leading-none tracking-tight"
      :class="stale
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
        : 'border-border/60 bg-muted/40 text-foreground'"
    >
      <ClipboardList class="h-2.5 w-2.5 shrink-0 opacity-65" aria-hidden="true" />
      {{ alias }}
    </span>
    <sup
      v-if="semver"
      class="ml-px text-[8px] font-mono font-medium leading-none text-muted-foreground translate-y-px"
    >{{ semver }}</sup>
  </span>
  <span v-else class="text-muted-foreground">—</span>
</template>
