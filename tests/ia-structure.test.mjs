// The IA rules four independent reviewers converged on, as assertions.
//
// They are here because each one is invisible when it breaks: a landing page silently
// reverts to the wrong route in a merge, a new board gets filed under the tab whose URL
// prefix it happens to share, a label drifts back to repo vocabulary. Nothing else in the
// suite compares what the nav CLAIMS to group against what the data actually is.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const router = readFileSync(join(root, 'src/router.ts'), 'utf8')
const app = readFileSync(join(root, 'src/App.vue'), 'utf8')
const i18n = readFileSync(join(root, 'src/lib/i18n.ts'), 'utf8')

test('the front door is the board that answers the reader\'s decision', () => {
  // Not the raw tok/s heatmap: that is an input to the decision, not the decision.
  assert.match(router, /path: '\/', redirect: '\/swe\/comp'/)
  assert.match(router, /pathMatch\(\.\*\)\*', redirect: '\/swe\/comp'/)
})

test('every route that existed still resolves', () => {
  // Hash URLs from this board are pasted into notes across the fleet. The IA change is
  // labels and grouping; deleting a path would break the installed base for nothing.
  for (const path of [
    '/speed/heatmap', '/speed/leaderboard', '/speed/contributors',
    '/speed/efficiency', '/speed/cloud',
    '/swe/shared', '/swe/norm', '/swe/comp', '/swe/scorecard',
    '/swe/by-domain', '/swe/exam-history',
  ]) {
    assert.ok(router.includes(`path: '${path}'`), `${path} must still be routable`)
  }
})

test('the exam boards are grouped with the exam, not with the word in their URL', () => {
  // /speed/efficiency and /speed/cloud read the same cells as the whole exam tab. They sat
  // under "speed" because their headline number is a rate, which split one dataset across
  // two tabs and hid them from anyone looking for exam results.
  assert.match(app, /const EXAM_ROUTES = new Set\(\['\/speed\/efficiency', '\/speed\/cloud'\]\)/)
  const speedNav = app.slice(app.indexOf('<!-- Speed Sub Navigation -->'), app.indexOf('<!-- SWE Sub Navigation -->'))
  assert.ok(!speedNav.includes('/speed/efficiency'), 'efficiency must not sit in the raw-speed nav')
  assert.ok(!speedNav.includes('/speed/cloud'), 'the route board must not sit in the raw-speed nav')
  const examNav = app.slice(app.indexOf('<!-- SWE Sub Navigation -->'))
  assert.ok(examNav.includes('/speed/efficiency') && examNav.includes('/speed/cloud'))
  // ...and the leaderboard leads it.
  assert.ok(examNav.indexOf('/swe/comp') < examNav.indexOf('/swe/scorecard'))
})

test('nav labels are not repo vocabulary', () => {
  // "Full canonical", "Scorecard Details", "Route agentic throughput" are what the
  // producer calls these things. A reader arriving from a link is not a contributor.
  // Scoped to the strings a reader NAVIGATES by. Methodology tooltips may and should
  // still say "full canonical runs only" — there it is a precise qualifier, not a label.
  const navKeys = /"(tab|subtab|crumb|idx)\.[\w.]*":\s*"([^"]*)"/g
  for (const [, , label] of i18n.matchAll(navKeys)) {
    for (const jargon of ['Full canonical', 'Scorecard Details', 'Route agentic throughput', 'Shared Leaderboard']) {
      assert.ok(!label.includes(jargon), `nav label still reads as repo vocabulary: ${jargon}`)
    }
  }
})
