/**
 * Regression: when feed current_exam is a subset-only exam (34t-5da1edf9),
 * Ranking / Pick-for-me must still default to the prior full exam (34t-559c010f).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const FULL_EXAM = '34t-559c010f'
const SUBSET_EXAM = '34t-5da1edf9'
const MIN_GRADED = 8

async function importTsModule(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output, 'utf8').toString('base64')}`)
}

async function loadCommittedSnapshot() {
  const { loadPublicBundleDashboardFeed } = await importTsModule('src/lib/publicBundle.ts')
  const snapshot = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (k) => (k === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(snapshot),
    json: async () => snapshot,
  })
  try {
    return { snapshot, projection: await loadPublicBundleDashboardFeed('./snapshot.json') }
  } finally {
    globalThis.fetch = originalFetch
  }
}

function rankableFoldedCount(cells, meta, folding, runClass, examMeta) {
  const { groupByCanonicalModel, chooseBestScorecardCell } = folding
  const { classifyCell } = runClass
  const { resolveExamMeta } = examMeta
  const exam = resolveExamMeta(meta)
  const folded = groupByCanonicalModel(
    cells,
    chooseBestScorecardCell,
    (c) => `${c.model}-${c.profile || ''}-${c.machine || ''}-${c.canonical_version || ''}`,
  )
  let n = 0
  for (const group of folded) {
    const c = group.representative
    const cls = classifyCell(
      {
        n_graded: c.n_graded,
        comparable: c.comparable,
        owed: c.owed,
        n_exam: c.n_canon ?? c.n_exam,
        n_canon: c.n_canon,
      },
      exam,
    )
    if (cls.rankable && (c.n_graded || 0) >= MIN_GRADED) n += 1
  }
  return n
}

test('pickSelectedExam defaults to the full-exam version when current_exam is subset-only', async () => {
  const { pickSelectedExam } = await importTsModule('src/lib/examSelect.ts')
  const versions = [
    { version: '40t-old', label: 'old', name: 'old', date: null, note: null, n_tasks: 40, current: false },
    { version: FULL_EXAM, label: 'full', name: 'full', date: null, note: null, n_tasks: 34, current: false },
    { version: SUBSET_EXAM, label: 'subset', name: 'subset', date: null, note: 'rollover', n_tasks: 34, current: true },
  ]
  const cells = [
    { canonical_version: FULL_EXAM, comparable: true },
    { canonical_version: FULL_EXAM, comparable: true },
    { canonical_version: SUBSET_EXAM, comparable: false },
    { canonical_version: SUBSET_EXAM, comparable: false },
  ]
  assert.equal(pickSelectedExam(null, versions, SUBSET_EXAM, cells), FULL_EXAM)
  assert.equal(pickSelectedExam(SUBSET_EXAM, versions, SUBSET_EXAM, cells), SUBSET_EXAM)
  assert.equal(pickSelectedExam(null, versions, SUBSET_EXAM, null), SUBSET_EXAM)
})

test('default Ranking scope matches full-exam 34t-559c010f row count (data-derived)', async () => {
  const { projection } = await loadCommittedSnapshot()
  const { pickSelectedExam } = await importTsModule('src/lib/examSelect.ts')
  const folding = await importTsModule('src/lib/modelFolding.ts')
  const runClass = await importTsModule('src/lib/runClass.ts')
  const examMeta = await importTsModule('src/lib/examMeta.ts')

  const versions = projection.meta?.exam_versions || []
  const cells = projection.cells
  const selected = pickSelectedExam(null, versions, projection.meta?.current_exam, cells)
  assert.equal(selected, FULL_EXAM)

  const defaultCells = cells.filter((c) => c.canonical_version === selected)
  const fullCells = cells.filter((c) => c.canonical_version === FULL_EXAM)
  const defaultRanked = rankableFoldedCount(defaultCells, projection.meta, folding, runClass, examMeta)
  const fullRanked = rankableFoldedCount(fullCells, projection.meta, folding, runClass, examMeta)

  assert.equal(defaultRanked, fullRanked)
  assert.ok(defaultRanked > 0, 'default ranking must not be empty')

  const subsetCells = cells.filter((c) => c.canonical_version === SUBSET_EXAM)
  const subsetRanked = rankableFoldedCount(subsetCells, projection.meta, folding, runClass, examMeta)
  assert.equal(subsetRanked, 0)
})

test('selecting subset exam 34t-5da1edf9 yields 12 rows with subset labels', async () => {
  const { projection } = await loadCommittedSnapshot()
  const { subsetCoverageLabel, subsetDenomForExam } = await importTsModule('src/lib/examDisplay.ts')

  const subsetCells = projection.cells.filter((c) => c.canonical_version === SUBSET_EXAM)
  assert.equal(subsetCells.length, 12)
  assert.ok(subsetCells.every((c) => c.comparable !== true))

  const denom = subsetDenomForExam(subsetCells)
  assert.equal(denom, 26)

  const labels = subsetCells.map((c) => subsetCoverageLabel(c.n_graded, denom, true))
  assert.equal(labels.length, 12)
  for (const label of labels) {
    assert.ok(label, 'each subset cell needs a label')
    assert.match(label, /^子集\(\d+\/26 題\)$/)
  }
  assert.ok(labels.some((l) => l === '子集(26/26 題)'))
  assert.ok(labels.some((l) => l === '子集(25/26 題)'))
})
