<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { sweCellsByExam, modelRegistry } from '@/lib/store'
import { lineageEntriesForModel, getModTypeBadge } from '@/lib/receipts'
import { GitFork, ExternalLink } from 'lucide-vue-next'

const props = defineProps<{
  model: string
}>()

const { locale } = useI18n()

const entries = computed(() =>
  lineageEntriesForModel(props.model, sweCellsByExam.value, modelRegistry.value),
)

const family = computed(() => entries.value[0]?.registry.family ?? null)

const fmtScore = (e: (typeof entries.value)[number]) => {
  const c = e.bestReceipt?.cell
  if (!c || c.n_passed == null || c.n_graded == null) return null
  return `${c.n_passed}/${c.n_graded}`
}
</script>

<template>
  <div v-if="entries.length" class="rounded-xl border border-border/80 bg-card p-4 space-y-4 shadow-sm">
    <div class="flex items-center justify-between border-b border-border/60 pb-3">
      <div class="flex items-center gap-2">
        <GitFork class="h-4 w-4 text-brand" />
        <h4 class="text-xs font-bold uppercase tracking-wider text-foreground">
          🧬 {{ locale === 'zh' ? '同家族權重譜系（registry 實錄）' : 'Weight Family Lineage (from registry)' }}
        </h4>
      </div>
      <span class="text-[11px] font-mono text-muted-foreground">
        {{ locale === 'zh' ? '家族' : 'Family' }}: {{ family ?? '—' }} · {{ entries.length }} checkpoints
      </span>
    </div>

    <p class="text-[11px] text-muted-foreground leading-relaxed">
      {{ locale === 'zh'
        ? '此清單直接來自 fleet 的模型 registry：同一底模的官方、去審查、草稿與 MTP 變體，含出版者與權重大小。標「未實測」代表 registry 收錄但本卷尚無成績——不是零分。'
        : 'Sourced directly from the fleet model registry: official, abliterated, draft and MTP checkpoints of the same base, with publisher and weight size. "Not benched" means no score on the current exam — not a zero.'
      }}
    </p>

    <div class="space-y-3 relative before:absolute before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-border/60">
      <div
        v-for="entry in entries"
        :key="entry.registry.alias"
        class="relative pl-9"
      >
        <div class="absolute left-2.5 top-3.5 -translate-x-1/2 h-3 w-3 rounded-full border-2 border-background bg-brand shadow-sm"></div>

        <div class="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5 hover:border-brand/40 transition-colors">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <span class="font-bold text-xs font-mono text-foreground break-all">{{ entry.registry.alias }}</span>
            <span :class="['rounded px-1.5 py-0.5 text-[10px] font-medium border font-mono', getModTypeBadge(entry.modType, locale as any).colorClass]">
              {{ getModTypeBadge(entry.modType, locale as any).label }}
            </span>
          </div>
          <div class="flex items-center gap-3 flex-wrap text-[11px] font-mono text-muted-foreground">
            <span v-if="entry.publisher">📦 {{ entry.publisher }}</span>
            <span v-if="entry.registry.quant">{{ entry.registry.quant }}</span>
            <span v-if="entry.registry.weights_gb != null">{{ entry.registry.weights_gb }} GB</span>
            <span v-if="entry.registry.params_total_b != null">{{ entry.registry.params_total_b }}B</span>
            <a
              v-if="entry.registry.hf_repo"
              :href="`https://huggingface.co/${entry.registry.hf_repo}`"
              target="_blank"
              class="inline-flex items-center gap-0.5 text-brand hover:underline"
            >
              <ExternalLink class="h-3 w-3" />
              {{ entry.registry.hf_repo }}
            </a>
            <span
              v-if="entry.benched && fmtScore(entry)"
              class="ml-auto font-bold text-emerald-600 dark:text-emerald-400"
              :title="entry.bestReceipt?.cell.cell ?? undefined"
            >
              {{ fmtScore(entry) }}
            </span>
            <span v-else-if="!entry.benched" class="ml-auto text-muted-foreground/70 italic">
              {{ locale === 'zh' ? '未實測' : 'Not benched' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
