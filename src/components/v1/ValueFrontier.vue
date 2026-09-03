<script setup lang="ts">
/**
 * Value frontier — accuracy against what it costs you.
 *
 * The ranking table answers "who is strongest". This answers the question the table
 * cannot: is the strongest one worth it. Two axes, one at a time:
 *   $/solved  — cash per solved task, only for cells with a published rate
 *   tok/solved — OUTPUT tokens per solved task, for every cell with usage
 *
 * Output tokens, never input: input is inflated on routes with no cache discount, so an
 * input-based axis would rank local cells as wasteful for a billing reason rather than a
 * model one.
 *
 * The x scale is log because the spread is ~360x on cost and ~20x on tokens; a linear axis
 * would collapse every cheap cell onto the origin.
 *
 * Colour = the billing REGIME (producer-derived, plan 056), not the vendor: the question
 * this chart asks is about money, and "$0.02 on a flat plan" and "$0.02 metered" are not
 * the same claim. Palette is the validated categorical theme (slots 1–3), checked with the
 * dataviz validator on both surfaces; the aqua slot's sub-3:1 light contrast is relieved by
 * the legend + direct labels + the ranked table on the same page.
 */
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import vegaEmbed from 'vega-embed'
import { isDark, chartTheme } from '@/lib/theme'
import { useI18n } from '@/lib/i18n'

interface FrontierRow {
  label: string
  acc: number | null          // 0..1
  usdPerSolved: number | null
  tokPerSolved: number | null
  priceKnown: boolean
  billing: string | null
  isLocal: boolean
  passed: number
  graded: number
}

const props = defineProps<{ rows: FrontierRow[] }>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const axis = ref<'usd' | 'tok'>('usd')
const chartContainer = ref<HTMLElement | null>(null)
let view: any = null

// Validated categorical slots 1–3 (light / dark). Fixed order, never cycled.
const SERIES = {
  metered: { light: '#2a78d6', dark: '#3987e5' },
  subscription: { light: '#eb6834', dark: '#d95926' },
  token_plan: { light: '#1baf7a', dark: '#199e70' },
  local: { light: '#2a78d6', dark: '#3987e5' },
  cloud: { light: '#eb6834', dark: '#d95926' },
} as const

const billingLabel = (b: string | null) => {
  if (b === 'metered') return zh.value ? '現金計價' : 'Metered'
  if (b === 'subscription') return zh.value ? '訂閱' : 'Subscription'
  if (b === 'token_plan') return zh.value ? '方案' : 'Token plan'
  if (b === 'local') return zh.value ? '本地' : 'Local'
  return zh.value ? '未知' : 'Unknown'
}

/** Points the chart can actually plot on the selected axis. */
const points = computed(() => {
  const out: any[] = []
  for (const r of props.rows) {
    if (r.acc == null || r.passed <= 0) continue   // $/solved and tok/solved are undefined at 0 solved
    const x = axis.value === 'usd' ? r.usdPerSolved : r.tokPerSolved
    if (x == null || !(x > 0)) continue
    if (axis.value === 'usd' && !r.priceKnown) continue
    out.push({
      label: r.label,
      x,
      acc: r.acc * 100,
      group: axis.value === 'usd' ? (r.billing ?? 'unknown') : (r.isLocal ? 'local' : 'cloud'),
      groupLabel: axis.value === 'usd'
        ? billingLabel(r.billing)
        : (r.isLocal ? billingLabel('local') : (zh.value ? '雲端' : 'Cloud')),
      score: `${r.passed}/${r.graded}`,
      notional: r.billing === 'subscription' || r.billing === 'token_plan',
    })
  }
  return out
})

/**
 * The frontier itself: points nothing else beats on BOTH axes (cheaper AND better).
 * These are the only points that get a direct label — labelling all of them would be the
 * "a number on every point" anti-pattern, and the frontier is what the chart is for.
 */
const frontier = computed(() => {
  const pts = points.value
  return pts
    .filter((p) => !pts.some((q) => q !== p && q.x <= p.x && q.acc >= p.acc && (q.x < p.x || q.acc > p.acc)))
    .map((p) => p.label)
})

const xTitle = computed(() =>
  axis.value === 'usd'
    ? (zh.value ? '每解一題的成本（美元，對數軸）' : 'Cost per solved task (USD, log)')
    : (zh.value ? '每解一題的輸出 token（對數軸）' : 'Output tokens per solved task (log)'),
)

