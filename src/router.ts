import { createRouter, createWebHashHistory } from 'vue-router'

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
const ModelDetail = () => import('@/views/ModelDetail.vue')
const OwnerDetail = () => import('@/views/OwnerDetail.vue')

const routes = [
  { path: '/', redirect: '/speed/heatmap' },
  { path: '/speed/heatmap', name: 'SpeedHeatmap', component: SpeedHeatmap },
  { path: '/speed/leaderboard', name: 'SpeedLeaderboard', component: SpeedLeaderboard },
  { path: '/speed/contributors', name: 'SpeedContributors', component: SpeedContributors },
  { path: '/speed/efficiency', name: 'SpeedEfficiency', component: SpeedEfficiency },
  { path: '/speed/cloud', name: 'SpeedCloud', component: SpeedCloud },
  { path: '/swe', redirect: '/swe/shared' },
  { path: '/swe/shared', name: 'SweShared', component: SweShared },
  { path: '/swe/norm', name: 'SweNorm', component: SweNorm },
  { path: '/swe/comp', name: 'SweComp', component: SweComp },
  { path: '/swe/scorecard', name: 'SweScorecard', component: SweScorecard },
  { path: '/swe/by-domain', name: 'SweByDomain', component: SweByDomain },
  { path: '/swe/exam-history', name: 'SweExamHistory', component: SweExamHistory },
  { path: '/model/:alias', name: 'ModelDetail', component: ModelDetail, props: true },
  { path: '/owner/:id', name: 'OwnerDetail', component: OwnerDetail, props: true },
  { path: '/:pathMatch(.*)*', redirect: '/speed/heatmap' }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
