<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { loading, qualificationFeed, qualificationFeedError } from '@/lib/store'
import {
  adoptCommand,
  formatPermille,
  strikesForEntry,
  type QualificationEntry,
} from '@/lib/qualificationFeed'

const { t } = useI18n()

const feed = computed(() => qualificationFeed.value)

// Role order: the roles autopilot users actually route on first.
const ROLE_ORDER = ['implementer', 'reviewer', 'verification_author', 'owner', 'explorer', 'consult', 'discuss']

const groups = computed(() => {
  const f = feed.value
  if (!f) return []
  const byRole = new Map<string, QualificationEntry[]>()
  for (const e of f.defaults) {
    const list = byRole.get(e.role) ?? []
    list.push(e)
    byRole.set(e.role, list)
  }
  const roles = [...byRole.keys()].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a)
    const ib = ROLE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
  return roles.map((role) => ({
    role,
    summary: f.role_summary[role] ?? { qualified: 0, failed: 0, other: 0 },
    entries: (byRole.get(role) ?? []).slice().sort((a, b) =>
      a.status === b.status
        ? `${a.seat.engine} ${a.seat.effort ?? ''}`.localeCompare(`${b.seat.engine} ${b.seat.effort ?? ''}`)
        : a.status === 'qualified' ? -1 : b.status === 'qualified' ? 1 : a.status.localeCompare(b.status),
    ),
  }))
})

function seatLabel(e: QualificationEntry): string {
  return `${e.seat.engine} · ${e.seat.runner} · ${e.seat.effort ?? t('licences.effortDefault')}`
}

function corpusPass(e: QualificationEntry): string {
  const q = e.quality
  const cp = q && typeof q.corpus_pass === 'string' ? q.corpus_pass : null
  return cp ?? '—'
}

function violations(e: QualificationEntry): string[] {
  const q = e.quality ?? {}
  const out: string[] = []
  for (const key of ['integrity_violations', 'fabricated_changes', 'contract_violations', 'oracle_misses', 'false_pass_critical']) {
    const v = q[key]
    if (typeof v === 'number' && v > 0) out.push(`${key}: ${v}`)
  }
  return out
}

function statusVariant(status: string): 'default' | 'destructive' | 'outline' {
  if (status === 'qualified') return 'default'
  if (status === 'failed') return 'destructive'
  return 'outline'
}

function statusLabel(status: string): string {
  if (status === 'qualified') return t('licences.qualified')
  if (status === 'failed') return t('licences.failed')
  return status
}

const copiedId = ref<string | null>(null)
async function copy(e: QualificationEntry) {
  const f = feed.value
  if (!f) return
  const cmd = adoptCommand(f, e)
  try {
    await navigator.clipboard.writeText(cmd)
    copiedId.value = e.default_id
    setTimeout(() => { if (copiedId.value === e.default_id) copiedId.value = null }, 1500)
  } catch {
    // clipboard blocked (http / permissions): the command is still visible in the <code> block
  }
}
</script>

