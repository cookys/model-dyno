// TRIVIAL run-class (display floor): a run with too few graded tasks to carry any
// signal is hidden outright, not shown as a small partial.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const OPTS = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove }

function resolveTsPath(fromDir, spec) {
  for (const c of [`${spec}.ts`, `${spec}.mjs`, `${spec}/index.ts`, spec]) {
    const abs = join(fromDir, c)
    if (existsSync(abs)) return abs
  }
  return null
}
function toDataUrl(absPath, seen = new Map()) {
  const hit = seen.get(absPath)
  if (hit) return hit
  seen.set(absPath, 'data:text/javascript;base64,')
  const out = ts.transpileModule(readFileSync(absPath, 'utf8'), { compilerOptions: OPTS }).outputText
    .replace(/(\bfrom\s*)['"](\.\.?\/[^'"]+)['"]/g, (whole, pre, spec) => {
      const dep = resolveTsPath(dirname(absPath), spec)
      return dep ? `${pre}'${toDataUrl(dep, seen)}'` : whole
    })
  const url = `data:text/javascript;base64,${Buffer.from(out, 'utf8').toString('base64')}`
  seen.set(absPath, url)
  return url
}
const load = (rel) => import(toDataUrl(join(root, rel)))

const EXAM = { comparableMin: 31, nExam: 34 }

test('TRIVIAL beats the backend comparable override', async () => {
  const { classifyCell } = await load('src/lib/runClass.ts')
  // Every bake-off smoke run carries comparable=false. If that were consulted
  // first the cell would classify PARTIAL and the floor would silently no-op —
  // the exact way this feature can ship broken without failing anything.
  const c = classifyCell({ n_graded: 3, comparable: false }, EXAM)
  assert.equal(c.coverage, 'TRIVIAL')
  assert.equal(c.section, 'hide')
  assert.equal(c.rankable, false)
})

test('floor boundary is exact and does not touch real partials', async () => {
  const { classifyCell, DEFAULT_DISPLAY_FLOOR } = await load('src/lib/runClass.ts')
  assert.equal(DEFAULT_DISPLAY_FLOOR, 6)
  assert.equal(classifyCell({ n_graded: 5, comparable: false }, EXAM).coverage, 'TRIVIAL')
  assert.equal(classifyCell({ n_graded: 6, comparable: false }, EXAM).coverage, 'PARTIAL')
  assert.equal(classifyCell({ n_graded: 6, comparable: false }, EXAM).section, 'incomplete')
  // A full-scale run is never reachable by the floor.
  assert.equal(classifyCell({ n_graded: 34, comparable: true }, EXAM).coverage, 'FULL')
  assert.equal(classifyCell({ n_graded: 0 }, EXAM).coverage, 'EMPTY')
})

test('floor is clamped to comparableMin so small exams still work', async () => {
  const { classifyCell } = await load('src/lib/runClass.ts')
  // 1-task toy bench: an unclamped floor of 6 would hide every possible run.
  const toy = { comparableMin: 1, nExam: 1 }
  assert.equal(classifyCell({ n_graded: 1, comparable: true }, toy).coverage, 'FULL')
  assert.equal(classifyCell({ n_graded: 1, comparable: true }, toy).section, 'main')
})

test('display_floor 0 disables the class entirely', async () => {
  const { classifyCell } = await load('src/lib/runClass.ts')
  const off = { ...EXAM, displayFloor: 0 }
  assert.equal(classifyCell({ n_graded: 3, comparable: false }, off).coverage, 'PARTIAL')
  assert.equal(classifyCell({ n_graded: 3, comparable: false }, off).section, 'incomplete')
})

test('producer-stamped display_floor overrides the default', async () => {
  const { classifyCell } = await load('src/lib/runClass.ts')
  assert.equal(classifyCell({ n_graded: 9, comparable: false }, { ...EXAM, displayFloor: 12 }).coverage, 'TRIVIAL')
  assert.equal(classifyCell({ n_graded: 9, comparable: false }, { ...EXAM, displayFloor: 3 }).coverage, 'PARTIAL')
})

