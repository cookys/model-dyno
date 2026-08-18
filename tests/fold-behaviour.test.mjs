// Every board that folds cells to one row per canonical model owes the reader the same
// two things, and each of them was missing somewhere before 2026-08-19:
//
//   1. the cover row follows the active sort — a folded row displays ONE of several
//      cells, so a cover picked by a fixed rule leaves the board ordering rows by a
//      number that is not the one on screen;
//   2. the expanded sub-table sorts by any column — the reason to open a fold is to
//      compare, and which axis matters depends on the question.
//
// This sweeps the views rather than naming them one by one, so a NEW folding board
// cannot quietly ship without both.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const viewsDir = join(root, 'src/views')

const foldingViews = readdirSync(viewsDir)
  .filter((f) => f.endsWith('.vue'))
  .map((f) => ({ name: f, src: readFileSync(join(viewsDir, f), 'utf8') }))
  .filter((v) => v.src.includes('groupByCanonicalModel('))

test('the sweep finds the folding boards it is meant to guard', () => {
  // A rename that empties this list would turn every assertion below into a no-op.
  assert.ok(foldingViews.length >= 5, `expected ≥5 folding views, found ${foldingViews.length}`)
})

for (const view of foldingViews) {
  test(`${view.name}: the cover row follows the active sort`, () => {
    assert.match(view.src, /@sort-change="onSortChange"/,
      'the board must report which column is being ranked')
    assert.match(view.src, /sortAwareChooser</,
      'the representative must be chosen with the shared sort-aware chooser')
    assert.match(view.src, /groupByCanonicalModel\([\s\S]{0,200}?chooseBySort/,
      'the sort-aware chooser must actually be the one passed to the fold')
  })

  test(`${view.name}: the folded sub-table is sortable`, () => {
    const rendersFoldHere = view.src.includes('row.variants') || view.src.includes('row.routeRows')
    if (!rendersFoldHere) {
      // SpeedCloud delegates its fold to the SpeedVariants component; that component
      // carries its own header, asserted separately below.
      assert.match(view.src, /SpeedVariants/, `${view.name} neither renders nor delegates a fold`)
      return
    }
    assert.match(view.src, /<FoldSortHeader/, 'headers must be the shared sort buttons')
    assert.match(view.src, /foldSort\.sortRows\(/, 'rows must render in the clicked order')
  })
}

test('the delegated fold component is sortable too', () => {
  const src = readFileSync(join(root, 'src/components/SpeedVariants.vue'), 'utf8')
  assert.match(src, /<FoldSortHeader/)
  assert.match(src, /sort\.sortRows</)
})

test('a pass-rate column never ranks a partial exam', () => {
  // 6/6 on a sixth of the tasks is not a 100% that outranks 29/34. Every fold that
  // offers a pass-rate column must withhold it from ranking for a partial run.
  const files = [
    ...foldingViews.map((v) => ({ name: v.name, src: v.src })),
    { name: 'SpeedVariants.vue', src: readFileSync(join(root, 'src/components/SpeedVariants.vue'), 'utf8') },
  ]
  for (const { name, src } of files) {
    const accCol = src.match(/\{ key: '(?:acc|eff)',[^\n]*\}/)
    if (!accCol) continue
    assert.match(accCol[0], /comparable \? [A-Za-z.]+ : null|accComparable \? [A-Za-z.]+ : null|accSortable/,
      `${name}: the fold's pass-rate column must return null for a partial exam`)
  }
})
