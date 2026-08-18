<script setup lang="ts">
// The "hardware like mine" control. Shared so the heatmap and the leaderboard cannot
// drift into two different ideas of what 24GB means.
import { useI18n } from '@/lib/i18n'
import { VRAM_BUCKETS, useVramFilter } from '@/lib/useVramFilter'

const { t } = useI18n()
const { selectedVram, setVram } = useVramFilter()
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs">
    <span class="text-muted-foreground">{{ t('vram.filter.label') }}</span>
    <button
      v-for="gb in VRAM_BUCKETS"
      :key="gb"
      type="button"
      :class="[
        'rounded-full border px-2.5 py-0.5 font-mono transition-colors',
        selectedVram === gb
          ? 'border-primary bg-primary/10 text-foreground font-semibold'
          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
      ]"
      @click="setVram(gb)"
    >
      {{ gb === 0 ? t('vram.filter.any') : `≤${gb}GB` }}
    </button>
    <span v-if="selectedVram" class="text-[11px] text-muted-foreground">{{ t('vram.filter.hint') }}</span>
  </div>
</template>
