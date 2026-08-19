import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

const FOLD_VIEWS = ['src/views/SweComp.vue', 'src/views/SweNorm.vue', 'src/views/SweScorecard.vue']

test('a variant row links to its model page, and only when that page has content', () => {
  const lib = read('src/lib/modelLink.ts')

  // The union of the three sources ModelDetail fills itself from — miss one and rows that
  // do have a page render as dead text.
  assert.match(lib, /for \(const r of dashboardRecords\.value\) add\(r\.model_alias\)/)
  assert.match(lib, /for \(const c of scorecardSweCells\.value\)/)
  assert.match(lib, /for \(const f of modelFootprints\.value\) add\(f\.alias\)/)

  // No entry -> no link. A link to an empty model page is worse than plain text.
  assert.match(lib, /return null/)
  assert.match(lib, /`#\/model\/\$\{encodeURIComponent\(alias\)\}`/)
})

test('speed records claim an alias first so the routed spelling survives ModelDetail strict match', () => {
  const lib = read('src/lib/modelLink.ts')
  const speedAt = lib.indexOf('dashboardRecords.value')
  const sweAt = lib.indexOf('scorecardSweCells.value')
  const footprintAt = lib.indexOf('modelFootprints.value')
  assert.ok(speedAt > 0 && speedAt < sweAt && sweAt < footprintAt)
  assert.match(lib, /if \(!key \|\| map\.has\(key\)\) return/)
})

test('every folded sub-table in the exam boards routes its model name', () => {
  for (const path of FOLD_VIEWS) {
    const view = read(path)
    assert.match(view, /from '@\/lib\/modelLink'/, path)
    assert.match(view, /href: modelPageHref\(v\),/, path)

    const nameCells = view.match(/\{\{ variant\.model \}\}/g) || []
    const linked = view.match(/<a v-if="variant\.href" :href="variant\.href"/g) || []
    // Each rendered name is a link/plain-text pair, so the name appears twice per site.
    assert.equal(nameCells.length, linked.length * 2, path)
    assert.ok(linked.length > 0, path)
  }
})
