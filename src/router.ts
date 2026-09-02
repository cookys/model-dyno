import { createRouter, createWebHashHistory } from 'vue-router'
import { isV1 } from '@/lib/uiVersion'

const SpeedHeatmap = () => import('@/views/SpeedHeatmap.vue')
const SpeedLeaderboard = () => import('@/views/SpeedLeaderboard.vue')
const SpeedContributors = () => import('@/views/SpeedContributors.vue')
const SpeedEfficiency = () => import('@/views/SpeedEfficiency.vue')
const SpeedCloud = () => import('@/views/SpeedCloud.vue')
const SweShared = () => import('@/views/SweShared.vue')
const SweNorm = () => import('@/views/SweNorm.vue')
const SweComp = () => import('@/views/SweComp.vue')
const SweScorecard = () => import('@/views/SweScorecard.vue')
const SweByDomain = () => import('@/views/SweByDomain.vue')
const SweExamHistory = () => import('@/views/ExamHistory.vue')
const SweLicences = () => import('@/views/SweLicences.vue')   // plan 065: autopilot licences
const ModelDetail = () => import('@/views/ModelDetail.vue')
const OwnerDetail = () => import('@/views/OwnerDetail.vue')

// V1 — question-driven IA: pick for me / who's strongest / mod truths / why trust
const V1Home = () => import('@/views/v1/V1Home.vue')
const V1Rank = () => import('@/views/v1/V1Rank.vue')
const V1Speed = () => import('@/views/v1/V1Speed.vue')
const V1Mods = () => import('@/views/v1/V1Mods.vue')
const V1Method = () => import('@/views/v1/V1Method.vue')
const V1Exam = () => import('@/views/v1/V1Exam.vue')
const V1ModelDetail = () => import('@/views/v1/V1ModelDetail.vue')

const routes = [
  {
    path: '/',
    redirect: () => (isV1.value ? '/v1' : '/speed/heatmap'),
  },
  // V1 core routes
  { path: '/v1', name: 'V1Home', component: V1Home },
  { path: '/v1/rank', name: 'V1Rank', component: V1Rank },
  { path: '/v1/speed', name: 'V1Speed', component: V1Speed },
  { path: '/v1/mods', name: 'V1Mods', component: V1Mods },
  { path: '/v1/method', name: 'V1Method', component: V1Method },
  { path: '/v1/exam', name: 'V1Exam', component: V1Exam },
  { path: '/v1/licences', name: 'V1Licences', component: SweLicences },
  { path: '/v1/model/:alias', name: 'V1ModelDetail', component: V1ModelDetail, props: true },

  // Legacy v1 paths from the first iteration
  { path: '/v1/leaderboard', redirect: '/v1/rank' },
  { path: '/v1/battleground', redirect: '/v1/mods' },
  { path: '/v1/hardware', redirect: '/v1' },
  { path: '/hardware', redirect: '/v1' },
  { path: '/findings', redirect: '/v1/mods' },
  { path: '/battleground', redirect: '/v1/mods' },

  // V0 classic routes
  { path: '/speed/heatmap', name: 'SpeedHeatmap', component: SpeedHeatmap },
  { path: '/speed/leaderboard', name: 'SpeedLeaderboard', component: SpeedLeaderboard },
  { path: '/speed/contributors', name: 'SpeedContributors', component: SpeedContributors },
  { path: '/speed/efficiency', name: 'SpeedEfficiency', component: SpeedEfficiency },
  { path: '/speed/cloud', name: 'SpeedCloud', component: SpeedCloud },
  { path: '/swe', redirect: () => (isV1.value ? '/v1/rank' : '/swe/shared') },
  { path: '/swe/shared', name: 'SweShared', component: SweShared },
  { path: '/swe/norm', name: 'SweNorm', component: SweNorm },
  { path: '/swe/comp', name: 'SweComp', component: SweComp },
  { path: '/swe/scorecard', name: 'SweScorecard', component: SweScorecard },
  { path: '/swe/by-domain', name: 'SweByDomain', component: SweByDomain },
  { path: '/swe/exam-history', name: 'SweExamHistory', component: SweExamHistory },
  { path: '/swe/licences', name: 'SweLicences', component: SweLicences },
  {
    path: '/model/:alias',
    name: 'ModelDetail',
    component: () => (isV1.value ? V1ModelDetail() : ModelDetail()),
    props: true,
  },
  { path: '/owner/:id', name: 'OwnerDetail', component: OwnerDetail, props: true },
  {
    path: '/:pathMatch(.*)*',
    redirect: () => (isV1.value ? '/v1' : '/speed/heatmap'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
