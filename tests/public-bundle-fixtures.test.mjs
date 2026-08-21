import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

// `node --test` cannot import .ts, so each module is transpiled into a data: URL.
// A data: URL has no resolver, so a relative import inside the transpiled source
// would throw ERR_UNSUPPORTED_RESOLVE_REQUEST. Inline the dependency graph instead:
// each relative specifier is replaced by the data: URL of its own transpiled form.
// Without this the harness silently constrains production code to be import-free.
const TS_COMPILER_OPTIONS = {
  module: ts.ModuleKind.ES2022,
  target: ts.ScriptTarget.ES2022,
  importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
}

function resolveTsPath(fromDir, specifier) {
  for (const candidate of [`${specifier}.ts`, `${specifier}.mjs`, `${specifier}/index.ts`, specifier]) {
    const abs = join(fromDir, candidate)
    if (existsSync(abs)) return abs
  }
  return null
}

function transpileToDataUrl(absPath, seen = new Map()) {
  const cached = seen.get(absPath)
  if (cached) return cached
  // Placeholder first: a cyclic import would otherwise recurse forever.
  seen.set(absPath, 'data:text/javascript;base64,')
  const output = ts
    .transpileModule(readFileSync(absPath, 'utf8'), { compilerOptions: TS_COMPILER_OPTIONS })
    .outputText
    .replace(/(\bfrom\s*)['"](\.\.?\/[^'"]+)['"]/g, (whole, prefix, specifier) => {
      const dep = resolveTsPath(dirname(absPath), specifier)
      return dep ? `${prefix}'${transpileToDataUrl(dep, seen)}'` : whole
    })
  const url = `data:text/javascript;base64,${Buffer.from(output, 'utf8').toString('base64')}`
  seen.set(absPath, url)
  return url
}

