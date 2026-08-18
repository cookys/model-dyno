<script setup lang="ts">
// The routes behind a folded row.
//
// The row shows ONE of them — accuracy-first by default, speed-first once the reader
// ranks by a speed column. That keeps the headline honest but hides the spread, and on
// this board the spread is usually the point: the same weights served two ways differ
// by 2x in solve time, and the same engine at two sampling settings by 17 points of
// accuracy. This is where that lives.
//
// Config is shown as COLUMNS from the validated tag vocabulary
// (benchmarks/swe-personal/eval-tags.toml), never as the cell slug. Those tags are
// derived from each run's own recorded request, so they say what happened rather than
// what a filename implies.
import { useI18n } from '@/lib/i18n'
import { num } from '@/components/CellHelpers'

const { t } = useI18n()
defineProps<{ row: any }>()

const fmt = (v: any, digits = 1) => (num(v) === null ? '—' : Number(v).toFixed(digits))
// Thinking-on and spec-decode are badged because on this fleet they are the two knobs
// that actually moved the numbers; everything else reads fine as plain text.
const thinkClass = (v: string) =>
  v === 'on' ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'
const specClass = (v: string) =>
  v && v !== 'none' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
</script>

<template>
  <div v-if="row.variantCount > 0" class="space-y-2">
    <div>
      <div class="text-xs font-semibold text-foreground">{{ t('fold.variants.title') }}</div>
      <p class="text-[11px] text-muted-foreground">{{ t('fold.variants.explainer') }}</p>
    </div>

    <div class="hidden overflow-x-auto rounded-md border border-border/60 bg-card md:block">
      <table class="w-full text-left text-[11px]">
        <thead class="border-b border-border/60 text-muted-foreground">
          <tr>
            <th class="px-2 py-1.5 font-semibold">{{ t('tag.thinking') }}</th>
            <th class="px-2 py-1.5 font-semibold">{{ t('tag.effort') }}</th>
            <th class="px-2 py-1.5 font-semibold">{{ t('tag.temp') }}</th>
            <th class="px-2 py-1.5 font-semibold">{{ t('tag.draft') }}</th>
            <th class="px-2 py-1.5 font-semibold">{{ t('tag.engine') }}</th>
            <th class="px-2 py-1.5 font-semibold">{{ t('col.machineSwe') }}</th>
            <th class="px-2 py-1.5 text-right font-semibold">n</th>
            <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.passRateCI') }}</th>
            <th class="px-2 py-1.5 text-right font-semibold">{{ t('cloud.col.solve') }}</th>
            <th class="px-2 py-1.5 text-right font-semibold">{{ t('col.solveSpeed') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in row.variants" :key="v.cell" :class="v.isRepresentative ? 'bg-primary/5 font-medium' : ''">
            <td class="px-2 py-1.5">
              <span :class="['inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px]', thinkClass(v.tags.thinking)]">
                {{ v.tags.thinking || '—' }}
              </span>
              <span v-if="v.isRepresentative" class="ml-1 text-[10px] text-primary">&#9664;</span>
            </td>
            <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ v.tags.effort || '—' }}</td>
            <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ v.tags.temp || '—' }}</td>
            <td class="px-2 py-1.5">
              <span :class="['inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px]', specClass(v.tags.draft)]">
                {{ v.tags.draft || '—' }}<template v-if="v.tags.draft_n && v.tags.draft_n !== 'n/a'">·{{ v.tags.draft_n }}</template>
              </span>
            </td>
            <td class="px-2 py-1.5 font-mono text-muted-foreground">{{ v.tags.engine || '—' }}</td>
            <td class="px-2 py-1.5 font-mono text-muted-foreground">
              {{ v.machine }}
              <span v-if="v.tags.variant" class="ml-1 rounded bg-muted px-1 text-[10px]">{{ v.tags.variant }}</span>
            </td>
            <td class="px-2 py-1.5 text-right font-mono">{{ v.n ?? '—' }}</td>
            <td class="px-2 py-1.5 text-right font-mono">{{ v.acc }}</td>
            <td class="px-2 py-1.5 text-right font-mono">{{ fmt(v.perMin, 2) }}</td>
            <td class="px-2 py-1.5 text-right font-mono">{{ fmt(v.sec, 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid grid-cols-1 gap-2 md:hidden">
      <div
        v-for="v in row.variants"
        :key="`${v.cell}-card`"
        :class="['rounded-md border border-border/60 bg-card p-2.5 text-xs', v.isRepresentative ? 'ring-1 ring-primary/40' : '']"
      >
        <div class="flex flex-wrap gap-1">
          <span :class="['rounded px-1.5 py-0.5 font-mono text-[10px]', thinkClass(v.tags.thinking)]">{{ t('tag.thinking') }} {{ v.tags.thinking || '—' }}</span>
          <span :class="['rounded px-1.5 py-0.5 font-mono text-[10px]', specClass(v.tags.draft)]">{{ v.tags.draft || '—' }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">t={{ v.tags.temp || '—' }}</span>
          <span v-if="v.tags.effort && v.tags.effort !== 'n/a'" class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{{ v.tags.effort }}</span>
        </div>
        <div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{{ t('col.passRateCI') }}</span><span class="text-right font-mono text-foreground">{{ v.acc }} ({{ v.n ?? '—' }})</span>
          <span>{{ t('col.solveSpeed') }}</span><span class="text-right font-mono text-foreground">{{ fmt(v.sec, 0) }}</span>
        </div>
      </div>
    </div>
  </div>
  <p v-else class="text-[11px] text-muted-foreground">{{ t('fold.variants.none') }}</p>
</template>