test('resolveExamMeta carries display_floor from feed meta', async () => {
  const { resolveExamMeta } = await load('src/lib/examMeta.ts')
  assert.equal(resolveExamMeta({ n_exam: 34, comparable_min: 31 }).displayFloor, 6)
  assert.equal(resolveExamMeta({ n_exam: 34, comparable_min: 31, display_floor: 10 }).displayFloor, 10)
  assert.equal(resolveExamMeta({ n_exam: 34, comparable_min: 31, display_floor: 0 }).displayFloor, 0)
})

// --- loader choke point: hidden means ABSENT, including from folded sub-tables ---

function toyBundle() {
  const dir = join(root, 'fixtures', 'public-bundles', 'toy-v3')
  return Object.fromEntries(
    ['benches.json', 'manifest.json', 'runs.json', 'scores.json', 'subjects.json'].map((f) => [
      f.replace('.json', ''),
      JSON.parse(readFileSync(join(dir, f), 'utf8')),
    ]),
  )
}

function cellBundle({ model, n, slug }) {
  const b = toyBundle()
  const score = b.scores[0]
  score.comparison_key.model = model
  score.comparison_key.comparable = n >= 31
  score.comparison_key.partial = n < 31
  score.aggregate = { n_error: 0, n_fail: 0, n_infra_error: 0, n_pass: n, n_skip: 0, n_tasks: n, pass_rate: 1 }
  score.entries = Array.from({ length: n }, (_, i) => ({ task_id: `t${i}`, verdict: 'PASS' }))
  const entry = { id: 'toy-bench', base_url: `./public-bundles/${slug}/`, current: true, label: slug }
  return { entry, bundle: b }
}

test('loader drops TRIVIAL cells at the single choke point', async () => {
  const { loadPublicBundleDashboardFeed } = await load('src/lib/publicBundle.ts')
  const packed = [
    cellBundle({ model: 'model-a', n: 34, slug: 'a-full' }),   // keeps
    cellBundle({ model: 'model-a', n: 3, slug: 'a-smoke' }),   // hidden member of a live group
    cellBundle({ model: 'model-b', n: 3, slug: 'b-smoke' }),   // whole model disappears
  ]
  const snapshot = {
    schema_version: 'dashboard_public_bundle_snapshot.v1',
    feed: {
      current_exam: 'toy-bench',
      current_exam_label: 'Toy Bench',
      current_exam_n_tasks: 34,
      n_canon: 34,
      comparable_min: 31,
      version_aware: true,
      bundles: packed.map((p) => p.entry),
    },
    task_domains: {},
    bundles: packed,
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => snapshot })
  try {
    const p = await loadPublicBundleDashboardFeed('./snapshot.json')
    const models = p.cells.map((c) => c.canonical_model ?? c.model)
    // model-a keeps only its full cell; model-b vanishes rather than rendering an empty shell.
    assert.deepEqual(models, ['model-a'])
    assert.equal(p.cells[0].n_graded, 34)
    assert.ok(!p.comp.cells.some((c) => (c.model ?? '').includes('model-b')), 'comp index also filtered')
    assert.ok(!p.norm.cells.some((c) => (c.model ?? '').includes('model-b')), 'norm index also filtered')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('feed-stamped display_floor=0 restores every row through the loader', async () => {
  // Negative control: proves the filter above is load-bearing rather than the
  // fixtures collapsing for some unrelated reason, and that the producer field
  // reaches the choke point.
  const { loadPublicBundleDashboardFeed } = await load('src/lib/publicBundle.ts')
  const packed = [
    cellBundle({ model: 'model-a', n: 34, slug: 'a-full' }),
    cellBundle({ model: 'model-a', n: 3, slug: 'a-smoke' }),
    cellBundle({ model: 'model-b', n: 3, slug: 'b-smoke' }),
  ]
  const snapshot = {
    schema_version: 'dashboard_public_bundle_snapshot.v1',
    feed: {
      current_exam: 'toy-bench',
      current_exam_n_tasks: 34,
      n_canon: 34,
      comparable_min: 31,
      display_floor: 0,
      version_aware: true,
      bundles: packed.map((p) => p.entry),
    },
    task_domains: {},
    bundles: packed,
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => snapshot })
  try {
    const p = await loadPublicBundleDashboardFeed('./snapshot.json')
    assert.equal(p.cells.length, 3)
    assert.equal(p.meta.display_floor, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
