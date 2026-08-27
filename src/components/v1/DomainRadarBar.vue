<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardDomainIndex } from '@/lib/store'
import { domainScoresForModel, domainLabel } from '@/lib/domainBreakdown'

const props = defineProps<{
  models: string[]
}>()

const { locale } = useI18n()

const profiles = computed(() =>
  props.models
    .map((m) => ({ model: m, scores: domainScoresForModel(m, dashboardDomainIndex.value) }))
    .filter((p) => p.scores.length > 0),
)

const domains = computed(() => {
  const ids = new Set<string>()
  for (const p of profiles.value) for (const s of p.scores) ids.add(s.domainId)
  return Array.from(ids).sort().map((id) => ({
    id,
    label: domainLabel(id),
    scores: profiles.value.map((p) => ({
      model: p.model,
      score: p.scores.find((s) => s.domainId === id) ?? null,
    })),
  }))
})
</script>

<template>
  <div v-if="profiles.length" class="rounded-xl border border-border/80 bg-card p-4 space-y-4 shadow-sm">
    <div class="flex items-center justify-between border-b border-border/60 pb-3">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-foreground">
          📊 {{ locale === 'zh' ? '領域分項實測（逐題判定聚合）' : 'Domain Breakdown (aggregated per-task verdicts)' }}
        </span>
      </div>
      <span class="text-[11px] text-muted-foreground font-mono">{{ profiles.length }} {{ locale === 'zh' ? '隻模型有分項數據' : 'models with domain data' }}</span>
    </div>

    <p class="text-[11px] text-muted-foreground leading-relaxed">
      {{ locale === 'zh'
        ? '每格分母是該領域的實際題數（小分母波動大，請看括號內的 n）。分項來自真實逐題 PASS/FAIL 判定，不是主觀評分。'
        : 'Denominators are actual task counts per domain (small n = noisy; read the parentheses). Derived from real per-task PASS/FAIL verdicts, not subjective ratings.'
      }}
    </p>

    <div class="space-y-3.5">
      <div
        v-for="domain in domains"
        :key="domain.id"
        class="space-y-1.5 rounded-lg bg-muted/20 p-2.5 border border-border/40"
      >
        <div class="flex items-center justify-between text-xs font-semibold text-foreground">
          <span>{{ locale === 'zh' ? domain.label.zh : domain.label.en }}</span>
        </div>

        <div class="space-y-1.5 pt-1">
          <div
            v-for="s in domain.scores"
            :key="s.model"
            class="flex items-center gap-2 text-xs"
          >
            <span class="w-32 truncate font-mono text-[11px] text-muted-foreground" :title="s.model">
              {{ s.model }}
            </span>

            <div class="relative flex-1 h-3 rounded-full bg-muted overflow-hidden border border-border/40">
              <div
                v-if="s.score && s.score.passRate != null"
                class="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-brand to-emerald-500 rounded-full transition-all duration-300"
                :style="{ width: `${Math.round(s.score.passRate * 100)}%` }"
              ></div>
            </div>

            <span class="w-20 text-right font-mono font-bold text-foreground text-[11px]">
              <template v-if="s.score && s.score.passRate != null">
                {{ Math.round(s.score.passRate * 100) }}% <span class="text-[10px] font-normal text-muted-foreground">({{ s.score.passed }}/{{ s.score.total }})</span>
              </template>
              <template v-else>—</template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
