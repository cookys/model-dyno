<script setup lang="ts">
/**
 * Renders controlled single-variable pairs grouped by axis. Each card is one
 * real experiment: same model, same everything, ONE axis differs. Both cell
 * receipts are named so any number can be traced, and the flip diff shows
 * WHICH tasks changed verdict — the content behind a "±N tasks" delta.
 */
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { taskDomains } from '@/lib/store'
import { AXIS_LABELS, type MatchedPair, type PairAxis } from '@/lib/matchedPairs'
import { flipDiff, type FlipDiff } from '@/lib/taskMatrix'
import ScorePill from '@/components/v1/ScorePill.vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  pairs: MatchedPair[]
  /** Show the canonical model name on each card (for the cross-model view). */
  showModel?: boolean
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const flipOf = (p: MatchedPair): FlipDiff | null =>
  flipDiff(p.a.cell, p.b.cell, taskDomains.value)

const grouped = computed(() => {
  const m = new Map<PairAxis, MatchedPair[]>()
  for (const p of props.pairs) {
    const arr = m.get(p.axis) ?? []
    arr.push(p)
    m.set(p.axis, arr)
  }
  return Array.from(m.entries())
})

const modelOf = (p: MatchedPair) =>
  p.a.cell.identity?.canonical_model ?? p.a.cell.model

const tok = (v: number | undefined) => (v != null ? `${v.toFixed(1)}` : '—')
const dateOf = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—')

const verdictText = (p: MatchedPair) => {
  if (p.deltaPassed === 0) {
    return zh.value ? '成績相同' : 'Same score'
  }
  if (p.withinNoise === true) {
    return zh.value
      ? `差 ${p.deltaPassed} 題（波動範圍內）`
      : `${p.deltaPassed}-task gap (within noise)`
  }
  if (p.withinNoise === false) {
    return zh.value
      ? `差 ${p.deltaPassed} 題（超出波動範圍 — 真差距）`
      : `${p.deltaPassed}-task gap (beyond noise — real)`
  }
  return zh.value ? `差 ${p.deltaPassed} 題` : `${p.deltaPassed}-task gap`
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="[axis, list] in grouped" :key="axis" class="space-y-2">
      <div class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {{ zh ? AXIS_LABELS[axis].zh : AXIS_LABELS[axis].en }}
        <span class="font-mono font-normal">({{ list.length }})</span>
      </div>
      <div
        v-for="(p, i) in list"
        :key="`${axis}-${i}`"
        class="rounded-lg border border-border bg-card p-3 space-y-2"
      >
        <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            <span v-if="showModel" class="font-mono font-bold">{{ modelOf(p) }}</span>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold border"
              :class="p.withinNoise === false
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                : 'border-border bg-muted/50 text-muted-foreground'"
            >
              {{ verdictText(p) }}
            </span>
          </div>
          <span class="text-[10px] font-mono text-muted-foreground">{{ dateOf(p.a.cell.scored_at) }} · {{ p.a.cell.machine ?? '—' }}</span>
        </div>

        <div class="grid sm:grid-cols-2 gap-2">
          <div
            v-for="side in [
              { v: p.aValue, r: p.a },
              { v: p.bValue, r: p.b },
            ]"
            :key="side.v + (side.r.cell.cell ?? '')"
            class="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
            :title="side.r.cell.cell"
          >
            <div class="min-w-0">
              <div class="font-mono text-xs font-bold truncate">{{ side.v }}</div>
              <div class="text-[10px] text-muted-foreground font-mono">
                {{ tok(side.r.cell.agentic_tok_s) }} tok/s
                <span v-if="side.r.cell.run_role && side.r.cell.run_role !== 'vendor-settings'"> · 🧪 {{ side.r.cell.run_role }}</span>
              </div>
            </div>
            <ScorePill
              :passed="side.r.cell.n_passed"
              :total="side.r.cell.n_graded"
              :ci="side.r.cell.headline_ci ?? null"
              compact
            />
          </div>
        </div>

        <!-- Flip diff: the exact tasks behind the delta -->
        <details v-if="p.deltaPassed > 0 && flipOf(p)" class="group/flip">
          <summary class="flex items-center gap-1 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
            <ChevronDown class="h-3 w-3 transition-transform group-open/flip:rotate-180" />
            {{ zh ? '差在哪幾題？' : 'Which tasks flipped?' }}
          </summary>
          <div class="mt-1.5 space-y-1 text-[11px] font-mono">
            <template v-if="flipOf(p)">
              <div
                v-for="f in flipOf(p)!.aOnly"
                :key="'a' + f.taskId"
                class="flex items-center gap-2"
              >
                <span class="text-emerald-600 dark:text-emerald-400 shrink-0">{{ p.aValue }} ✓</span>
                <span class="text-muted-foreground truncate">{{ f.taskId }}</span>
                <span v-if="f.domain" class="rounded-full border border-border bg-muted/50 px-1.5 text-[10px] shrink-0">{{ f.domain }}</span>
                <span v-if="f.bVerdict === 'ERROR'" class="text-rose-500 text-[10px] shrink-0">{{ zh ? '對方 ERROR' : 'other ERROR' }}</span>
              </div>
              <div
                v-for="f in flipOf(p)!.bOnly"
                :key="'b' + f.taskId"
                class="flex items-center gap-2"
              >
                <span class="text-sky-600 dark:text-sky-400 shrink-0">{{ p.bValue }} ✓</span>
                <span class="text-muted-foreground truncate">{{ f.taskId }}</span>
                <span v-if="f.domain" class="rounded-full border border-border bg-muted/50 px-1.5 text-[10px] shrink-0">{{ f.domain }}</span>
                <span v-if="f.aVerdict === 'ERROR'" class="text-rose-500 text-[10px] shrink-0">{{ zh ? '對方 ERROR' : 'other ERROR' }}</span>
              </div>
              <div class="text-muted-foreground">
                {{ zh
                  ? `其餘 ${flipOf(p)!.bothPass} 題兩邊都過、${flipOf(p)!.neitherPass} 題兩邊都沒過。`
                  : `${flipOf(p)!.bothPass} tasks both solve; ${flipOf(p)!.neitherPass} neither solves.` }}
              </div>
            </template>
          </div>
        </details>
      </div>
    </div>
    <p v-if="!pairs.length" class="text-xs text-muted-foreground">
      {{ zh ? '目前沒有可配對的單一變因實驗。' : 'No single-variable pairs available yet.' }}
    </p>
  </div>
</template>
