<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { sweCellsByExam, modelRegistry } from '@/lib/store'
import { variantReceiptsForModel, engineGroupsForModel, tiedWithBest, type AxisGroup } from '@/lib/receipts'
import { Cpu } from 'lucide-vue-next'

const props = defineProps<{
  model: string
}>()

const { locale } = useI18n()

const receipts = computed(() =>
  variantReceiptsForModel(props.model, sweCellsByExam.value, modelRegistry.value),
)

const groups = computed(() =>
  engineGroupsForModel(receipts.value.filter((r) => r.rankable)),
)

const bestGroup = computed(() => groups.value[0] ?? null)

const tieLabel = (g: AxisGroup) => {
  if (!bestGroup.value || g === bestGroup.value) return null
  return tiedWithBest(g, bestGroup.value)
    ? (locale.value === 'zh' ? '與最佳統計並列' : 'Statistically tied')
    : (locale.value === 'zh' ? 'CI 落後最佳' : 'Behind best (CI)')
}

const fmtDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—')
const fmtCi = (ci: [number, number] | undefined) =>
  ci ? `[${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%]` : ''
</script>

<template>
  <div v-if="groups.length >= 2" class="rounded-xl border border-border/80 bg-card p-4 space-y-4 shadow-sm">
    <div class="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <Cpu class="h-4 w-4 text-brand" />
        <h4 class="text-xs font-bold uppercase tracking-wider text-foreground">
          ⚙️ {{ locale === 'zh' ? '同模型跨推論引擎實測對照（同卷）' : 'Cross-Engine Comparison (same exam)' }}
        </h4>
      </div>
      <span class="text-[11px] font-mono text-muted-foreground">
        {{ groups.length }} {{ locale === 'zh' ? '種引擎有實測收據' : 'engines benched' }}
      </span>
    </div>

    <p class="text-[11px] text-muted-foreground leading-relaxed">
      {{ locale === 'zh'
        ? '注意：跨引擎列通常同時換了權重格式（GGUF vs NVFP4 vs EXL3），是「整組配方」的對照而不是純引擎變因。量化欄位就是提醒你這件事。標「(推定)」的引擎是由權重格式推斷（GGUF → llama.cpp 系）。'
        : 'Note: engine rows usually change weight format too (GGUF vs NVFP4 vs EXL3) — this compares full recipes, not the engine as an isolated variable. The quant column is there to remind you. "(inferred)" engines are deduced from the weight format (GGUF → llama.cpp family).'
      }}
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-border/60 bg-muted/20 text-muted-foreground font-mono text-[11px]">
          <tr>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '引擎' : 'Engine' }}</th>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '權重量化' : 'Quant' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? 'SWE 過件 (95% CI)' : 'SWE Score (95% CI)' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? '生成速度' : 'Agentic t/s' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? '解題中位' : 'Median wall' }}</th>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '收據出處' : 'Receipt' }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/40 font-mono">
          <tr
            v-for="g in groups"
            :key="g.key"
            :class="['hover:bg-muted/30 transition-colors', g === bestGroup ? 'bg-brand/5' : '']"
          >
            <td class="px-3 py-3">
              <div class="flex items-center gap-1.5 flex-wrap">
                <strong class="text-foreground text-xs">{{ g.key }}</strong>
                <span v-if="g.best.axes.engineInferred" class="text-[10px] text-muted-foreground">
                  {{ locale === 'zh' ? '(推定)' : '(inferred)' }}
                </span>
                <span v-if="tieLabel(g)" class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
                  {{ tieLabel(g) }}
                </span>
              </div>
            </td>
            <td class="px-3 py-3 text-emerald-600 dark:text-emerald-400 text-[11px]">
              {{ g.best.registry?.quant ?? '—' }}
            </td>
            <td class="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs">
              {{ g.best.cell.n_passed }}/{{ g.best.cell.n_graded }}
              <span class="block text-[10px] font-normal text-muted-foreground">{{ fmtCi(g.best.cell.headline_ci) }}</span>
            </td>
            <td class="px-3 py-3 text-right text-brand font-bold">
              {{ g.best.cell.agentic_tok_s != null ? `${g.best.cell.agentic_tok_s.toFixed(1)} t/s` : '—' }}
            </td>
            <td class="px-3 py-3 text-right text-foreground">
              {{ g.best.cell.med_wall != null ? `${Math.round(g.best.cell.med_wall)}s` : '—' }}
            </td>
            <td class="px-3 py-3 text-[10px] text-muted-foreground">
              <span class="block break-all" :title="g.best.cell.cell ?? undefined">{{ g.best.cell.cell ?? '—' }}</span>
              <span class="block">{{ g.best.cell.machine ?? '' }} · {{ fmtDate(g.best.cell.scored_at) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
