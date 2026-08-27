<script setup lang="ts">
/**
 * V1 Exam — what does the frozen exam look like?
 * Timeline + full task discrimination table. Task ids stay in title/tooltip only
 * (domain + pass rate in the UI — no task prose leak).
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import {
  sweCellsByExam,
  scorecardSweMeta,
  taskDomains,
  orderedExamVersions,
} from '@/lib/store'
import { taskStats, type TaskStat } from '@/lib/taskMatrix'
import { domainLabel } from '@/lib/domainBreakdown'
import ExamVersionBar from '@/components/ExamVersionBar.vue'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList, History, BarChart3, ChevronRight } from 'lucide-vue-next'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const examHistory = computed(() =>
  orderedExamVersions(scorecardSweMeta.value?.exam_versions ?? []),
)
const examTotal = computed(() => scorecardSweMeta.value?.n_exam ?? scorecardSweMeta.value?.n_canon ?? 34)

const stats = computed(() => taskStats(sweCellsByExam.value, taskDomains.value))
const saturated = computed(() => stats.value.filter((s) => s.band !== 'discriminating'))
const discriminating = computed(() => stats.value.filter((s) => s.band === 'discriminating'))

const bandFilter = ref<'all' | 'discriminating' | 'saturated'>('all')
const filtered = computed(() => {
  if (bandFilter.value === 'discriminating') return discriminating.value
  if (bandFilter.value === 'saturated') return saturated.value
  return stats.value
})

const dLabel = (d: string | null) => (d ? (zh.value ? domainLabel(d).zh : domainLabel(d).en) : '—')

const bandBadge = (s: TaskStat) => {
  if (s.band === 'all-pass') return zh.value ? '全過' : 'all-pass'
  if (s.band === 'all-fail') return zh.value ? '全不過' : 'all-fail'
  return zh.value ? '有鑑別力' : 'discriminating'
}

const bandClass = (s: TaskStat) => {
  if (s.band === 'all-pass') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
  if (s.band === 'all-fail') return 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
  return 'border-border bg-muted/40 text-muted-foreground'
}
</script>

<template>
  <div class="space-y-6">
    <ExamVersionBar />

    <div class="space-y-1">
      <h2 class="text-xl font-bold tracking-tight flex items-center gap-2">
        <ClipboardList class="h-5 w-5 text-brand" />
        {{ zh ? '考卷長什麼樣？' : 'What does the exam look like?' }}
      </h2>
      <p class="text-xs text-muted-foreground max-w-2xl leading-relaxed">
        {{ zh
          ? `現行卷約 ${examTotal} 題 coding agent 任務。下面只顯示領域與全 fleet 過題率 — 不公開題目敘述。`
          : `The current exam is ~${examTotal} coding-agent tasks. Below: domain + fleet pass rate only — no task prose.` }}
      </p>
    </div>

    <!-- Version timeline -->
    <Card v-if="examHistory.length">
      <CardContent class="p-5 space-y-3">
        <h3 class="text-sm font-bold flex items-center gap-2">
          <History class="h-4 w-4 text-violet-500" />
          {{ zh ? '版本沿革' : 'Version timeline' }}
        </h3>
        <ol class="relative border-l border-border/60 ml-1.5 space-y-3">
          <li v-for="v in examHistory" :key="v.version" class="pl-4 relative">
            <span
              class="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
              :class="v.current ? 'bg-brand' : 'bg-muted-foreground/40'"
            />
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="font-mono text-xs font-bold">{{ v.label || v.version }}</span>
              <span v-if="v.n_tasks != null" class="text-[10px] text-muted-foreground font-mono">{{ v.n_tasks }} {{ zh ? '題' : 'tasks' }}</span>
              <span v-if="v.date" class="text-[10px] text-muted-foreground font-mono">{{ String(v.date).slice(0, 10) }}</span>
              <span v-if="v.current" class="rounded-full border border-brand/40 bg-brand/10 px-1.5 text-[10px] text-brand font-semibold">{{ zh ? '現行' : 'current' }}</span>
            </div>
            <p v-if="v.note" class="text-xs text-muted-foreground leading-relaxed mt-0.5">{{ v.note }}</p>
          </li>
        </ol>
      </CardContent>
    </Card>

    <!-- Full discrimination table -->
    <section v-if="stats.length" class="space-y-3">
      <div class="flex items-end justify-between flex-wrap gap-3">
        <h3 class="text-sm font-bold flex items-center gap-2">
          <BarChart3 class="h-4 w-4 text-teal-500" />
          {{ zh ? '逐題鑑別度（全 fleet）' : 'Per-task discrimination (full fleet)' }}
        </h3>
        <div class="flex gap-1 rounded-lg bg-muted/60 p-1 border border-border text-[10px] font-semibold">
          <button
            v-for="opt in (['all', 'discriminating', 'saturated'] as const)"
            :key="opt"
            type="button"
            class="rounded-md px-2.5 py-1 cursor-pointer transition-all"
            :class="bandFilter === opt ? 'bg-background text-brand shadow-sm' : 'text-muted-foreground'"
            @click="bandFilter = opt"
          >
            {{ opt === 'all' ? (zh ? '全部' : 'All') : opt === 'discriminating' ? (zh ? '有鑑別力' : 'Discriminating') : (zh ? '飽和' : 'Saturated') }}
            ({{ opt === 'all' ? stats.length : opt === 'discriminating' ? discriminating.length : saturated.length }})
          </button>
        </div>
      </div>

      <Card class="overflow-hidden">
        <CardContent class="p-0 overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-muted/80 backdrop-blur border-b border-border text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left">{{ zh ? '領域' : 'Domain' }}</th>
                <th class="px-3 py-2 text-right">{{ zh ? '過題率' : 'Pass rate' }}</th>
                <th class="px-3 py-2 text-right hidden sm:table-cell">n</th>
                <th class="px-3 py-2 text-center">{{ zh ? '帶' : 'Band' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in filtered"
                :key="s.taskId"
                class="border-b border-border/40 hover:bg-muted/20"
                :title="s.taskId"
              >
                <td class="px-3 py-2">{{ dLabel(s.domain) }}</td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2 justify-end">
                    <div class="relative w-20 h-2 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div
                        class="absolute inset-y-0 left-0 rounded-full"
                        :class="s.passRate >= 0.7 ? 'bg-emerald-500/70' : s.passRate >= 0.3 ? 'bg-amber-500/70' : 'bg-rose-500/70'"
                        :style="{ width: `${Math.round(s.passRate * 100)}%` }"
                      />
                    </div>
                    <span class="font-mono font-bold w-12 text-right">{{ Math.round(s.passRate * 100) }}%</span>
                  </div>
                </td>
                <td class="px-3 py-2 text-right font-mono text-muted-foreground hidden sm:table-cell">
                  {{ s.passes }}/{{ s.attempts }}
                </td>
                <td class="px-3 py-2 text-center">
                  <span
                    class="inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
                    :class="bandClass(s)"
                  >
                    {{ bandBadge(s) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p class="text-[10px] text-muted-foreground leading-relaxed">
        {{ zh
          ? `${saturated.length} 題標為飽和（全過/全不過）— 對排行無鑑別力，是 plan 024 退題候選；hover 列可看 opaque task id，無題目敘述。`
          : `${saturated.length} task(s) marked saturated (all-pass/all-fail) — no ranking signal, retirement candidates per plan 024; hover row for opaque task id, no task prose.` }}
        <RouterLink to="/v1/method" class="text-brand hover:underline ml-1">
          {{ zh ? '→ 方法論' : '→ Methodology' }}
        </RouterLink>
      </p>
    </section>

    <RouterLink
      to="/v1/rank"
      class="inline-flex items-center gap-1 text-xs text-brand hover:underline"
    >
      {{ zh ? '看誰在這份卷上最強' : 'See who scores best on this exam' }}
      <ChevronRight class="h-3.5 w-3.5" />
    </RouterLink>
  </div>
</template>
