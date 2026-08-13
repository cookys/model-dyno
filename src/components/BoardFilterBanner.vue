<script setup lang="ts">
/**
 * Shared "this board is filtered" banner. One component so every ranking page shows the
 * same affordance — previously only SweComp had one, and it was inlined there.
 */
import { useI18n } from '@/lib/i18n'
import type { ActiveFilter } from '@/lib/modelFilter'

defineProps<{ filter: ActiveFilter | null }>()
defineEmits<{ (e: 'clear'): void }>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="filter"
    class="flex items-center justify-between gap-4 bg-muted/50 dark:bg-muted/20 border border-border px-4 py-3 rounded-lg shadow-sm"
  >
    <div class="flex items-center gap-2 text-sm text-foreground">
      <span class="text-amber-500 font-bold select-none">🔍</span>
      <span>
        {{ filter.kind === 'publisher' ? t('filter.filteredToPublisher') : t('filter.filteredTo') }}
        <strong
          class="font-mono bg-muted/80 dark:bg-muted/40 border border-border/80 px-1.5 py-0.5 rounded text-xs"
        >{{ filter.value }}</strong>
      </span>
      <span v-if="filter.kind === 'publisher'" class="text-xs text-muted-foreground">
        {{ t('filter.publisherHint') }}
      </span>
    </div>
    <button
      type="button"
      @click="$emit('clear')"
      class="text-xs font-medium text-brand hover:text-brand transition-colors hover:underline cursor-pointer"
    >
      {{ t('filter.clear') }}
    </button>
  </div>
</template>
