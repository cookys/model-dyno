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
import { computed, ref } from 'vue'
import { useI18n } from '@/lib/i18n'
import { num } from '@/components/CellHelpers'
import { sortVariants, type VariantSortDir } from '@/lib/variantSort'

const { t } = useI18n()
const props = defineProps<{ row: any }>()

// Header-driven ordering, owned here rather than by the view that builds the rows —
// the default below is the same "fastest first" the view used to hard-code.
type VariantCol = { key: string; label: string; num?: boolean; sortVal: (v: any) => unknown }
// computed, not a const: labels come from t() and must re-render on a language switch.
const columns = computed<VariantCol[]>(() => [
  { key: 'thinking', label: t('tag.thinking'), sortVal: (v) => v.tags.thinking },
  { key: 'effort', label: t('tag.effort'), sortVal: (v) => v.tags.effort },
  { key: 'temp', label: t('tag.temp'), sortVal: (v) => v.tags.temp },
  { key: 'draft', label: t('tag.draft'), sortVal: (v) => v.tags.draft },
  { key: 'engine', label: t('tag.engine'), sortVal: (v) => v.tags.engine },
  { key: 'machine', label: t('col.machineSwe'), sortVal: (v) => v.machine },
  { key: 'n', label: 'n', num: true, sortVal: (v) => v.n },
  // Ranking on a pass rate only compares like with like: a variant that ran a
  // partial exam returns null here, which the shared comparator sinks to the
  // bottom in both directions. It is still shown, just never ranked against a
  // full run it did not sit.
  { key: 'acc', label: t('col.passRateCI'), num: true, sortVal: (v) => (v.accComparable ? v.accRaw : null) },
  { key: 'perMin', label: t('cloud.col.solve'), num: true, sortVal: (v) => v.perMin },
  { key: 'sec', label: t('col.solveSpeed'), num: true, sortVal: (v) => v.sec },
])

const sortKey = ref<string | null>('perMin')
// Numeric columns open descending (best first); text columns A→Z.
const sortDir = ref<VariantSortDir>('desc')

const toggleSort = (col: VariantCol) => {
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = col.key
    sortDir.value = col.num ? 'desc' : 'asc'
  }
}

const sortedVariants = computed(() => {
  const col = columns.value.find((c) => c.key === sortKey.value)
  return sortVariants(props.row.variants || [], col ? col.sortVal : null, sortDir.value)
})

const sortArrow = (key: string) => (sortKey.value !== key ? '' : sortDir.value === 'asc' ? '\u2191' : '\u2193')

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
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              :class="['px-2 py-1.5 font-semibold', col.num ? 'text-right' : 'text-left']"
            >
              <button
                type="button"
                :class="['inline-flex items-center gap-0.5 hover:text-foreground', sortKey === col.key ? 'text-foreground' : '']"
                @click="toggleSort(col)"
              >
                {{ col.label }}<span class="font-mono">{{ sortArrow(col.key) }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in sortedVariants" :key="v.cell" :class="v.isRepresentative ? 'bg-primary/5 font-medium' : ''">
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
            <td class="px-2 py-1.5 text-right font-mono">
              <span :class="v.accComparable ? '' : 'text-muted-foreground'" :title="v.accComparable ? undefined : t('fold.variants.partialAcc')">
                {{ v.acc }}<template v-if="!v.accComparable">*</template>
              </span>
            </td>
            <td class="px-2 py-1.5 text-right font-mono">{{ fmt(v.perMin, 2) }}</td>
            <td class="px-2 py-1.5 text-right font-mono">{{ fmt(v.sec, 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid grid-cols-1 gap-2 md:hidden">
      <div
        v-for="v in sortedVariants"
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
