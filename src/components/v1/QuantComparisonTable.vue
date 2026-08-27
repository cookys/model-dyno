<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { sweCellsByExam, modelRegistry } from '@/lib/store'
import { variantReceiptsForModel, quantGroupsForModel, tiedWithBest, type AxisGroup } from '@/lib/receipts'
import { HardDrive } from 'lucide-vue-next'

const props = defineProps<{
  model: string
}>()

const { locale } = useI18n()

const receipts = computed(() =>
  variantReceiptsForModel(props.model, sweCellsByExam.value, modelRegistry.value),
)

// Only rankable capability cells enter the quant comparison — A/B legs & partials stay out.
const groups = computed(() =>
  quantGroupsForModel(receipts.value.filter((r) => r.rankable)),
)

const bestGroup = computed(() => groups.value[0] ?? null)

const tieBadge = (g: AxisGroup) => {
  if (!bestGroup.value) return null
  if (g === bestGroup.value) {
    return {
      label: locale.value === 'zh' ? '⭐ 本卷最佳' : '⭐ Best on exam',
      cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    }
  }
  if (tiedWithBest(g, bestGroup.value)) {
    return {
      label: locale.value === 'zh' ? '與最佳統計並列' : 'Statistically tied',
      cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    }
  }
  return {
    label: locale.value === 'zh' ? 'CI 落後最佳' : 'Behind best (CI)',
    cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  }
}

const fmtDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '—')
const fmtCi = (ci: [number, number] | undefined) =>
  ci ? `[${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%]` : ''
</script>

<template>
  <div v-if="groups.length >= 2" class="rounded-xl border border-border/80 bg-card p-4 space-y-4 shadow-sm">
    <div class="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <HardDrive class="h-4 w-4 text-brand" />
        <h4 class="text-xs font-bold uppercase tracking-wider text-foreground">
          📦 {{ locale === 'zh' ? '同模型量化格式實測對照（同卷）' : 'Quantization Comparison (same exam)' }}
        </h4>
      </div>
      <span class="text-[11px] font-mono text-muted-foreground">
        {{ groups.length }} {{ locale === 'zh' ? '種量化有實測收據' : 'quant formats benched' }}
      </span>
    </div>

    <p class="text-[11px] text-muted-foreground leading-relaxed">
      {{ locale === 'zh'
        ? '⚠ 相同量化標籤不代表相同條件：不同出版者的同名量化，保留 8-bit 的層可能不同。每列都標明出版者與 cell 出處，判「並列/落後」看的是 95% Wilson CI 重疊，不是點估計。'
        : '⚠ A shared quant label is not a shared condition: two publishers\' same-named quants can differ in which layers stay 8-bit. Each row carries its publisher and source cell; tied/behind is judged by 95% Wilson CI overlap, not point estimates.'
      }}
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-border/60 bg-muted/20 text-muted-foreground font-mono text-[11px]">
          <tr>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '量化格式' : 'Format' }}</th>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '出版者' : 'Publisher' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? '權重大小' : 'Weights' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? 'SWE 過件 (95% CI)' : 'SWE Score (95% CI)' }}</th>
            <th class="px-3 py-2 font-semibold text-right">{{ locale === 'zh' ? '生成速度' : 'Agentic t/s' }}</th>
            <th class="px-3 py-2 font-semibold">{{ locale === 'zh' ? '收據出處' : 'Receipt' }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border/40 font-mono">
          <tr
            v-for="g in groups"
            :key="g.key"
            :class="['hover:bg-muted/30 transition-colors', g === bestGroup ? 'bg-emerald-500/5' : '']"
          >
            <td class="px-3 py-3">
              <div class="flex items-center gap-1.5 flex-wrap">
                <strong class="text-foreground text-xs">{{ g.key }}</strong>
                <span v-if="tieBadge(g)" :class="['rounded px-1.5 py-0.5 text-[10px] font-bold border', tieBadge(g)!.cls]">
                  {{ tieBadge(g)!.label }}
                </span>
              </div>
            </td>
            <td class="px-3 py-3 text-muted-foreground text-[11px]">
              <a
                v-if="g.best.registry?.hf_repo"
                :href="`https://huggingface.co/${g.best.registry.hf_repo}`"
                target="_blank"
                class="text-brand hover:underline"
              >{{ g.best.publisher ?? g.best.registry.hf_repo }}</a>
              <span v-else>—</span>
            </td>
            <td class="px-3 py-3 text-right text-foreground">
              {{ g.best.registry?.weights_gb != null ? `${g.best.registry.weights_gb} GB` : '—' }}
            </td>
            <td class="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 text-xs">
              {{ g.best.cell.n_passed }}/{{ g.best.cell.n_graded }}
              <span class="block text-[10px] font-normal text-muted-foreground">{{ fmtCi(g.best.cell.headline_ci) }}</span>
            </td>
            <td class="px-3 py-3 text-right text-brand font-bold">
              {{ g.best.cell.agentic_tok_s != null ? `${g.best.cell.agentic_tok_s.toFixed(1)} t/s` : '—' }}
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
