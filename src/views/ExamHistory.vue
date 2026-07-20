<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { loading, scorecardSweMeta } from '@/lib/store'

const { t } = useI18n()

const hasVersions = computed(() => (scorecardSweMeta.value?.exam_versions?.length || 0) > 0)
const examVersions = computed(() => {
  const arr = scorecardSweMeta.value?.exam_versions || []
  const current = arr.find((v) => v.current)
  if (current) {
    return [current, ...arr.filter((v) => !v.current)]
  }
  return arr
})

const singleVersionNotice = computed(() => {
  if (!hasVersions.value) return ''
  return examVersions.value.length === 1 ? t('examHistory.singleVersionNote') : ''
})
</script>

<template>
  <div class="space-y-6">
    <Card class="border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle class="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <span class="w-1.5 h-4.5 bg-primary rounded-full"></span>
          {{ t('examHistory.title') }}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="loading" class="text-sm text-muted-foreground">{{ t('state.rendering') }}</p>

        <template v-else>
          <p v-if="singleVersionNotice" class="text-xs text-muted-foreground border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 rounded-md px-3 py-2">
            {{ singleVersionNotice }}
          </p>

          <div v-if="!hasVersions" class="text-muted-foreground text-sm">
            {{ t('examHistory.noVersions') }}
          </div>

          <div v-else class="grid md:grid-cols-2 gap-4">
            <Card
              v-for="v in examVersions"
              :key="v.version"
              class="border border-border bg-muted/20"
            >
              <CardHeader class="pb-2">
                <div class="flex items-center justify-between gap-2">
                  <CardTitle class="text-sm font-semibold leading-tight">
                    {{ v.label }}
                  </CardTitle>
                  <Badge :variant="v.current ? 'default' : 'outline'">
                    {{ v.current ? t('examHistory.current') : t('examHistory.archived') }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ v.name }} · {{ v.version }} · {{ v.n_tasks ?? '—' }} {{ t('examBar.tasks') }}
                </p>
              </CardHeader>
              <CardContent class="space-y-3">
                <div class="text-xs text-muted-foreground">
                  <span class="text-foreground font-medium">{{ t('examHistory.date') }}:</span>
                  {{ v.date || t('common.unknown') }}
                </div>
                <p v-if="v.note" class="text-sm">{{ v.note }}</p>
                <p v-else class="text-sm text-muted-foreground">{{ t('examHistory.noNote') }}</p>
                <div>
                  <Button
                    :as="RouterLink"
                    :to="{ path: '/swe/scorecard', query: { exam: v.version } }"
                    size="sm"
                    variant="outline"
                  >
                    {{ t('examHistory.viewBoard') }}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