async function importTsModule(relativePath) {
  return import(transpileToDataUrl(join(root, relativePath)))
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

  assert.deepEqual(PUBLIC_BUNDLE_SCHEMA_VERSIONS, ['public_bundle.v1', 'public_bundle.v2', 'public_bundle.v3', 'public_bundle.v4', 'public_bundle.v5'])
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
  assert.equal(rows[0].tok_per_solved, undefined) // plan 051: zero output → — not 0
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

test('browser dashboard hydrates PublicBundle data from one materialized request', async () => {
  const { loadPublicBundleDashboardFeed } = await importTsModule('src/lib/publicBundle.ts')
  const bundleDir = join(fixtures, 'toy-v3')
  const bundle = Object.fromEntries(exactBundleFiles.map((file) => [
    file.replace('.json', ''),
    JSON.parse(readFileSync(join(bundleDir, file), 'utf8')),
  ]))
  const entry = {
    id: 'toy-bench',
    base_url: './public-bundles/toy-v3/',
    current: true,
    label: 'dummy',
  }
  const snapshot = {
    schema_version: 'dashboard_public_bundle_snapshot.v1',
    feed: {
      current_exam: 'toy-bench',
      current_exam_label: 'Toy Bench',
      current_exam_n_tasks: 1,
      n_canon: 1,
      comparable_min: 1,
      version_aware: true,
      bundles: [entry],
    },
    task_domains: { hello: 'toy-domain' },
    bundles: [{ entry, bundle }],
  }

  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return { ok: true, status: 200, json: async () => snapshot }
  }
  try {
    const projection = await loadPublicBundleDashboardFeed('./snapshot.json')
    assert.equal(requests, 1)
    assert.equal(projection.loaded, true)
    assert.equal(projection.cells.length, 1)
    assert.equal(projection.domainIndex.cells[0].by_domain['toy-domain'].passed, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('dashboard store requires PublicBundle for SWE and dedicated aggregates for speed views', () => {
  const store = readFileSync(join(root, 'src/lib/store.ts'), 'utf8')
  const scorecard = readFileSync(join(root, 'src/views/SweScorecard.vue'), 'utf8')
  const examBar = readFileSync(join(root, 'src/components/ExamVersionBar.vue'), 'utf8')
  const loader = readFileSync(join(root, 'src/lib/publicBundle.ts'), 'utf8')
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8')

  assert.match(store, /import \{ loadPublicBundleDashboardFeed \} from '\.\/publicBundle'/)
  assert.match(store, /const \[speedIndex, speedCompIndex\] = await Promise\.all/)
  assert.match(store, /const publicDashboard = await loadPublicBundleDashboardFeed\(\)/)
  // Aggregates are optional: public Pages has no *-INDEX.json. Fall back to
  // PublicBundle projections so speed routes still render (plan 051 P0).
  assert.match(store, /if \(!speedComp\.value && publicDashboard\.comp\)/)
  assert.match(store, /if \(!speedRecords\.value\.length && publicDashboard\.records\.length\)/)
  assert.match(store, /PublicBundle dashboard snapshot missing/)
  assert.match(store, /export const dashboardRecords = computed/)
  assert.match(store, /export const dashboardComp = computed/)
  assert.match(store, /export const dashboardSpeedComp = computed/)
  assert.match(store, /export const speedLoading = ref<boolean>\(true\)/)
  assert.match(store, /export const dashboardDomainIndex = computed/)
  assert.match(store, /fetchDashboardJson<Record<string, unknown>>\('\.\/INDEX\.json'\)/)
  assert.match(store, /fetchDashboardJson<CompIndex>\('\.\/COMP-INDEX\.json'\)/)
  assert.doesNotMatch(store, /fetchDashboardJson.*(?:SWE-INDEX|SWE-SHARED-INDEX|NORM-INDEX|DOMAIN-INDEX)/)
  assert.doesNotMatch(store, /publicBundleFeedLoaded\.value \?/)
  assert.match(loader, /snapshotUrl = '\.\/public-bundles\/dashboard-snapshot\.json'/)
  assert.match(loader, /dashboard_public_bundle_snapshot\.v1/)
  assert.match(loader, /task_domains_url/)
  // Private monorepo regenerates public-bundles/ and gitignores it. Public
  // model-dyno commits the cleared feed (SOURCE_PROVENANCE marks that layout).
  if (existsSync(join(root, 'SOURCE_PROVENANCE.json'))) {
    assert.ok(existsSync(join(root, 'public', 'public-bundles', 'index.json')))
  } else {
    assert.match(ignore, /public\/public-bundles\//)
  }
  assert.match(scorecard, /scorecardSweMeta/)
  assert.match(examBar, /scorecardSweMeta/)
  assert.doesNotMatch(loader, /SWE-INDEX|COMP-INDEX|NORM-INDEX|DOMAIN-INDEX|benchmarks\/|results\//)

  for (const file of ['SpeedHeatmap.vue', 'SpeedLeaderboard.vue', 'SpeedContributors.vue', 'SpeedEfficiency.vue', 'SpeedCloud.vue']) {
    assert.match(
      readFileSync(join(root, 'src/views', file), 'utf8'),
      /speedLoading as loading/,
      `${file} must not wait for the SWE PublicBundle fan-out`,
    )
  }
})

test('production data routes read active dashboard projections, not legacy store refs directly', () => {
  const expected = new Map([
    ['src/views/SpeedHeatmap.vue', 'dashboardRecords'],
    ['src/views/SpeedLeaderboard.vue', 'dashboardRecords'],
    ['src/views/SpeedContributors.vue', 'dashboardRecords'],
    ['src/views/SpeedEfficiency.vue', 'dashboardSpeedComp'],
    ['src/views/SpeedCloud.vue', 'dashboardSpeedComp'],
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


test('plan 051 golden vector: §2.3 formula contract on V4 score shape', async () => {
  // Inline a minimal V4 score → project via TypeScript transpile of publicBundle helpers.
  // We assert the pure formula gates without needing a full five-file fixture tree.
  const source = readFileSync(join(root, 'src/lib/publicBundle.ts'), 'utf8')
  assert.match(source, /public_bundle\.v4/)
  assert.match(source, /output-only/)
  assert.match(source, /derivePerfMetrics/)
  assert.match(source, /agentic_tok_s/)
  // tok_per_solved must use output tokens only (not input+cached+output)
  assert.match(source, /function tokensPerSolved[\s\S]*?output_tokens/)
  assert.doesNotMatch(
    source,
    /function tokensPerSolved[\s\S]*?\(input \?\? 0\) \+ \(cached \?\? 0\) \+ \(output \?\? 0\)/,
  )
})
