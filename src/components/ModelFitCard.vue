<script setup lang="ts">
// "Will this run on my box?" — the first question a home reader has, and the one the
// board could not answer at all: it published tok/s and pass rates but never how big the
// weights are or how much memory any of these machines has.
//
// Everything here is a lookup or a subtraction over already-published facts
// (models/registry weight size, profiles hardware). Nothing is measured, and the card
// says so: weights are a floor, not a working set — KV cache and compute buffers want
// the same memory, and a model that fits on paper can still fail to run at a useful
// context. That is why the middle verdict exists.
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { machines } from '@/lib/store'
import { footprintByAlias, fitVerdict } from '@/lib/hardware'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const props = defineProps<{ alias: string }>()
const { t } = useI18n()

const footprint = computed(() => footprintByAlias.value.get(props.alias))

const rows = computed(() => {
  const w = footprint.value?.weights_gb
  if (!w) return []
  // One row per distinct memory size in the fleet, plus the cards people actually own.
  const fleet = machines.value
    .filter((m) => m.vram_usable_gb)
    .map((m) => ({ label: `${m.gpu_name ?? m.profile} · ${m.vram_usable_gb}GB`, gb: m.vram_usable_gb as number }))
  const common = [12, 16, 24, 32, 48].map((gb) => ({ label: `${gb}GB`, gb }))
  const seen = new Set<number>()
  return [...common, ...fleet]
    .filter((r) => (seen.has(r.gb) ? false : (seen.add(r.gb), true)))
    .sort((a, b) => a.gb - b.gb)
    .map((r) => ({ ...r, verdict: fitVerdict(w, r.gb), headroom: +(r.gb - w).toFixed(1) }))
})

const cls = (v: string) =>
  v === 'fits' ? 'text-emerald-700 dark:text-emerald-400'
  : v === 'tight' ? 'text-amber-700 dark:text-amber-400'
  : 'text-muted-foreground'
</script>

<template>
  <Card v-if="footprint" class="border-border bg-card shadow-lg">
    <CardHeader class="pb-2">
      <CardTitle class="text-base font-semibold flex items-center gap-2">
        <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
        {{ t('fit.card.title') }}
      </CardTitle>
      <p class="text-xs text-muted-foreground">{{ t('fit.estimate') }}</p>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div><span class="text-muted-foreground">{{ t('col.weights') }}</span>
          <div class="font-mono text-sm text-foreground">{{ footprint.weights_gb ?? '—' }} GB</div></div>
        <div><span class="text-muted-foreground">{{ t('col.params') }}</span>
          <div class="font-mono text-sm text-foreground">
            {{ footprint.params_total_b ? `${footprint.params_total_b}B` : '—' }}<template
              v-if="footprint.params_active_b && footprint.params_active_b !== footprint.params_total_b"> (A{{ footprint.params_active_b }}B)</template>
          </div></div>
        <div><span class="text-muted-foreground">{{ t('col.ctxMax') }}</span>
          <div class="font-mono text-sm text-foreground">
            {{ footprint.context_max ? `${Math.round(footprint.context_max / 1024)}K` : '—' }}</div></div>
        <div><span class="text-muted-foreground">{{ t('col.quant') }}</span>
          <div class="font-mono text-sm text-foreground">{{ footprint.quant ?? '—' }}</div></div>
      </div>

      <a v-if="footprint.hf_repo" :href="`https://huggingface.co/${footprint.hf_repo}`"
         target="_blank" rel="noopener"
         class="inline-block font-mono text-xs text-primary hover:underline">{{ footprint.hf_repo }} ↗</a>

      <div v-if="rows.length" class="overflow-x-auto rounded-md border border-border/60">
        <table class="w-full text-left text-[11px]">
          <thead class="border-b border-border/60 text-muted-foreground">
            <tr>
              <th class="px-2 py-1.5 font-semibold">{{ t('fit.card.card') }}</th>
              <th class="px-2 py-1.5 text-right font-semibold">{{ t('fit.card.headroom') }}</th>
              <th class="px-2 py-1.5 font-semibold">{{ t('fit.card.verdict') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.label">
              <td class="px-2 py-1.5 font-mono">{{ r.label }}</td>
              <td class="px-2 py-1.5 text-right font-mono" :class="cls(r.verdict)">
                {{ r.headroom >= 0 ? '+' : '' }}{{ r.headroom }} GB</td>
              <td class="px-2 py-1.5 font-medium" :class="cls(r.verdict)">{{ t(`fit.${r.verdict}`) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
</template>
