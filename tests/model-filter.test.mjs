import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

async function loadFilterModule() {
  const output = ts.transpileModule(read('src/lib/modelFilter.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const cell = (model, publisher) => ({ identity: { canonical_model: model }, publisher })

// The live grok family: five cells, one vendor, and one of them is a Kimi checkpoint
// shipped by xAI — the case that makes prefix-matching wrong.
const GROK_FAMILY = [
  cell('grok-4.5', 'xAI'),
  cell('grok-4.6', 'xAI'),
  cell('grok-4.6', 'xAI'),            // the xhigh leg — same canonical model, different cell
  cell('grok-build', 'xAI'),
  cell('grok-composer-2.5', 'xAI'),
]
const OTHERS = [
  cell('kimi-k2.6', 'Moonshot'),
  cell('deepseek-v4-pro', 'DeepSeek'),
]

test('publisher filter selects the whole vendor family, model filter does not', async () => {
  const { readFilters, filterRows } = await loadFilterModule()
  const rows = [...GROK_FAMILY, ...OTHERS]

  const family = filterRows(rows, readFilters({ publisher: 'xAI' }))
  assert.equal(family.length, 5, 'publisher=xAI must return every grok cell')

  // The pre-existing behaviour: exact canonical model only. This is precisely why a
  // family level was needed — pinning grok-4.6 hides 4.5 / build / composer.
  const single = filterRows(rows, readFilters({ model: 'grok-4.6' }))
  assert.equal(single.length, 2, 'model=grok-4.6 matches only its own two cells')
})

test('publisher match is case- and whitespace-insensitive', async () => {
  const { readFilters, filterRows } = await loadFilterModule()
  for (const q of ['xai', 'XAI', '  xAI  ']) {
    assert.equal(filterRows(GROK_FAMILY, readFilters({ publisher: q })).length, 5, q)
  }
})

test('a cell with no publisher never joins a family', async () => {
  const { readFilters, filterRows } = await loadFilterModule()
  // Local abliterations/merges are intentionally publisher-less in the registry (never
  // guess a vendor). They must drop out of a family view rather than be lumped in.
  const rows = [...GROK_FAMILY, cell('huihui-3.6-27b', undefined), cell('qwopus-3.6-27b', '')]
  assert.equal(filterRows(rows, readFilters({ publisher: 'xAI' })).length, 5)
})

test('both keys compose as AND, with no hidden precedence', async () => {
  const { readFilters, filterRows } = await loadFilterModule()
  const rows = [...GROK_FAMILY, ...OTHERS]
  const both = filterRows(rows, readFilters({ model: 'grok-4.6', publisher: 'xAI' }))
  assert.equal(both.length, 2)
  const contradictory = filterRows(rows, readFilters({ model: 'grok-4.6', publisher: 'Moonshot' }))
  assert.equal(contradictory.length, 0, 'contradictory pair yields empty, not a silent winner')
})

test('setFilterQuery swaps levels instead of intersecting them', async () => {
  const { setFilterQuery } = await loadFilterModule()
  // Clicking a vendor while a model is pinned must WIDEN to the family. Keeping both
  // would leave the old model key in place and render an always-narrow board.
  const widened = setFilterQuery({ model: 'grok-4.6', lens: 'value' }, { kind: 'publisher', value: 'xAI' })
  assert.deepEqual(widened, { lens: 'value', publisher: 'xAI' })

  const narrowed = setFilterQuery({ publisher: 'xAI' }, { kind: 'model', value: 'grok-4.6' })
  assert.deepEqual(narrowed, { model: 'grok-4.6' })

  const cleared = setFilterQuery({ publisher: 'xAI', lens: 'value' }, null)
  assert.deepEqual(cleared, { lens: 'value' }, 'clearing keeps unrelated query state')
})

test('array-valued query params take the first entry', async () => {
  const { readFilters } = await loadFilterModule()
  // vue-router yields string[] when a key repeats; a raw === compare would silently
  // match nothing.
  assert.deepEqual(readFilters({ publisher: ['xAI', 'Moonshot'] }), [{ kind: 'publisher', value: 'xAI' }])
  assert.deepEqual(readFilters({ model: [] }), [])
  assert.deepEqual(readFilters({ publisher: '   ' }), [], 'blank is not a filter')
  assert.deepEqual(readFilters(null), [])
})

test('filterRows can reach into view-model wrappers', async () => {
  const { readFilters, filterRows } = await loadFilterModule()
  const rows = GROK_FAMILY.map((c, i) => ({ label: `row${i}`, _rec: c }))
  const out = filterRows(rows, readFilters({ publisher: 'xAI' }), (r) => r._rec)
  assert.equal(out.length, 5)
  assert.equal(out[0].label, 'row0', 'the wrapper row is returned, not the inner record')
})

test('publishersOf lists distinct vendors for a jump affordance', async () => {
  const { publishersOf } = await loadFilterModule()
  assert.deepEqual(publishersOf([...GROK_FAMILY, ...OTHERS]), ['DeepSeek', 'Moonshot', 'xAI'])
})

// ── board wiring (architectural guard, same style as model-folding.test.mjs) ───────────

const FILTERED_BOARDS = [
  'src/views/SpeedEfficiency.vue',
  'src/views/SpeedCloud.vue',
  'src/views/SweComp.vue',
  'src/views/SweNorm.vue',
  'src/views/SweScorecard.vue',
]

test('every ranking board applies the shared filter and shows the shared banner', () => {
  for (const path of FILTERED_BOARDS) {
    const view = read(path)
    assert.match(view, /useBoardFilter/, `${path} must use the shared filter`)
    assert.match(view, /boardFilter\.applyTo/, `${path} must actually narrow its rows`)
    assert.match(view, /<BoardFilterBanner/, `${path} must show the active filter`)
  }
})

test('the vendor entry point never offers a filter for a publisher-less row', () => {
  // Local abliterations/merges are deliberately publisher-less in the registry. Offering
  // a family filter on their display fallback (operator / "local" / harness) would empty
  // the board instead of narrowing it.
  for (const path of ['src/views/SweComp.vue', 'src/views/SweNorm.vue']) {
    const view = read(path)
    assert.match(
      view,
      /orgCell\(r\.publisher, r\.publisher \? \(\) => boardFilter\.filterByPublisher\(r\.publisher\) : undefined\)/,
      `${path} must gate the click on a real publisher`,
    )
  }
  // Both speed boards offer an explicit vendor <select>, not a legend gesture: Vega-Lite
  // legends are non-interactive unless a selection is bound, so a legend click never
  // reaches the view handler (verified in-browser, label and swatch both dead).
  for (const path of ['src/views/SpeedEfficiency.vue', 'src/views/SpeedCloud.vue']) {
    const view = read(path)
    assert.match(view, /publishersOf/, `${path} must derive options from real publishers`)
    assert.doesNotMatch(view, /datum\?\.value/, `${path} must not rely on a legend click`)
  }
})

test('COMP keeps folded-by-default and route drilldown while gaining the family view', () => {
  const view = read('src/views/SweComp.vue')
  // The family filter narrows the FOLDED rows; ?model= still opens raw routes.
  assert.match(view, /if \(!boardFilter\.filters\.value\.length\) return foldedCompRows\.value/)
  assert.match(view, /return boardFilter\.applyTo\(foldedCompRows\.value, \(r\) => r\._rec\)/)
})

test('the filter module stays vue-free so it remains unit-testable', () => {
  const src = read('src/lib/modelFilter.ts')
  assert.doesNotMatch(src, /from 'vue/, 'pure logic must not import vue')
})
