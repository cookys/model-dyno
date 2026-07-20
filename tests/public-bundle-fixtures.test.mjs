import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const fixtures = join(root, 'fixtures', 'public-bundles')
const exactBundleFiles = [
  'benches.json',
  'manifest.json',
  'runs.json',
  'scores.json',
  'subjects.json',
]
const dataFiles = exactBundleFiles.filter((name) => name !== 'manifest.json')

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function importTsModule(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText
  const encoded = Buffer.from(output, 'utf8').toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

test('checked-in PublicBundle fixtures have exact files and pinned manifest hashes', () => {
  for (const name of readdirSync(fixtures)) {
    if (name === 'README.md') continue
    const dir = join(fixtures, name)
    assert.deepEqual(readdirSync(dir).sort(), exactBundleFiles, `${name} file set`)

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    assert.match(manifest.schema_version, /^public_bundle\.v[123]$/)
    assert.equal(typeof manifest.created_at, 'string')
    assert.deepEqual(Object.keys(manifest.file_hashes).sort(), dataFiles)

    for (const file of dataFiles) {
      const text = readFileSync(join(dir, file), 'utf8')
      assert.equal(sha256(text), manifest.file_hashes[file], `${name}/${file} hash`)
    }

    const digestInput = { ...manifest }
    delete digestInput.manifest_digest
    assert.equal(sha256(canonicalJson(digestInput)), manifest.manifest_digest, `${name} manifest_digest`)
  }
})

test('PublicBundle projection builds scorecard rows without legacy INDEX fields', async () => {
  const {
    parsePublicBundle,
    projectScorecardRowsFromPublicBundle,
    projectSharedCellsFromScorecardRows,
    projectNormIndexFromScorecardRows,
    projectCompIndexFromScorecardRows,
    projectDomainIndexFromPublicBundles,
    PUBLIC_BUNDLE_SCHEMA_VERSIONS,
  } =
    await importTsModule('src/lib/publicBundle.ts')

  const bundleDir = join(fixtures, 'toy-v3')
  const bundle = parsePublicBundle({
    manifest: JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8')),
    benches: JSON.parse(readFileSync(join(bundleDir, 'benches.json'), 'utf8')),
    subjects: JSON.parse(readFileSync(join(bundleDir, 'subjects.json'), 'utf8')),
    runs: JSON.parse(readFileSync(join(bundleDir, 'runs.json'), 'utf8')),
    scores: JSON.parse(readFileSync(join(bundleDir, 'scores.json'), 'utf8')),
  })
  const rows = projectScorecardRowsFromPublicBundle(bundle)

  assert.deepEqual(PUBLIC_BUNDLE_SCHEMA_VERSIONS, ['public_bundle.v1', 'public_bundle.v2', 'public_bundle.v3'])
  assert.equal(bundle.manifest.schema_version, 'public_bundle.v3')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].model, 'dummy')
  assert.equal(rows[0].display, 'dummy')
  assert.equal(rows[0].source, 'public-bundle:toy-bench')
  assert.equal(rows[0].canonical_version, 'toy-bench')
  assert.equal(rows[0].n_passed, 1)
  assert.equal(rows[0].n_graded, 1)
  assert.equal(rows[0].headline, 1)
  assert.deepEqual(rows[0].status_counts, { ok: 1, infra_error: 0, verify_error: 0 })
  assert.equal(rows[0].status_denominator, 1)
  assert.equal(rows[0].price_known, true)
  assert.equal(rows[0].usd_per_solved, 0)
  assert.equal(rows[0].tok_per_solved, 0)
  assert.ok(Array.isArray(rows[0].headline_ci))
  assert.equal(rows[0].headline_ci.length, 2)
  assert.equal(rows[0].machine, undefined)
  assert.equal(rows[0].owner, undefined)

  const meta = {
    current_exam: 'toy-bench',
    current_exam_label: 'Toy Bench',
    current_exam_name: 'Toy Bench',
    current_exam_n_tasks: 1,
    n_canon: 1,
    comparable_min: 1,
    version_aware: true,
    exam_versions: [{ version: 'toy-bench', label: 'Toy Bench', name: 'Toy Bench', date: null, note: null, n_tasks: 1, current: true }],
  }
  const shared = projectSharedCellsFromScorecardRows(rows)
  const norm = projectNormIndexFromScorecardRows(rows, meta)
  const comp = projectCompIndexFromScorecardRows(rows, meta)
  const domain = projectDomainIndexFromPublicBundles([bundle], meta, { hello: 'toy-domain' })

  assert.equal(shared.length, 1)
  assert.equal(shared[0].model, 'dummy')
  assert.equal(norm.task_set, 'toy-bench')
  assert.equal(norm.cells[0].pass_rate, 1)
  assert.equal(comp.exam, 'Toy Bench')
  assert.equal(comp.cells[0].acc, 1)
  assert.equal(comp.cells[0].cost_per_solved, 0)
  assert.deepEqual(domain.domains, ['toy-domain'])
  assert.equal(domain.cells[0].by_domain['toy-domain'].passed, 1)
  assert.equal(domain.cells[0].by_domain['toy-domain'].n, 1)
})

