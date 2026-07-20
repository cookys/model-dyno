<script setup lang="ts">
import { computed } from 'vue'
import { watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from '@/lib/i18n'
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { mode } from '@/lib/theme'
import {
  dashboardRecords,
  scorecardSweCells,
  generatedAt,
  loading,
  error,
  setSelectedExamFromQuery
} from '@/lib/store'
import { contributorOf, shortDate } from '@/components/CellHelpers'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const { locale, t } = useI18n()
watch(() => route.query.exam, (v) => setSelectedExamFromQuery(v), { immediate: true })

// Compute metrics for meta line
const speedRunsCount = computed(() => dashboardRecords.value.length)

const modelsCount = computed(() => {
  const models = dashboardRecords.value.map(r => r.model_alias).filter(Boolean)
  return new Set(models).size
})

const contributorsCount = computed(() => {
  const conts = dashboardRecords.value.map(r => contributorOf(r))
  return new Set(conts).size
})

const sweCellsCount = computed(() => scorecardSweCells.value.length)

const generatedDateStr = computed(() => shortDate(generatedAt.value))

// Determine active top tab ('speed' | 'swe' | null)
const activeTopTab = computed(() => {
  if (route.path.startsWith('/speed')) return 'speed'
  if (route.path.startsWith('/swe')) return 'swe'
  return null
})

// Navigation helpers
const navigateToTopTab = (tab: 'speed' | 'swe') => {
  if (tab === 'speed') {
    router.push('/speed/heatmap')
  } else {
    router.push('/swe/shared')
  }
}

// Compute Breadcrumbs
interface BreadcrumbItem {
  label: string
  href?: string
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const list: BreadcrumbItem[] = [{ label: t('crumb.home'), href: '#/' }]

  if (route.path.startsWith('/speed')) {
    if (route.path === '/speed/heatmap') {
      list.push({ label: t('idx.heatmap.title') })
    } else if (route.path === '/speed/leaderboard') {
      list.push({ label: t('idx.leaderboard.title') })
    } else if (route.path === '/speed/contributors') {
      list.push({ label: t('idx.contributors.title') })
    } else if (route.path === '/speed/efficiency') {
      list.push({ label: t('idx.efficiency.title') })
    } else if (route.path === '/speed/cloud') {
      list.push({ label: t('idx.cloud.title') })
    }
  } else if (route.path.startsWith('/swe')) {
    list.push({ label: t('crumb.swe'), href: '#/swe' })
    if (route.path === '/swe/shared') {
      list.push({ label: t('crumb.swe.shared') })
    } else if (route.path === '/swe/norm') {
      list.push({ label: t('crumb.swe.norm') })
    } else if (route.path === '/swe/comp') {
      list.push({ label: t('crumb.swe.comp') })
    } else if (route.path === '/swe/scorecard') {
      list.push({ label: t('crumb.swe.scorecard') })
    } else if (route.path === '/swe/exam-history') {
      list.push({ label: t('crumb.swe.examHistory') })
    } else if (route.path === '/swe/by-domain') {
      list.push({ label: t('subtab.swe.byDomain') })
    }
  } else if (route.name === 'ModelDetail') {
    list.push({ label: t('crumb.model') }, { label: String(route.params.alias) })
  } else if (route.name === 'OwnerDetail') {
    list.push({ label: t('crumb.contributor') }, { label: String(route.params.id) })
  }

  return list
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-foreground">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div class="mx-auto max-w-7xl px-4 md:px-6 py-4 flex flex-col gap-3">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <!-- Logo & Title -->
          <div class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-lg bg-gradient-to-tr from-brand to-emerald-500 flex items-center justify-center shadow-md">
              <span class="text-white font-bold font-mono text-sm leading-none">α</span>
            </div>
            <div>
              <h1 class="text-base font-bold tracking-tight text-foreground flex items-baseline gap-2">
                <a href="#/" class="hover:opacity-95 transition-opacity">llm-playground</a>
                <span class="text-xs font-normal text-muted-foreground hidden sm:inline">{{ t('header.subtitle') }}</span>
              </h1>
            </div>
          </div>

          <!-- Controls (Language & Theme) -->
          <div class="flex items-center gap-3">
            <!-- Language Selector -->
            <div class="inline-flex rounded-lg bg-muted p-1 border border-border">
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer"
                :class="locale === 'en' ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
                @click="locale = 'en'"
              >
                EN
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer"
                :class="locale === 'zh' ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
                @click="locale = 'zh'"
              >
                中
              </button>
            </div>

            <!-- Theme Toggle -->
            <div class="inline-flex rounded-lg bg-muted p-1 border border-border">
              <button
                type="button"
                :aria-label="t('theme.light')"
                :title="t('theme.light')"
                class="rounded-md p-1 transition-all cursor-pointer flex items-center justify-center"
                :class="mode === 'light' ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
                @click="mode = 'light'"
              >
                <Sun class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :aria-label="t('theme.dark')"
                :title="t('theme.dark')"
                class="rounded-md p-1 transition-all cursor-pointer flex items-center justify-center"
                :class="mode === 'dark' ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
                @click="mode = 'dark'"
              >
                <Moon class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :aria-label="t('theme.system')"
                :title="t('theme.system')"
                class="rounded-md p-1 transition-all cursor-pointer flex items-center justify-center"
                :class="mode === 'auto' ? 'bg-background text-brand shadow-sm border border-border/30' : 'text-muted-foreground hover:text-foreground'"
                @click="mode = 'auto'"
              >
                <Monitor class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Breadcrumbs & Meta info -->
        <div class="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2 border-t border-border/30 pt-3">
          <nav class="flex items-center gap-1.5 flex-wrap">
            <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
              <span v-if="idx > 0" class="text-muted-foreground/30 font-mono">/</span>
              <a
                v-if="crumb.href"
                :href="crumb.href"
                class="hover:text-foreground hover:underline transition-colors font-medium text-muted-foreground"
              >
                {{ crumb.label }}
              </a>
              <span v-else class="text-foreground font-semibold">
                {{ crumb.label }}
              </span>
            </template>
          </nav>

          <!-- Metrics summary -->
          <div class="flex items-center gap-2 flex-wrap text-muted-foreground/80 font-mono text-[10px] tracking-tight">
            <span>{{ speedRunsCount }} {{ t('meta.speedRuns') }}</span>
            <span class="text-muted-foreground/30">•</span>
            <span>{{ modelsCount }} {{ t('meta.models') }}</span>
            <span class="text-muted-foreground/30">•</span>
            <span>{{ contributorsCount }} {{ t('meta.contributors') }}</span>
            <span v-if="sweCellsCount > 0" class="flex items-center gap-2">
              <span class="text-muted-foreground/30">•</span>
              <span>{{ sweCellsCount }} {{ t('meta.sweCells') }}</span>
            </span>
            <span class="text-muted-foreground/30">•</span>
            <span>{{ t('meta.generated') }} {{ generatedDateStr }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="mx-auto max-w-7xl px-4 md:px-6 py-6 space-y-6">
      <!-- Loading and error guards -->
      <div v-if="loading && speedRunsCount === 0" class="py-24 text-center space-y-4">
        <div class="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="text-sm font-mono text-muted-foreground">{{ t('state.loadingDatasets') }}</p>
      </div>

      <div v-else-if="error" class="py-12 border border-destructive/20 bg-destructive/10 rounded-lg p-6 max-w-xl mx-auto space-y-3">
        <h3 class="text-base font-bold text-destructive">{{ t('error.loadData') }}</h3>
        <p class="text-sm text-muted-foreground font-mono">
          {{ error }}. <span v-html="t('error.localServeTip').replace('{cmd}', '<code>python3 scripts/build-dashboard.py --serve</code>')"></span>
        </p>
      </div>

      <template v-else>
        <!-- Top Level Navigation Tabs (always visible) -->
        <div class="space-y-4">
          <!-- Top Tabs -->
          <div class="flex border-b border-border gap-2">
            <button
              type="button"
              class="px-4 py-2 border-b-2 font-semibold text-sm transition-all relative cursor-pointer"
                :class="[
                activeTopTab === 'speed'
                  ? 'border-brand text-brand font-bold bg-brand/10 dark:bg-brand/20'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              ]"
                @click="navigateToTopTab('speed')"
              >
              {{ t('tab.speed') }}
            </button>
            <button
              type="button"
              class="px-4 py-2 border-b-2 font-semibold text-sm transition-all relative cursor-pointer"
                :class="[
                activeTopTab === 'swe'
                  ? 'border-brand text-brand font-bold bg-brand/10 dark:bg-brand/20'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              ]"
                @click="navigateToTopTab('swe')"
              >
              {{ t('tab.swe') }}
            </button>
          </div>

          <!-- Speed Sub Navigation -->
          <div v-if="activeTopTab === 'speed'" class="flex items-center gap-1.5 flex-wrap text-xs pt-1">
            <Button
              :as="RouterLink"
              to="/speed/heatmap"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/speed/heatmap' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('idx.heatmap.title') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/speed/leaderboard"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/speed/leaderboard' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('idx.leaderboard.title') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/speed/contributors"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/speed/contributors' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('idx.contributors.title') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/speed/efficiency"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/speed/efficiency' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('idx.efficiency.title') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/speed/cloud"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/speed/cloud' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('idx.cloud.title') }}
            </Button>
          </div>

          <!-- SWE Sub Navigation -->
          <div v-if="activeTopTab === 'swe'" class="flex items-center gap-1.5 flex-wrap text-xs pt-1">
            <Button
              :as="RouterLink"
              to="/swe/shared"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/shared' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.shared') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/swe/norm"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/norm' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.norm') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/swe/comp"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/comp' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.comp') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/swe/scorecard"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/scorecard' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.scorecard') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/swe/by-domain"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/by-domain' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.byDomain') }}
            </Button>
            <Button
              :as="RouterLink"
              to="/swe/exam-history"
              variant="ghost"
              size="sm"
              class="h-7 text-xs rounded-full font-medium"
              :class="route.path === '/swe/exam-history' ? 'bg-brand/10 dark:bg-brand/20 text-brand border border-brand/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            >
              {{ t('subtab.swe.examHistory') }}
            </Button>
          </div>
        </div>

        <!-- Rendered Route View -->
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </template>
    </main>

    <!-- Footer -->
    <footer class="border-t border-border mt-12 py-8 bg-muted/50">
      <div class="mx-auto max-w-7xl px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div>
          {{ t('footer.desc') }}
        </div>
        <div class="flex gap-4">
          <a href="https://github.com/cookys/model-dyno" target="_blank" class="hover:underline hover:text-foreground">{{ t('footer.github') }}</a>
          <span class="text-muted-foreground/30">|</span>
          <span class="font-mono">Vite + Vue 3 SFC + Tailwind v4</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
