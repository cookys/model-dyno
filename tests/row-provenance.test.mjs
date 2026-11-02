// Feed-supplied deployment provenance must reach the row detail.
//
// 2026-11-02: llm-playground started emitting engine / weight_source / base_model /
// runtime_context on feed entries (cell-identity.toml `local_provenance_of`), but
// normalizeFeedEntry dropped every one of those keys, so the expanded row fell back to
// the name-regex tables in modelProvenance.ts and showed nothing for any model those
// tables did not already know. This drives the COMMITTED snapshot — the bytes the
// live site loads — through the real loader and provenance resolver.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname

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

test('every feed entry provenance field survives into the comp cell and the row detail', async () => {
  const { routeProvenanceOf } = await importTsModule('src/lib/modelProvenance.ts')
  const { snapshot, projection } = await loadCommittedSnapshot()
  const keys = ['engine', 'engine_url', 'runtime_context', 'weight_format', 'weight_source',
    'weight_source_url', 'base_model', 'base_model_url']
  const withProv = snapshot.feed.bundles.filter((e) => e.weight_source || e.base_model)
  assert.ok(withProv.length > 0, 'committed snapshot carries no feed provenance — fixture premise gone')

  const cells = projection.comp.cells
  let checked = 0
  for (const entry of withProv) {
    const cell = cells.find((c) => c.provenance && c.machine === entry.machine
      && c.provenance.weight_source === entry.weight_source
      && c.provenance.runtime_context === entry.runtime_context)
    assert.ok(cell, `no comp cell carries the provenance of feed entry ${entry.label} @ ${entry.machine}`)
    const row = routeProvenanceOf(cell)
    for (const k of keys) {
      if (entry[k]) assert.equal(row[k], entry[k], `${entry.label}: ${k}`)
    }
    checked += 1
  }
  assert.equal(checked, withProv.length)
})

test('feed provenance beats the name-regex fallback; the fallback still fills feedless rows', async () => {
  const { routeProvenanceOf } = await importTsModule('src/lib/modelProvenance.ts')
  const base = { model: 'x', cell: 'deepseek-v4-flash-local', source: 's', acc: 0, ci_lo: 0, ci_hi: 0, passed: 0, n: 0 }
  // No feed provenance → the regex table answers.
  assert.equal(routeProvenanceOf(base).weight_source, 'deepseek-ai/DeepSeek-V4-Flash')
  // Feed provenance present → it wins, key by key; unspecified keys still fall back.
  const fed = routeProvenanceOf({ ...base, provenance: { weight_source: 'someone/Other-Quant' } })
  assert.equal(fed.weight_source, 'someone/Other-Quant')
  assert.equal(fed.base_model, 'deepseek-ai/DeepSeek-V4-Flash')
})
