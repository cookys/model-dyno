// The fold's sub-table is sorted by clicked header (src/lib/variantSort.ts).
// The two properties that matter for reading a board: a missing measurement never
// climbs to the top when you flip direction, and equal values keep their input order
// so the table doesn't reshuffle under the reader.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname

async function loadVariantSort() {
  const source = readFileSync(join(root, 'src/lib/variantSort.ts'), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const rows = [
  { cell: 'a', perMin: 0.4, acc: 0.85 },
  { cell: 'b', perMin: null, acc: 0.9 },
  { cell: 'c', perMin: 1.2, acc: 0.6 },
  { cell: 'd', perMin: 0.4, acc: 0.5 },
]

test('numeric sort, both directions, nulls last', async () => {
  const { sortVariants } = await loadVariantSort()
  const desc = sortVariants(rows, (r) => r.perMin, 'desc').map((r) => r.cell)
  const asc = sortVariants(rows, (r) => r.perMin, 'asc').map((r) => r.cell)
  assert.deepEqual(desc, ['c', 'a', 'd', 'b'])
  assert.deepEqual(asc, ['a', 'd', 'c', 'b'])
  assert.equal(desc.at(-1), 'b', 'unmeasured cell stays last when descending')
  assert.equal(asc.at(-1), 'b', 'unmeasured cell stays last when ascending too')
})

test('ties keep input order (stable)', async () => {
  const { sortVariants } = await loadVariantSort()
  const out = sortVariants(rows, (r) => r.perMin, 'desc')
  assert.deepEqual(out.filter((r) => r.perMin === 0.4).map((r) => r.cell), ['a', 'd'])
})

test('input array is never mutated', async () => {
  const { sortVariants } = await loadVariantSort()
  const before = rows.map((r) => r.cell)
  sortVariants(rows, (r) => r.perMin, 'asc')
  assert.deepEqual(rows.map((r) => r.cell), before)
})

test('text sort is natural, blanks last', async () => {
  const { sortVariants } = await loadVariantSort()
  const tags = [
    { cell: 'x', engine: 'sglang' },
    { cell: 'y', engine: undefined },
    { cell: 'z', engine: 'llama.cpp' },
  ]
  assert.deepEqual(sortVariants(tags, (r) => r.engine, 'asc').map((r) => r.cell), ['z', 'x', 'y'])
  assert.deepEqual(sortVariants(tags, (r) => r.engine, 'desc').map((r) => r.cell), ['x', 'z', 'y'])
})

test('pass rate sorts numerically, not lexically', async () => {
  const { compareVariantValues } = await loadVariantSort()
  // The bug this guards: sorting on the formatted "85.3%" string put 100% below 85.3%.
  assert.ok(compareVariantValues(1.0, 0.853, 'desc') < 0)
})

test('no sortVal returns a copy in input order', async () => {
  const { sortVariants } = await loadVariantSort()
  const out = sortVariants(rows, null, 'desc')
  assert.deepEqual(out.map((r) => r.cell), rows.map((r) => r.cell))
  assert.notEqual(out, rows)
})

test('partial-exam variants never rank on pass rate', async () => {
  const { sortVariants } = await loadVariantSort()
  // A pass rate over a partial exam is a different quantity: 6/6 on a sixth of the
  // tasks is not 100%. The column accessor drops it to null so it sinks either way.
  const accSortVal = (v) => (v.accComparable ? v.accRaw : null)
  const cells = [
    { cell: 'full-low', accRaw: 0.5, accComparable: true },
    { cell: 'partial-perfect', accRaw: 1.0, accComparable: false },
    { cell: 'full-high', accRaw: 0.85, accComparable: true },
    { cell: 'partial-zero', accRaw: 0.0, accComparable: false },
  ]
  assert.deepEqual(
    sortVariants(cells, accSortVal, 'desc').map((r) => r.cell),
    ['full-high', 'full-low', 'partial-perfect', 'partial-zero'],
  )
  assert.deepEqual(
    sortVariants(cells, accSortVal, 'asc').map((r) => r.cell),
    ['full-low', 'full-high', 'partial-perfect', 'partial-zero'],
  )
})

test('the sub-table wires that rule to the pass-rate column', () => {
  // Guards the two halves staying connected: the view has to emit the flag and the
  // column has to consult it. Either alone silently restores the old ranking.
  const view = readFileSync(join(root, 'src/views/SpeedCloud.vue'), 'utf8')
  const table = readFileSync(join(root, 'src/components/SpeedVariants.vue'), 'utf8')
  assert.match(view, /accComparable:/, 'SpeedCloud must mark each variant comparable-or-not')
  assert.match(table, /key: 'acc'[^\n]*accComparable \? v\.accRaw : null/)
})

test('the efficiency fold shows a pass RATE and keeps partials out of its ranking', () => {
  // It showed passed/n only — the count, never the rate the outer board ranks on.
  const view = readFileSync(join(root, 'src/views/SpeedEfficiency.vue'), 'utf8')
  assert.match(view, /accPct:/, 'route rows carry a formatted pass rate')
  assert.match(view, /accSortable: classifyCell\([^)]*\)\.rankable \? num\(c\.acc\) : null/,
    'a partial-exam route contributes no sortable pass rate')
  assert.match(view, /key: 'acc'[^\n]*sortVal: \(r\) => r\.accSortable/)
  assert.match(view, /foldSort\.sortRows\(row\.routeRows\)/, 'the fold renders in the clicked order')
})

test('the efficiency cover row follows the active sort', () => {
  // A folded row shows ONE route. Picking it by a fixed rule while the reader ranks by
  // another column puts a number on screen that is not the number being ranked.
  const view = readFileSync(join(root, 'src/views/SpeedEfficiency.vue'), 'utf8')
  assert.match(view, /@sort-change="onSortChange"/, 'the board reports its active sort')
  assert.match(view, /groupByCanonicalModel\(\s*boardFilter\.applyTo\(eligibleCells\.value\),\s*chooseBySort/,
    'folding picks the representative with the sort-aware chooser')
  // Comparability must still win first, or flipping the arrow promotes a partial cell.
  const chooser = view.slice(view.indexOf('const chooseBySort'), view.indexOf('const chooseBySort') + 400)
  assert.match(chooser, /rankFirst: \(c\) => comparableRank\(c\)/)
})

test('a pool big enough does not mean one allocation can be that big', async () => {
  // The Strix Halo case: ~100GB available, ~61GB per hipMalloc. llama.cpp asks for the
  // whole weight buffer at once, so a 78GB model that comfortably fits still fails to
  // load and has to be split. Reporting that as "does not fit" is a different — and for
  // a MoE model, much more expensive — answer than "must split".
  const src = readFileSync(join(root, 'src/lib/hardware.ts'), 'utf8')
  // fitVerdict is pure; the module's other exports are Vue computeds over the store, so
  // the imports are replaced with the smallest stubs that let the module evaluate.
  const stubs = 'const computed = (f) => ({ get value() { return f() } });'
    + 'const machines = { value: [] }; const modelFootprints = { value: [] };'
  const output = ts.transpileModule(stubs + src.replace(/^import .*$/gm, ''), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const { fitVerdict } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

  assert.equal(fitVerdict(78.65, 100, 61), 'split', 'room but no single buffer that large')
  assert.equal(fitVerdict(78.65, 96, null), 'fits', 'no cap recorded and plenty of room')
  assert.equal(fitVerdict(78.65, 64, 64), 'no', 'pool itself is too small')
  assert.equal(fitVerdict(59, 61, 61), 'tight', 'fits under the cap but leaves no context room')
  assert.equal(fitVerdict(78.65, null, 61), 'unknown', 'an unknown pool is never a verdict')
})