function render() {
  if (!chartContainer.value) return
  if (!points.value.length) { chartContainer.value.innerHTML = ''; return }
  const dark = isDark.value
  const shade = (k: keyof typeof SERIES) => SERIES[k][dark ? 'dark' : 'light']
  const domain = axis.value === 'usd'
    ? ['metered', 'subscription', 'token_plan']
    : ['local', 'cloud']
  const range = domain.map((d) => shade(d as keyof typeof SERIES))
  const values = points.value.map((p) => ({ ...p, isFrontier: frontier.value.includes(p.label) }))

  const spec: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    background: 'transparent',
    autosize: { type: 'fit', contains: 'padding' },
    config: chartTheme(dark),
    data: { values },
    width: 'container',
    height: 340,
    layer: [
      {
        // Invisible hit target. The visible mark is ~10px across; the interaction spec wants
        // a ~24px target, so hover/tooltip lives on a transparent ~26px point underneath
        // rather than making the reader land dead-centre on a dot.
        mark: { type: 'point', filled: true, size: 560, opacity: 0, tooltip: true },
        encoding: {
          x: { field: 'x', type: 'quantitative', scale: { type: 'log', nice: false, padding: 14 } },
          y: { field: 'acc', type: 'quantitative', scale: { zero: false, domainMax: 100, padding: 14 } },
          tooltip: [
            { field: 'label', title: zh.value ? '模型' : 'Model' },
            { field: 'score', title: zh.value ? '成績' : 'Score' },
            { field: 'acc', title: zh.value ? '正確率 %' : 'Accuracy %', format: '.1f' },
            { field: 'x', title: axis.value === 'usd' ? (zh.value ? '$/題' : '$/solved') : (zh.value ? 'token/題' : 'tok/solved'),
              format: axis.value === 'usd' ? '$.4~f' : ',.0f' },
            { field: 'groupLabel', title: zh.value ? '計費' : 'Billing' },
          ],
        },
      },
      {
        mark: { type: 'point', filled: true, size: 110, opacity: 0.95,
                stroke: dark ? '#1a1a19' : '#fcfcfb', strokeWidth: 2 },
        encoding: {
          x: { field: 'x', type: 'quantitative', scale: { type: 'log', nice: false, padding: 14 },
               title: xTitle.value,
               axis: { format: axis.value === 'usd' ? '$.3~f' : '~s', grid: true } },
          y: { field: 'acc', type: 'quantitative', title: zh.value ? '正確率 %' : 'Accuracy %',
               scale: { zero: false, domainMax: 100, padding: 14 }, axis: { grid: true } },
          color: {
            field: 'groupLabel', type: 'nominal', title: null,
            scale: { domain: values.length
              ? domain.map((d) => (values.find((v) => v.group === d)?.groupLabel ?? d))
              : domain, range },
            legend: { orient: 'bottom', direction: 'horizontal', symbolSize: 90 },
          },
          tooltip: [
            { field: 'label', title: zh.value ? '模型' : 'Model' },
            { field: 'score', title: zh.value ? '成績' : 'Score' },
            { field: 'acc', title: zh.value ? '正確率 %' : 'Accuracy %', format: '.1f' },
            { field: 'x', title: axis.value === 'usd' ? (zh.value ? '$/題' : '$/solved') : (zh.value ? 'token/題' : 'tok/solved'),
              format: axis.value === 'usd' ? '$.4~f' : ',.0f' },
            { field: 'groupLabel', title: zh.value ? '計費' : 'Billing' },
          ],
        },
      },
      {
        // Direct labels for the frontier only — the points nothing beats on both axes.
        transform: [{ filter: 'datum.isFrontier' }],
        mark: { type: 'text', align: 'left', dx: 9, dy: -1, fontSize: 10,
                color: dark ? '#c3c2b7' : '#52514e' },
        encoding: {
          x: { field: 'x', type: 'quantitative', scale: { type: 'log', nice: false, padding: 14 } },
          y: { field: 'acc', type: 'quantitative', scale: { zero: false, domainMax: 100, padding: 14 } },
          text: { field: 'label' },
        },
      },
    ],
  }
  vegaEmbed(chartContainer.value, spec, { actions: false, renderer: 'svg' })
    .then((res) => { view = res.view })
    .catch(() => { /* a chart that cannot render must not take the page down */ })
}

watch([points, isDark, axis, locale], () => { nextTick(render) }, { immediate: true, deep: true })
onBeforeUnmount(() => { try { view?.finalize() } catch { /* already gone */ } })
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h3 class="text-sm font-semibold text-foreground">
          {{ zh ? '價值前緣：分數 vs 代價' : 'Value frontier: score vs what it costs' }}
        </h3>
        <p class="text-xs text-muted-foreground">
          {{ zh
            ? '有標籤的是「前緣」：沒有任何一格同時更便宜又更準。'
            : 'Labelled points are the frontier: nothing is both cheaper and better.' }}
        </p>
      </div>
      <div class="flex gap-1 text-xs">
        <button
          v-for="opt in (['usd', 'tok'] as const)" :key="opt"
          class="px-2.5 py-1 rounded-full border transition-colors"
          :class="axis === opt
            ? 'bg-brand/10 dark:bg-brand/20 text-brand border-brand/20'
            : 'text-muted-foreground border-border hover:text-foreground'"
          @click="axis = opt"
        >
          {{ opt === 'usd' ? (zh ? '$/題' : '$/solved') : (zh ? 'token/題' : 'tok/solved') }}
        </button>
      </div>
    </div>

    <div v-if="!points.length" class="text-xs text-muted-foreground border border-border rounded-md px-3 py-6 text-center">
      {{ axis === 'usd'
        ? (zh ? '這張考卷上還沒有任何一格有已發布的牌價 — 那是資料缺口,不是免費。' : 'No cell on this exam carries a published rate — a data gap, not free.')
        : (zh ? '沒有可用的 token 用量資料。' : 'No usable token usage recorded.') }}
    </div>
    <div v-else ref="chartContainer" class="w-full"></div>

    <p v-if="axis === 'usd' && points.some((p) => p.notional)" class="text-[11px] text-muted-foreground">
      {{ zh
        ? '訂閱／方案制的金額是名目值（牌價 × 實測用量）,不是真實扣款 —— 那些路線的真實限制是額度。沒有牌價的格不在圖上。'
        : 'Subscription / plan figures are notional (list price × measured usage), not money actually billed — on those routes the real constraint is quota. Cells with no published rate are absent, not at zero.' }}
    </p>
    <p v-else-if="axis === 'tok'" class="text-[11px] text-muted-foreground">
      {{ zh
        ? '用輸出 token,不是輸入 —— 沒有 cache 折抵的路線輸入會膨脹,用輸入排序會因計費制度而冤枉本地模型。'
        : 'Output tokens, not input: input is inflated on routes without a cache discount, so an input axis would penalise local cells for a billing reason rather than a model one.' }}
    </p>
  </div>
</template>
