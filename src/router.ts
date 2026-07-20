import { createRouter, createWebHashHistory } from 'vue-router'

import SpeedHeatmap from '@/views/SpeedHeatmap.vue'
import SpeedLeaderboard from '@/views/SpeedLeaderboard.vue'
import SpeedContributors from '@/views/SpeedContributors.vue'
import SpeedEfficiency from '@/views/SpeedEfficiency.vue'
import SpeedCloud from '@/views/SpeedCloud.vue'
import SweShared from '@/views/SweShared.vue'
import SweNorm from '@/views/SweNorm.vue'
import SweComp from '@/views/SweComp.vue'
import SweScorecard from '@/views/SweScorecard.vue'
import SweByDomain from '@/views/SweByDomain.vue'
import SweExamHistory from '@/views/ExamHistory.vue'
import ModelDetail from '@/views/ModelDetail.vue'
import OwnerDetail from '@/views/OwnerDetail.vue'

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