<template>
  <div class="space-y-6">
    <Card class="border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('licences.title') }}
        </CardTitle>
        <p class="text-sm text-muted-foreground">{{ t('licences.subtitle') }}</p>
      </CardHeader>
      <CardContent class="space-y-5">
        <p v-if="loading" class="text-sm text-muted-foreground">{{ t('state.rendering') }}</p>

        <template v-else-if="!feed">
          <p class="text-sm text-muted-foreground">{{ t('licences.notPublished') }}</p>
          <p v-if="qualificationFeedError" class="text-xs text-destructive">{{ qualificationFeedError }}</p>
        </template>

        <template v-else>
          <!-- Disclosure travels verbatim: it is the trust model, not decoration -->
          <div class="text-xs text-muted-foreground border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 rounded-md px-3 py-2 space-y-2">
            <p class="font-medium text-foreground">{{ t('licences.disclosure') }}</p>
            <p>{{ feed.disclosure_notice }}</p>
            <p>{{ feed.adr_0001_notice }}</p>
          </div>

          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><span class="text-foreground font-medium">{{ t('licences.owner') }}:</span> {{ feed.owner }}</span>
            <span><span class="text-foreground font-medium">{{ t('licences.generated') }}:</span> {{ feed.generated_at ?? '—' }}</span>
            <span v-if="feed.exam"><span class="text-foreground font-medium">{{ t('licences.boardExam') }}:</span> {{ feed.exam }}</span>
            <span><span class="text-foreground font-medium">digest:</span> {{ feed.digest ? feed.digest.slice(0, 12) : '—' }}</span>
          </div>

          <p class="text-xs text-muted-foreground">{{ t('licences.expiryNote') }}</p>

          <div v-for="g in groups" :key="g.role" class="space-y-2">
            <h3 class="text-sm font-semibold text-foreground flex items-center gap-2">
              {{ g.role }}
              <Badge variant="outline">{{ g.summary.qualified }} ✅ · {{ g.summary.failed }} ❌</Badge>
            </h3>
            <div class="overflow-x-auto rounded-md border border-border">
              <table role="table" class="w-full text-xs">
                <thead class="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.seat') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.status') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.corpus') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.date') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.board') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.env') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.evidence') }}</th>
                    <th class="text-left px-2 py-1.5">{{ t('licences.col.adopt') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in g.entries" :key="e.default_id" class="border-t border-border align-top">
                    <td class="px-2 py-1.5 font-medium text-foreground whitespace-nowrap">
                      {{ seatLabel(e) }}
                      <div v-if="e.feed.legacy" class="text-[10px] text-muted-foreground">{{ t('licences.legacy') }}</div>
                    </td>
                    <td class="px-2 py-1.5">
                      <Badge :variant="statusVariant(e.status)">{{ statusLabel(e.status) }}</Badge>
                      <div v-for="v in violations(e)" :key="v" class="text-[10px] text-destructive">{{ v }}</div>
                      <div v-for="s in strikesForEntry(feed, e)" :key="s.receipt_ref ?? s.detector_id ?? s.class ?? ''" class="text-[10px] text-amber-600 dark:text-amber-400">
                        ⚠ strike: {{ s.class ?? '?' }} / {{ s.cause_class ?? '?' }}
                      </div>
                    </td>
                    <td class="px-2 py-1.5 whitespace-nowrap">
                      {{ corpusPass(e) }}
                      <div class="text-[10px] text-muted-foreground">{{ e.administration.corpus_version ?? '—' }}</div>
                    </td>
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ e.administration.date ?? '—' }}</td>
                    <td class="px-2 py-1.5 whitespace-nowrap">
                      <template v-if="e.board && e.board.cell">
                        <RouterLink :to="{ path: '/swe/comp' }" class="underline decoration-dotted">
                          {{ e.board.passed ?? '—' }}/{{ e.board.n ?? '—' }}
                        </RouterLink>
                        <span class="text-muted-foreground"> [{{ formatPermille(e.board.ci_lo_permille) }}, {{ formatPermille(e.board.ci_hi_permille) }}]</span>
                        <div class="text-[10px] text-muted-foreground">{{ e.board.cell }} · {{ e.board.agency_verdict ?? '—' }}</div>
                      </template>
                      <span v-else class="text-muted-foreground">{{ t('licences.noBoard') }}</span>
                    </td>
                    <td class="px-2 py-1.5 text-muted-foreground">
                      <div>{{ e.administration.harness_version ?? '—' }}</div>
                      <div>{{ e.administration.runner_version ?? '—' }}</div>
                      <div v-if="e.administration.model_version">{{ e.administration.model_version }} ({{ e.administration.version_source ?? '?' }})</div>
                    </td>
                    <td class="px-2 py-1.5">
                      <a v-if="e.feed.evidence_url" :href="e.feed.evidence_url" target="_blank" rel="noopener" class="underline decoration-dotted">bundle</a>
                      <span v-else class="text-muted-foreground">—</span>
                    </td>
                    <td class="px-2 py-1.5">
                      <div class="flex items-start gap-2">
                        <code class="text-[10px] break-all">{{ adoptCommand(feed, e) }}</code>
                        <Button size="sm" variant="outline" class="h-6 text-[10px] shrink-0" @click="copy(e)">
                          {{ copiedId === e.default_id ? t('licences.copied') : t('licences.copy') }}
                        </Button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">{{ t('licences.envNote') }}</p>
          <p class="text-xs text-muted-foreground">{{ t('licences.adoptHint') }}</p>

          <div class="text-xs text-muted-foreground">
            <span class="text-foreground font-medium">{{ t('licences.strikes') }}:</span>
            <template v-if="feed.strikes.length">
              <span v-for="s in feed.strikes" :key="(s.receipt_ref ?? '') + s.engine + (s.effort ?? '')" class="ml-2">
                {{ s.engine }} · {{ s.runner }} · {{ s.role }}<template v-if="s.effort"> · {{ s.effort }}</template> — {{ s.class ?? '?' }} / {{ s.cause_class ?? '?' }}
                <span v-if="!s.effort" class="text-muted-foreground">({{ t('licences.strikeLegacy') }})</span>
              </span>
            </template>
            <span v-else class="ml-2">{{ t('licences.noStrikes') }}</span>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
