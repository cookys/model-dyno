<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { orderedExamVersions, scorecardSweMeta, selectedExam } from '@/lib/store'

// switchable=true (scorecard): the bar filters the board by ?exam= and offers a version dropdown.
// switchable=false (comp/norm): those boards' cells carry no canonical_version and CANNOT be
// version-filtered — so the bar is a PASSIVE INDICATOR: it always shows the CURRENT exam label,
// never a dropdown, and never reflects ?exam= (which would falsely imply the data was filtered).
const props = withDefaults(defineProps<{ switchable?: boolean }>(), { switchable: true })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const examVersions = computed(() => scorecardSweMeta.value?.exam_versions || [])
const hasMultipleVersions = computed(() => props.switchable && examVersions.value.length > 1)
const orderedVersions = computed(() => orderedExamVersions(examVersions.value))

const currentVersion = computed(() =>
  examVersions.value.find((v) => v.current) || orderedVersions.value[0] || null
)

const selected = computed(() => {
  if (!props.switchable) return currentVersion.value
  const exact = examVersions.value.find((v) => v.version === selectedExam.value)
  if (exact) return exact
  return orderedVersions.value[0] || null
})

const versionLabel = (v: typeof examVersions.value[number]) => {
  const currentOrArchived = v.current ? t('examBar.current') : t('examBar.archived')
  return `${v.label} · ${v.n_tasks ?? '—'} ${t('examBar.tasks')} · ${currentOrArchived}`
}

const onExamChange = (e: Event) => {
  const next = (e.target as HTMLSelectElement).value
  if (!next) return
  router.push({
    path: route.path,
    query: {
      ...route.query,
      exam: next,
    },
  })
}
</script>

<template>
  <div class="rounded-md border border-border bg-muted/30 dark:bg-muted/20 px-3 py-2">
    <div class="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">{{ t('examBar.prefix') }}:</div>
    <div class="mt-2 flex items-center gap-2 flex-wrap">
      <label v-if="hasMultipleVersions" for="exam-version-select" class="sr-only">{{ t('examBar.selectLabel') }}</label>
      <select
        v-if="hasMultipleVersions"
        id="exam-version-select"
        class="h-8 rounded-md border border-input bg-background text-sm px-2.5 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :value="selected?.version || ''"
        @change="onExamChange"
      >
        <option
          v-for="v in orderedVersions"
          :key="v.version"
          :value="v.version"
        >
          {{ versionLabel(v) }}
        </option>
      </select>

      <div v-else class="text-sm font-medium text-foreground">
        <span v-if="selected">
          {{ versionLabel(selected) }}
        </span>
        <span v-else>
          {{ t('examBar.noData') }}
        </span>
      </div>

      <Button :as="RouterLink" to="/swe/exam-history" size="sm" variant="outline" class="h-8">
        {{ t('examBar.viewHistory') }}
      </Button>
    </div>
  </div>
</template>
