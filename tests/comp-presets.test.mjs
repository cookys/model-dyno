import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

// The spec's key sequences, duplicated here on purpose: a test that imported the table it
// is checking would pass no matter what the table said.
const EXPECTED = {
  overview: ['publisher', 'model', 'operator', 'harness', 'machine', 'n', 'eff', 'secSolved', 'usage', 'agency'],
  scorecard: ['publisher', 'model', 'operator', 'machine', 'n', 'coverage', 'eff', 'agency', 'usage'],
  throughput: ['publisher', 'model', 'operator', 'machine', 'eff', 'secSolved', 'perHour', 'tokS', 'medWall'],
}

/** Read one preset's key list out of the source without executing TypeScript. */
function presetKeys(source, id) {
  const line = new RegExp(`^\\s*${id}: \\[(.*)\\],?$`, 'm').exec(source)
  assert.ok(line, `preset ${id} is not declared in compPresets.ts`)
  return line[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

test('the landing view keeps the column sequence the board has always shown', () => {
  // /swe/comp is the front door. A preset system that quietly re-columns the default
  // view changes what every stranger from a pasted link sees first.
  const lib = read('src/lib/compPresets.ts')
  assert.deepEqual(presetKeys(lib, 'overview'), EXPECTED.overview)
  assert.match(lib, /export const DEFAULT_COMP_PRESET: CompPresetId = 'overview'/)
})

test('all three named views exist with exactly their specified columns', () => {
  const lib = read('src/lib/compPresets.ts')
  assert.match(lib, /export const COMP_PRESET_IDS = \['overview', 'scorecard', 'throughput'\] as const/)
  for (const [id, keys] of Object.entries(EXPECTED)) {
    assert.deepEqual(presetKeys(lib, id), keys, id)
  }
})

test('no column picker: the preset sets are fixed data, not user-assembled', () => {
  const lib = read('src/lib/compPresets.ts')
  const view = read('src/views/SweComp.vue')
  // A picker needs mutable column state; presets need none.
  assert.doesNotMatch(lib, /\bref\(/)
  assert.doesNotMatch(view, /columnPicker|visibleColumns|toggleColumn/i)
})

test('an unrecognized ?view falls back to the default instead of blanking the board', () => {
  const lib = read('src/lib/compPresets.ts')
  // Guards, in source, for each way the query can arrive wrong.
  assert.match(lib, /Array\.isArray\(raw\)/)              // ?view=a&view=b
  assert.match(lib, /typeof value !== 'string'/)           // absent
  assert.match(lib, /\.trim\(\)\.toLowerCase\(\)/)         // ' Scorecard '
  assert.match(lib, /includes\(key\)[\s\S]*DEFAULT_COMP_PRESET/) // typo -> default
})

test('the board actually renders through the preset, not merely beside it', () => {
  const view = read('src/views/SweComp.vue')
  assert.match(view, /from '@\/lib\/compPresets'/)
  // The pool is separate from what renders, and what renders is the filtered pool.
  assert.match(view, /const allCols = computed<Column<any>\[\]>/)
  assert.match(view, /const cols = computed<Column<any>\[\]>\(\(\) => applyCompPreset\(allCols\.value, preset\.value\)\)/)
  // Both tables (main + incomplete) bind the filtered list.
  assert.equal((view.match(/:columns="cols"/g) || []).length, 2)
  assert.doesNotMatch(view, /:columns="allCols"/)
})

test('the preset lives in the query so /swe/comp keeps its route', () => {
  const router = read('src/router.ts')
  assert.match(router, /\{ path: '\/swe\/comp', name: 'SweComp', component: SweComp \}/)
  // No second route was added for the lenses.
  assert.equal((router.match(/\/swe\/comp/g) || []).length, 3) // redirect, route, catch-all

  const view = read('src/views/SweComp.vue')
  assert.match(view, /resolveCompPreset\(route\.query\.view\)/)
  // replace, not push: flipping lenses must not stack back-button entries.
  assert.match(view, /router\.replace\(\{ query: \{ \.\.\.route\.query, view: id \} \}\)/)
})

test('every column a preset names exists in the pool', () => {
  const view = read('src/views/SweComp.vue')
  const declared = new Set(
    [...view.matchAll(/^\s*key: '([a-zA-Z]+)',$/gm)].map((m) => m[1])
      .concat([...view.matchAll(/^\s*\{ key: '([a-zA-Z]+)',/gm)].map((m) => m[1])),
  )
  for (const [id, keys] of Object.entries(EXPECTED)) {
    for (const key of keys) {
      assert.ok(declared.has(key), `${id} names column '${key}' but SweComp.vue declares no such column`)
    }
  }
})

test('the throughput lens keeps its speed numbers flagged', () => {
  // A speed number without its credibility chip is what this project's eval discipline
  // forbids; both throughput-only rate columns must carry it.
  const view = read('src/views/SweComp.vue')
  const perHour = /key: 'perHour',[\s\S]*?\n  \},/.exec(view)
  assert.ok(perHour, 'perHour column not found')
  assert.match(perHour[0], /speedCredibilityBadge/)
})

test('both locales carry every new preset string', () => {
  const i18n = read('src/lib/i18n.ts')
  const keys = [
    'comp.view.label',
    'comp.view.overview', 'comp.view.overview.tip',
    'comp.view.scorecard', 'comp.view.scorecard.tip',
    'comp.view.throughput', 'comp.view.throughput.tip',
  ]
  for (const key of keys) {
    const hits = (i18n.match(new RegExp(`"${key.replace(/\./g, '\\.')}":`, 'g')) || []).length
    assert.equal(hits, 2, `${key} must be defined in both en and zh`)
  }
})