test('dashboard store requires PublicBundle feed and has no legacy INDEX fallback', () => {
  const store = readFileSync(join(root, 'src/lib/store.ts'), 'utf8')
  const scorecard = readFileSync(join(root, 'src/views/SweScorecard.vue'), 'utf8')
  const examBar = readFileSync(join(root, 'src/components/ExamVersionBar.vue'), 'utf8')
  const loader = readFileSync(join(root, 'src/lib/publicBundle.ts'), 'utf8')
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8')

  assert.match(store, /import \{ loadPublicBundleDashboardFeed \} from '\.\/publicBundle'/)
  assert.match(store, /const publicDashboard = await loadPublicBundleDashboardFeed\(\)/)
  assert.match(store, /PublicBundle dashboard feed missing at \.\/public-bundles\/index\.json/)
  assert.match(store, /export const dashboardRecords = computed/)
  assert.match(store, /export const dashboardComp = computed/)
  assert.match(store, /export const dashboardDomainIndex = computed/)
  assert.doesNotMatch(store, /fetch\('\.\/(?:INDEX|SWE-INDEX|SWE-SHARED-INDEX|NORM-INDEX|COMP-INDEX|DOMAIN-INDEX)\.json'/)
  assert.doesNotMatch(store, /publicBundleFeedLoaded\.value \?/)
  assert.match(loader, /feedUrl = '\.\/public-bundles\/index\.json'/)
  assert.match(loader, /task_domains_url/)
  assert.doesNotMatch(ignore, /public\/public-bundles\//)
  assert.match(scorecard, /scorecardSweMeta/)
  assert.match(examBar, /scorecardSweMeta/)
  assert.doesNotMatch(loader, /SWE-INDEX|COMP-INDEX|NORM-INDEX|DOMAIN-INDEX|benchmarks\/|results\//)
})

test('production data routes read active dashboard projections, not legacy store refs directly', () => {
  const expected = new Map([
    ['src/views/SpeedHeatmap.vue', 'dashboardRecords'],
    ['src/views/SpeedLeaderboard.vue', 'dashboardRecords'],
    ['src/views/SpeedContributors.vue', 'dashboardRecords'],
    ['src/views/SpeedEfficiency.vue', 'dashboardComp'],
    ['src/views/SpeedCloud.vue', 'dashboardComp'],
    ['src/views/SweShared.vue', 'dashboardSharedCells'],
    ['src/views/SweNorm.vue', 'dashboardNorm'],
    ['src/views/SweComp.vue', 'dashboardComp'],
    ['src/views/SweScorecard.vue', 'sweCellsByExam'],
    ['src/views/SweByDomain.vue', 'dashboardDomainIndex'],
    ['src/views/ExamHistory.vue', 'scorecardSweMeta'],
    ['src/views/ModelDetail.vue', 'scorecardSweCells'],
    ['src/views/OwnerDetail.vue', 'scorecardSweCells'],
  ])
  const forbiddenLegacyImport = /import \{[^}]*\b(records|comp|norm|sharedCells|domainIndex|sweCells|sweMeta)\b[^}]*\} from '@\/lib\/store'/

  for (const [file, symbol] of expected) {
    const source = readFileSync(join(root, file), 'utf8')
    assert.match(source, new RegExp(`\\b${symbol}\\b`), `${file} active projection`)
    assert.doesNotMatch(source, forbiddenLegacyImport, `${file} legacy direct import`)
  }
})

test('compatibility fallback banner is removed after PublicBundle cutover', () => {
  const app = readFileSync(join(root, 'src/App.vue'), 'utf8')
  const store = readFileSync(join(root, 'src/lib/store.ts'), 'utf8')
  const i18n = readFileSync(join(root, 'src/lib/i18n.ts'), 'utf8')

  assert.match(store, /export const compatibilityFallbackActive = computed<boolean>\(\(\) => false\)/)
  assert.doesNotMatch(app, /compatibilityFallbackActive/)
  assert.doesNotMatch(app, /compat\.banner\./)
  assert.doesNotMatch(i18n, /compat\.banner\./)
  assert.doesNotMatch(app, /error\.loadIndex/)
  assert.doesNotMatch(i18n, /SWE-INDEX|SWE-SHARED-INDEX|NORM-INDEX|Could not load INDEX|無法載入 INDEX/)
})
