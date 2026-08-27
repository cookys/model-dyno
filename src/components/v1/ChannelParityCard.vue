<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { channelParityForModel, DIVERGENCE_PP, type ChannelParityVerdict } from '@/lib/channelParity'
import type { SweCell } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { GitCompareArrows } from 'lucide-vue-next'

const props = defineProps<{
  alias: string
  cells: SweCell[]
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const row = computed(() => channelParityForModel(props.cells, props.alias))

const visible = computed(
  () => row.value != null && row.value.spread >= DIVERGENCE_PP,
)

const verdictMeta: Record<ChannelParityVerdict, { emoji: string; zh: string; en: string }> = {
  consistent: { emoji: '🟢', zh: '各路線一致', en: 'routes agree' },
  'divergent-tools': { emoji: '🟠', zh: '低分路線疑似工具/上限問題', en: 'low route likely tool/cap issue' },
  'divergent-unexplained': { emoji: '🟡', zh: '路線差距大、原因未明', en: 'wide spread, investigate' },
  'tool-floored': { emoji: '🔴', zh: '一致但有路線被工具/上限壓住', en: 'agreement but tool-floored route' },
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`
</script>

<template>
  <Card v-if="visible && row" class="border-amber-500/30 bg-amber-500/5">
    <CardContent class="p-4 space-y-3">
      <h3 class="text-sm font-bold flex items-center gap-2">
        <GitCompareArrows class="h-4 w-4 text-amber-600" />
        {{ zh ? '路線檢查（同模型、不同接入）' : 'Route check (same model, different access)' }}
      </h3>
      <p class="text-xs text-muted-foreground leading-relaxed">
        {{ zh
          ? `此模型有 ${row.channels.length} 條可比路線，準確率差距 ${Math.round(row.spread * 100)}pp — 低分不一定代表模型能力。`
          : `This model has ${row.channels.length} comparable routes with a ${Math.round(row.spread * 100)}pp accuracy spread — a low route is not always capability.` }}
        <span class="font-semibold text-foreground">
          {{ verdictMeta[row.verdict].emoji }}
          {{ zh ? verdictMeta[row.verdict].zh : verdictMeta[row.verdict].en }}
        </span>
      </p>
      <table class="w-full text-xs font-mono">
        <thead class="text-muted-foreground">
          <tr>
            <th class="text-left py-1">{{ zh ? '路線' : 'Route' }}</th>
            <th class="text-right py-1">{{ zh ? '過題率' : 'Pass rate' }}</th>
            <th class="text-right py-1 hidden sm:table-cell">n</th>
            <th class="text-right py-1 hidden md:table-cell">noop/cap</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in row.channels" :key="c.access" class="border-t border-border/40">
            <td class="py-1.5">{{ c.access }}</td>
            <td class="py-1.5 text-right font-bold">{{ pct(c.acc) }}</td>
            <td class="py-1.5 text-right text-muted-foreground hidden sm:table-cell">{{ c.n }}</td>
            <td class="py-1.5 text-right text-muted-foreground hidden md:table-cell">
              <span v-if="c.noop_pct != null">{{ c.noop_pct }}% noop</span>
              <span v-if="c.cap_pct != null">{{ c.noop_pct != null ? ' · ' : '' }}{{ c.cap_pct }}% cap</span>
              <span v-if="c.noop_pct == null && c.cap_pct == null">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </CardContent>
  </Card>
</template>
