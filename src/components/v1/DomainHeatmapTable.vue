<script setup lang="ts">
/**
 * CSS table heatmap — v1 port of SweByDomain without Vega.
 * Complete runs only (n ≥ comparable_min); partial rows dimmed in footer.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { dashboardDomainIndex } from '@/lib/store'
import { domainLabel } from '@/lib/domainBreakdown'
import { Card, CardContent } from '@/components/ui/card'

const DOMAIN_ORDER = [
  'backend', 'frontend', 'tui', 'cli', 'api', 'data', 'infra', 'devops', 'tests', 'docs', '_unknown',
]

const { locale } = useI18n()
const router = useRouter()
const zh = computed(() => locale.value === 'zh')

const index = computed(() => dashboardDomainIndex.value)
const comparableMin = computed(() => index.value?.comparable_min ?? 30)

const domains = computed(() => {
  const raw = index.value?.domains ?? []
  return [...raw].sort((a, b) => {
    const ra = DOMAIN_ORDER.indexOf(a)
    const rb = DOMAIN_ORDER.indexOf(b)
    const ia = ra === -1 ? DOMAIN_ORDER.length : ra
    const ib = rb === -1 ? DOMAIN_ORDER.length : rb
    return ia === ib ? a.localeCompare(b) : ia - ib
  })
})

const dLabel = (d: string) => (zh.value ? domainLabel(d).zh : domainLabel(d).en)

interface HeatRow {
  key: string
  label: string
  model: string
  n: number
  complete: boolean
  cells: Record<string, { acc: number | null; passed: number | null; n: number | null }>
}

const rows = computed<HeatRow[]>(() => {
  const cells = index.value?.cells ?? []
  return cells
    .filter((c) => (c.n ?? 0) > 0 && !c.frozen)
    .map((c) => {
      const passed = Object.values(c.by_domain || {}).reduce((s, v) => s + (v?.passed ?? 0), 0)
      const n = c.n ?? 0
      const byDom: HeatRow['cells'] = {}
      for (const dom of domains.value) {
        const vv = c.by_domain?.[dom]
        byDom[dom] = vv && vv.n > 0
          ? { acc: vv.acc, passed: vv.passed, n: vv.n }
          : { acc: null, passed: null, n: null }
      }
      return {
        key: c.cell ?? c.model,
        label: `${passed}/${n}  ${c.model || c.cell}`,
        model: c.model || c.cell || '—',
        n,
        complete: n >= comparableMin.value,
        cells: byDom,
      }
    })
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1
      const oa = a.n ? passedOf(a) / a.n : 0
      const ob = b.n ? passedOf(b) / b.n : 0
      return ob - oa
    })
    .slice(0, 24)
})

function passedOf(r: HeatRow): number {
  return Object.values(r.cells).reduce((s, v) => s + (v.passed ?? 0), 0)
}

const cellClass = (acc: number | null) => {
  if (acc === null) return 'bg-muted/30 text-muted-foreground/50'
  if (acc >= 0.7) return 'bg-emerald-500/25 text-emerald-900 dark:text-emerald-200'
  if (acc >= 0.4) return 'bg-amber-500/20 text-amber-900 dark:text-amber-200'
  return 'bg-rose-500/15 text-rose-900 dark:text-rose-200'
}

const goModel = (model: string) => router.push(`/v1/model/${encodeURIComponent(model)}`)
</script>

<template>
  <Card v-if="rows.length && domains.length" class="overflow-hidden">
    <CardContent class="p-0 overflow-x-auto">
      <table class="w-full text-[10px]">
        <thead class="border-b border-border bg-muted/40">
          <tr>
            <th class="px-2 py-2 text-left sticky left-0 bg-muted/40 min-w-[140px]">
              {{ zh ? '模型' : 'Model' }}
            </th>
            <th
              v-for="dom in domains"
              :key="dom"
              class="px-1 py-2 text-center font-normal text-muted-foreground min-w-[52px]"
              :title="dLabel(dom)"
            >
              {{ dLabel(dom).slice(0, 6) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.key"
            class="border-b border-border/40 last:border-0 hover:bg-muted/20 cursor-pointer"
            :class="r.complete ? '' : 'opacity-60'"
            @click="goModel(r.model)"
          >
            <td class="px-2 py-1.5 font-mono sticky left-0 bg-card truncate max-w-[180px]" :title="r.label">
              {{ r.label }}
            </td>
            <td
              v-for="dom in domains"
              :key="dom"
              class="px-1 py-1.5 text-center font-mono"
              :class="cellClass(r.cells[dom]?.acc ?? null)"
              :title="r.cells[dom]?.acc != null
                ? `${dLabel(dom)}: ${r.cells[dom]!.passed}/${r.cells[dom]!.n} (${Math.round((r.cells[dom]!.acc ?? 0) * 100)}%)`
                : (zh ? '未跑此域' : 'domain not run')"
            >
              {{ r.cells[dom]?.acc != null ? `${Math.round((r.cells[dom]!.acc ?? 0) * 100)}%` : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
      <p class="px-3 py-2 text-[10px] text-muted-foreground border-t border-border/60">
        {{ zh
          ? `滿卷（≥${comparableMin} 題）優先；點列進模型檔案。灰格 = 該域未跑。`
          : `Full runs (≥${comparableMin} tasks) first; click a row for the model file. Grey = domain not run.` }}
      </p>
    </CardContent>
  </Card>
  <p v-else class="text-xs text-muted-foreground">
    {{ zh ? '尚無領域索引資料。' : 'No domain index in the feed yet.' }}
  </p>
</template>
