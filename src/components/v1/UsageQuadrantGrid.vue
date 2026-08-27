<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { usageQuadrantByBucket, usageQuadrantRows, type UsageBucket } from '@/lib/usageQuadrant'
import type { SweCell } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'

const props = defineProps<{ cells: SweCell[] }>()

const { locale, t } = useI18n()
const router = useRouter()
const zh = computed(() => locale.value === 'zh')

const buckets = computed(() => usageQuadrantByBucket(usageQuadrantRows(props.cells)))
const order: UsageBucket[] = ['allround', 'pair', 'background', 'lowacc']

const bucketMeta: Record<UsageBucket, { icon: string }> = {
  allround: { icon: '🏆' },
  pair: { icon: '🤝' },
  background: { icon: '🤖' },
  lowacc: { icon: '⚠' },
}

const goModel = (canonical: string) => router.push(`/v1/model/${encodeURIComponent(canonical)}`)
</script>

<template>
  <div class="grid sm:grid-cols-2 gap-3">
    <Card v-for="key in order" :key="key">
      <CardContent class="p-3 space-y-2">
        <div class="text-xs font-bold flex items-center gap-1.5">
          <span>{{ bucketMeta[key].icon }}</span>
          {{ t(`usage.${key}`) }}
          <span class="text-muted-foreground font-normal">({{ buckets[key].length }})</span>
        </div>
        <ul v-if="buckets[key].length" class="space-y-1">
          <li
            v-for="r in buckets[key].slice(0, 5)"
            :key="r.canonical + r.cell.cell"
            class="flex items-center justify-between gap-2 text-[11px] font-mono cursor-pointer hover:text-brand"
            @click="goModel(r.canonical)"
          >
            <span class="truncate">{{ r.canonical }}</span>
            <span class="shrink-0 text-muted-foreground">
              {{ Math.round(r.acc * 1000) / 10 }}% · n={{ r.nGraded }}
              <template v-if="r.solvedPerHour != null"> · {{ r.solvedPerHour.toFixed(1) }}/h</template>
            </span>
          </li>
        </ul>
        <p v-else class="text-[10px] text-muted-foreground">—</p>
      </CardContent>
    </Card>
  </div>
  <p class="text-[10px] text-muted-foreground pt-1">
    {{ zh
      ? '分類門檻與 v0 COMP 象限相同（acc×med_wall_pass）；每格最多列 5 個代表 cell，含 n。'
      : 'Same buckets as v0 COMP (acc × med_wall_pass); up to 5 example cells per quadrant with n shown.' }}
  </p>
</template>
