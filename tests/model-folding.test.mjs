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
  // plan 053: chart + main table use rankable FULL partition of folded rows
  assert.match(view, /const mainScorecardData = computed/)
  assert.match(view, /const data = mainScorecardData\.value/)
  assert.match(view, /:rows="mainScorecardData"/)
  assert.match(view, /incompleteScorecardData/)
})

test('COMP default is folded but model query remains route-level drilldown', () => {
  const view = read('src/views/SweComp.vue')

  // plan 053: model filter → raw rows; else folded, then partition main/incomplete
  assert.match(view, /if \(modelFilter\.value\)/)
  assert.match(view, /return rawCompRows\.value\.filter/)
  assert.match(view, /return foldedCompRows\.value/)
  assert.match(view, /normalizeCanonicalModel\(recordCanonicalModel\(r\._rec\)\) === modelKey/)
  assert.match(view, /partitionBySection/)
  assert.match(view, /mainCompData/)
  assert.match(view, /incompleteCompData/)
})

test('speed cloud folds by canonical model with a sort-aware representative', () => {
  const view = read('src/views/SpeedCloud.vue')

  // REVERSAL, 2026-08-18, at the owner's explicit request (twice). This page used to
  // assert the OPPOSITE — that it must not fold — on the grounds that it is the
  // route-first board. That reasoning held while it listed a handful of routes per
  // model. It stopped holding at 163 rows for 72 models, one model contributing 23 of
  // them: an unfoldable board is not a drilldown, it is a wall, and the owner reported
  // it as unreadable rather than as detailed.
  //
  // The routes are not lost — they moved into the row expansion, where comparing them
  // is a deliberate act instead of the default state, and they are shown as tag COLUMNS
  // rather than cell slugs.
  assert.match(view, /groupByCanonicalModel/)

  // The representative must follow the active sort: accuracy-first by default (matching
  // /swe/comp), speed-first once the reader ranks by a speed column. A folded row that
  // shows its most accurate member while the reader ranks by throughput is answering a
  // question nobody asked.
  assert.match(view, /chooseBestCompCell/)
  assert.match(view, /chooseBestSpeedCell/)
  assert.match(view, /SPEED_SORT_KEYS/)
  assert.match(view, /@sort-change="onSortChange"/)
})

test('folded variant panels identify a config by tags, never by its cell slug', () => {
  const panel = read('src/components/SpeedVariants.vue')

  // The whole point of the tag vocabulary is that a reader should not have to parse
  // `qwen3.8-27b-nvfp4-sglang-thinkon-t0-dspark-local` to learn what a row is.
  for (const dim of ['thinking', 'effort', 'temp', 'draft', 'engine']) {
    assert.match(panel, new RegExp(`tags\\.${dim}`))
  }
})

test('speed efficiency folds by canonical model with speed-first drilldown', () => {
  const view = read('src/views/SpeedEfficiency.vue')

  assert.match(view, /groupByCanonicalModel/)
  assert.match(view, /chooseFastestEfficiencyCell/)
  assert.doesNotMatch(view, /chooseBestCompCell/)
  // plan 052: pass-conditioned throughput helper (not raw fail-taxed solved_per_hour)
  assert.match(view, /primarySolvedPerHourOf/)
  assert.match(view, /selectedRoutes/)
  assert.match(view, /addEventListener\('click'/)
  assert.match(view, /scrollIntoView/)
  assert.match(view, /detailFlash/)
})
