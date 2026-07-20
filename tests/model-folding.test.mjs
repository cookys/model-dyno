import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

async function loadFoldingModule() {
  const source = read('src/lib/modelFolding.ts')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

test('canonical folding exact-merges only identity.canonical_model', async () => {
  const { groupByCanonicalModel, chooseBestCompCell, variantCount } = await loadFoldingModule()
  const rows = [
    { cell: 'route-a', model: 'provider text A', identity: { canonical_model: 'Grok-4.5' }, comparable: true, acc: 0.5, ci_lo: 0.4, n: 10 },
    { cell: 'route-b', model: 'provider text B', identity: { canonical_model: 'grok-4.5' }, comparable: true, acc: 0.6, ci_lo: 0.5, n: 10 },
  ]

  const groups = groupByCanonicalModel(rows, chooseBestCompCell)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].representative.cell, 'route-b')
  assert.equal(variantCount(groups[0]), 1)
})

test('missing identity preserves separate rows and never merges on raw model text', async () => {
  const { groupByCanonicalModel, chooseBestCompCell } = await loadFoldingModule()
  const rows = [
    { cell: 'route-a', model: 'same raw model', comparable: true, acc: 0.5, ci_lo: 0.4, n: 10 },
    { cell: 'route-b', model: 'same raw model', comparable: true, acc: 0.9, ci_lo: 0.8, n: 10 },
  ]

  const groups = groupByCanonicalModel(rows, chooseBestCompCell)

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.representative.cell), ['route-a', 'route-b'])
})

test('similar canonical names do not fuzzy-merge pro and pro-preview variants', async () => {
  const { groupByCanonicalModel, chooseBestCompCell } = await loadFoldingModule()
  const rows = [
    { cell: 'pro', identity: { canonical_model: 'gpt-5-pro' }, comparable: true, acc: 0.7, ci_lo: 0.6, n: 10 },
    { cell: 'preview', identity: { canonical_model: 'gpt-5-pro-preview' }, comparable: true, acc: 0.8, ci_lo: 0.7, n: 10 },
  ]

  const groups = groupByCanonicalModel(rows, chooseBestCompCell)

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((g) => g.canonicalModel), ['gpt-5-pro', 'gpt-5-pro-preview'])
})

test('representative selection ranks comparable cells before prettier partial scores', async () => {
  const { chooseBestScorecardCell, chooseBestCompCell, chooseBestNormCell } = await loadFoldingModule()
  const partialScorecard = { model: 'm', comparable: false, headline: 1, headline_ci: [0.8, 1], n_graded: 2, solved_per_hour: 10 }
  const comparableScorecard = { model: 'm', comparable: true, headline: 0.5, headline_ci: [0.3, 0.7], n_graded: 20, solved_per_hour: 1 }
  const partialComp = { cell: 'm', comparable: false, acc: 1, ci_lo: 0.8, n: 2, solved_per_hour: 10, sec_per_solved: 1 }
  const comparableComp = { cell: 'm', comparable: true, acc: 0.5, ci_lo: 0.3, n: 20, solved_per_hour: 1, sec_per_solved: 100 }
  const partialNorm = { model: 'm', comparable: false, pass_rate: 1, ci: [0.8, 1], coverage: 0.1 }
  const comparableNorm = { model: 'm', comparable: true, pass_rate: 0.5, ci: [0.3, 0.7], coverage: 1 }

  assert.equal(chooseBestScorecardCell(partialScorecard, comparableScorecard), comparableScorecard)
  assert.equal(chooseBestCompCell(partialComp, comparableComp), comparableComp)
  assert.equal(chooseBestNormCell(partialNorm, comparableNorm), comparableNorm)
})

test('representative selection uses Wilson lower bound before raw pass rate', async () => {
  const { chooseBestScorecardCell, chooseBestCompCell, chooseBestNormCell } = await loadFoldingModule()
  const luckyScorecard = { model: 'm', comparable: true, headline: 0.9, headline_ci: [0.2, 0.98], n_graded: 10, solved_per_hour: 10 }
  const robustScorecard = { model: 'm', comparable: true, headline: 0.7, headline_ci: [0.5, 0.85], n_graded: 10, solved_per_hour: 1 }
  const luckyComp = { cell: 'm', comparable: true, acc: 0.9, ci_lo: 0.2, n: 10, solved_per_hour: 10, sec_per_solved: 1 }
  const robustComp = { cell: 'm', comparable: true, acc: 0.7, ci_lo: 0.5, n: 10, solved_per_hour: 1, sec_per_solved: 100 }
  const luckyNorm = { model: 'm', comparable: true, pass_rate: 0.9, ci: [0.2, 0.98], coverage: 1 }
  const robustNorm = { model: 'm', comparable: true, pass_rate: 0.7, ci: [0.5, 0.85], coverage: 1 }

  assert.equal(chooseBestScorecardCell(luckyScorecard, robustScorecard), robustScorecard)
  assert.equal(chooseBestCompCell(luckyComp, robustComp), robustComp)
  assert.equal(chooseBestNormCell(luckyNorm, robustNorm), robustNorm)
})

test('scorecard chart and table share folded representatives', () => {
  const view = read('src/views/SweScorecard.vue')

  assert.match(view, /const foldedScorecardGroups = computed/)
  assert.match(view, /const scorecardRows = computed\(\(\) => \{/)
  assert.match(view, /const data = scorecardRows\.value/)
  assert.match(view, /:rows="scorecardRows"/)
})

test('COMP default is folded but model query remains route-level drilldown', () => {
  const view = read('src/views/SweComp.vue')

  assert.match(view, /if \(!modelFilter\.value\) return foldedCompRows\.value/)
  assert.match(view, /return rawCompRows\.value\.filter/)
  assert.match(view, /normalizeCanonicalModel\(recordCanonicalModel\(r\._rec\)\) === modelKey/)
})

test('route-first speed cloud page does not import or apply model folding', () => {
  const view = read('src/views/SpeedCloud.vue')

  assert.doesNotMatch(view, /modelFolding/)
  assert.doesNotMatch(view, /groupByCanonicalModel/)
})

test('speed efficiency folds by canonical model with speed-first drilldown', () => {
  const view = read('src/views/SpeedEfficiency.vue')

  assert.match(view, /groupByCanonicalModel/)
  assert.match(view, /chooseFastestEfficiencyCell/)
  assert.doesNotMatch(view, /chooseBestCompCell/)
  assert.match(view, /solved_per_hour/)
  assert.match(view, /selectedRoutes/)
  assert.match(view, /addEventListener\('click'/)
  assert.match(view, /scrollIntoView/)
  assert.match(view, /detailFlash/)
})
