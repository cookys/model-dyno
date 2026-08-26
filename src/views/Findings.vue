<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { dashboardFindings, dashboardDepthFindings, loading } from '@/lib/store'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const { t, locale } = useI18n()

const findings = computed(() => dashboardFindings.value)
const depthRows = computed(() => {
  // ttft first (the depth story), then throughput, then agent-work rows; within a
  // metric keep the producer's order (paired cold/hot rows stay adjacent).
  const order: Record<string, number> = { ttft_s: 0, total_tok_s: 1, effective_tok_s: 2, exam_wall_min: 3 }
  return [...dashboardDepthFindings.value].sort(
    (a, b) => (order[a.metric] ?? 9) - (order[b.metric] ?? 9),
  )
})

const title = (f: { title_en: string; title_zh: string }) =>
  locale.value === 'zh' && f.title_zh ? f.title_zh : f.title_en
const claim = (f: { claim_en: string; claim_zh: string }) =>
  locale.value === 'zh' && f.claim_zh ? f.claim_zh : f.claim_en
const measured = (f: { measured_en: string; measured_zh: string }) =>
  locale.value === 'zh' && f.measured_zh ? f.measured_zh : f.measured_en

const metricLabel = (m: string): string => ({
  ttft_s: 'TTFT (s)',
  total_tok_s: 'throughput (tok/s)',
  effective_tok_s: 'effective tok/s',
  exam_wall_min: 'exam wall (min)',
}[m] ?? m)

const fmtContext = (n: number): string => (n > 0 ? `${Math.round(n / 1000)}k` : '—')
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-bold tracking-tight">{{ t('findings.title') }}</h2>
      <p class="text-sm text-muted-foreground mt-1 max-w-3xl">{{ t('findings.subtitle') }}</p>
    </div>

    <p v-if="loading" class="text-sm text-muted-foreground">…</p>

    <Card v-for="f in findings" :key="f.id" :id="f.id" class="scroll-mt-20">
      <CardHeader>
        <CardTitle class="text-base">{{ title(f) }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('findings.claim') }}</div>
          <p class="mt-0.5 italic text-muted-foreground">“{{ claim(f) }}”</p>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('findings.measured') }}</div>
          <p class="mt-0.5">{{ measured(f) }}</p>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('findings.evidence') }}</div>
          <div class="mt-1 overflow-x-auto">
            <table class="w-full text-xs border-collapse">
              <tbody>
                <tr v-for="(ev, i) in f.evidence" :key="i" class="border-t border-border">
                  <td class="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">{{ ev.metric }}</td>
                  <td class="py-1 pr-3 font-mono font-semibold align-top">{{ ev.value }}</td>
                  <td class="py-1 text-muted-foreground align-top">{{ ev.detail }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="grid gap-2 md:grid-cols-2">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('findings.conditions') }}</div>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ f.conditions }}</p>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('findings.repro') }}</div>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ f.repro_en }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2">
          <p class="text-xs text-muted-foreground"><span class="font-semibold">{{ t('findings.caveat') }}:</span> {{ f.caveat_en }}</p>
          <p class="text-[11px] text-muted-foreground/70 whitespace-nowrap">{{ t('findings.source') }}: {{ f.source }} · {{ f.date }}</p>
        </div>
      </CardContent>
    </Card>

    <Card v-if="depthRows.length" id="depth">
      <CardHeader>
        <CardTitle class="text-base">{{ t('findings.depth.title') }}</CardTitle>
        <p class="text-sm text-muted-foreground mt-1 max-w-3xl">{{ t('findings.depth.subtitle') }}</p>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="text-left text-muted-foreground">
                <th class="py-1.5 pr-3 font-medium">{{ t('findings.depth.col.metric') }}</th>
                <th class="py-1.5 pr-3 font-medium">{{ t('findings.depth.col.context') }}</th>
                <th class="py-1.5 pr-3 font-medium">{{ t('findings.depth.col.concurrency') }}</th>
                <th class="py-1.5 pr-3 font-medium">{{ t('findings.depth.col.state') }}</th>
                <th class="py-1.5 pr-3 font-medium text-right">{{ t('findings.depth.col.value') }}</th>
                <th class="py-1.5 pr-3 font-medium">{{ t('findings.depth.col.config') }}</th>
                <th class="py-1.5 font-medium">{{ t('findings.depth.col.note') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in depthRows" :key="i" class="border-t border-border align-top">
                <td class="py-1.5 pr-3 whitespace-nowrap">{{ metricLabel(r.metric) }}</td>
                <td class="py-1.5 pr-3 font-mono">{{ fmtContext(r.context) }}</td>
                <td class="py-1.5 pr-3 font-mono">{{ r.concurrency }}</td>
                <td class="py-1.5 pr-3">
                  <span v-if="r.state !== 'n/a'"
                        class="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                        :class="r.state === 'cold'
                          ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'">
                    {{ r.state }}
                  </span>
                  <span v-else class="text-muted-foreground/50">—</span>
                </td>
                <td class="py-1.5 pr-3 font-mono font-semibold text-right">{{ r.value }}</td>
                <td class="py-1.5 pr-3 text-muted-foreground">{{ r.config }} · {{ r.machine }}</td>
                <td class="py-1.5 text-muted-foreground">{{ r.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
