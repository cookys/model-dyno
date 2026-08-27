<script setup lang="ts">
import { ref, computed } from 'vue'
import { sweCellsByExam, modelRegistry, runConfigs } from '@/lib/store'
import { variantReceiptsForModel, launchRecipesForModel, type LaunchRecipe } from '@/lib/receipts'
import { useI18n } from '@/lib/i18n'
import { Check, Copy, Terminal, Cpu, HardDrive, ExternalLink } from 'lucide-vue-next'

const props = defineProps<{
  record: any
  modelName?: string
}>()

const { locale } = useI18n()
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const canonical = computed(() => {
  return props.record?.identity?.canonical_model || props.record?.model || props.modelName || ''
})

const receipts = computed(() =>
  variantReceiptsForModel(canonical.value, sweCellsByExam.value, modelRegistry.value),
)

const recipes = computed<LaunchRecipe[]>(() =>
  launchRecipesForModel(canonical.value, receipts.value, runConfigs.value),
)

const primaryRecipe = computed(() => recipes.value[0] ?? null)

const bestReceipt = computed(() => {
  const ranked = receipts.value
    .filter((r) => r.rankable)
    .sort((a, b) => (b.cell.headline ?? 0) - (a.cell.headline ?? 0))
  return ranked[0] ?? receipts.value[0] ?? null
})

const hfRepo = computed(() => bestReceipt.value?.registry?.hf_repo ?? null)

const configSummary = (c: LaunchRecipe['config']): string[] => {
  const parts: string[] = []
  if (c.engine) parts.push(`engine=${c.engine}`)
  if (c.ctx_size) parts.push(`ctx=${c.ctx_size}`)
  if (c.sampler_temp != null) parts.push(`temp=${c.sampler_temp}`)
  if (c.sampler_top_p != null) parts.push(`top_p=${c.sampler_top_p}`)
  if (c.split_mode) parts.push(`split=${c.split_mode}`)
  if (c.jinja) parts.push('--jinja')
  for (const m of c.methods) parts.push(m)
  return parts
}

const copyCommand = async () => {
  if (!primaryRecipe.value) return
  try {
    await navigator.clipboard.writeText(primaryRecipe.value.command)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy launch command:', err)
  }
}
</script>

<template>
  <div
    v-if="primaryRecipe || hfRepo"
    class="space-y-4 rounded-xl border border-border/80 bg-gradient-to-b from-card/90 to-card/50 p-4 shadow-sm"
  >
    <div class="flex items-center justify-between flex-wrap gap-2 border-b border-border/60 pb-3">
      <div class="flex items-center gap-2">
        <div class="h-6 w-6 rounded-md bg-brand/10 dark:bg-brand/20 text-brand flex items-center justify-center font-bold text-xs">
          ⚡
        </div>
        <h4 class="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
          {{ locale === 'zh' ? '可複現部署食譜（repo 實際配置）' : 'Reproducible Recipe (actual repo config)' }}
          <span class="text-[10px] font-mono font-normal text-muted-foreground">· {{ canonical }}</span>
        </h4>
      </div>

      <button
        v-if="primaryRecipe"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-all cursor-pointer"
        @click="copyCommand"
      >
        <component :is="copied ? Check : Copy" class="h-3.5 w-3.5" />
        <span>{{ copied ? (locale === 'zh' ? '已複製！' : 'Copied!') : (locale === 'zh' ? '複製啟動指令' : 'Copy launch command') }}</span>
      </button>
    </div>

    <!-- Weights provenance -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
      <div class="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1">
        <div class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <HardDrive class="h-3 w-3 text-emerald-500" />
          {{ locale === 'zh' ? '權重來源' : 'Weights source' }}
        </div>
        <div class="font-mono font-medium text-foreground truncate">
          <a v-if="hfRepo" :href="`https://huggingface.co/${hfRepo}`" target="_blank" class="hover:underline text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <ExternalLink class="h-3 w-3 shrink-0" />{{ hfRepo }}
          </a>
          <span v-else>—</span>
        </div>
      </div>
      <div class="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1">
        <div class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Cpu class="h-3 w-3 text-brand" />
          {{ locale === 'zh' ? '量化格式' : 'Quant' }}
        </div>
        <div class="font-mono font-medium text-foreground truncate">
          {{ bestReceipt?.registry?.quant ?? '—' }}
        </div>
      </div>
      <div class="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1">
        <div class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          💾 {{ locale === 'zh' ? '權重大小' : 'Weights size' }}
        </div>
        <div class="font-mono font-bold text-foreground">
          {{ bestReceipt?.registry?.weights_gb != null ? `${bestReceipt.registry.weights_gb} GB` : '—' }}
        </div>
      </div>
    </div>

    <!-- Launch command from the actual repo config -->
    <div v-if="primaryRecipe" class="relative rounded-lg border border-border/80 bg-zinc-950 dark:bg-black/80 overflow-hidden shadow-inner font-mono text-xs">
      <div class="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400">
        <div class="flex items-center gap-1.5">
          <Terminal class="h-3.5 w-3.5 text-brand" />
          <span>llm-playground</span>
        </div>
        <span class="text-[10px] text-zinc-500">configs/{{ primaryRecipe.config.tier ?? '?' }}/{{ primaryRecipe.config.config }}.toml</span>
      </div>
      <pre class="p-3 text-emerald-400 dark:text-emerald-300 leading-relaxed overflow-x-auto scrollbar-thin">{{ primaryRecipe.command }}</pre>
    </div>

    <!-- Resolved config fields (the actual TOML, not invented flags) -->
    <div v-if="primaryRecipe" class="flex items-center gap-1.5 flex-wrap">
      <span
        v-for="p in configSummary(primaryRecipe.config)"
        :key="p"
        class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground border border-border/50"
      >
        {{ p }}
      </span>
    </div>

    <div v-if="recipes.length > 1" class="text-[11px] text-muted-foreground font-mono">
      {{ locale === 'zh' ? '同模型其他配置：' : 'Other configs: ' }}
      <span v-for="(r, i) in recipes.slice(1, 5)" :key="r.config.config">
        {{ r.config.config }}<span v-if="i < Math.min(recipes.length - 1, 4) - 1">, </span>
      </span>
    </div>

    <p v-if="!primaryRecipe" class="text-[11px] text-muted-foreground italic">
      {{ locale === 'zh' ? '此模型在 repo 中沒有 launch config（可能是雲端模型或僅以外部引擎服務）。' : 'No launch config in the repo for this model (cloud model or served externally).' }}
    </p>
  </div>
</template>
