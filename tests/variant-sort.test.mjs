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
