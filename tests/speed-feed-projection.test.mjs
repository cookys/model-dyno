// The speed routes' data path, end to end through the projector.
//
// This is the regression that hid for a whole platform migration: publicBundle.ts
// returned `records: []` unconditionally, so /speed/heatmap, /speed/leaderboard and
// /speed/contributors were empty in production while a dev checkout — where the
// private INDEX.json still exists — looked completely healthy. A test that only
// exercises the dev path cannot see that, so this one drives the PUBLISHED snapshot
// shape directly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname

test('the published snapshot declares the speed keys the routes need', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  // Absent is the pre-2026-08-18 shape and is tolerated by the projector, but the
  // COMMITTED snapshot must carry them — otherwise the live site is empty again and
  // nothing else in the suite would notice.
  assert.ok(Array.isArray(snap.speed_records), 'snapshot carries speed_records')
  assert.ok(Array.isArray(snap.spec_decode_findings), 'snapshot carries spec_decode_findings')
  assert.ok(snap.speed_records.length > 0, 'speed_records is not empty')
  assert.ok(snap.spec_decode_findings.length > 0, 'spec_decode_findings is not empty')
})

test('published speed records carry no hostname or local path', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  const keys = new Set(snap.speed_records.flatMap((r) => Object.keys(r)))
  for (const forbidden of ['hostname', 'source_file', 'model_sha256', 'engine_sha']) {
    assert.ok(!keys.has(forbidden), `${forbidden} must not be published`)
  }
})

test('the three speed routes read dashboardRecords, so it must not be hard-coded empty', () => {
  const src = readFileSync(join(root, 'src/lib/publicBundle.ts'), 'utf8')
  const dashboardReturn = src.slice(src.indexOf('loadPublicBundleDashboardFeed'))
  assert.match(dashboardReturn, /normalizeSpeedRecords\(snapshot\.speed_records\)/)
  assert.match(dashboardReturn, /normalizeSpecDecodeFindings\(snapshot\.spec_decode_findings\)/)
})

test('spec-decode findings are wired through the store (v1 surfaces them on /v1/mods)', () => {
  const storeSrc = readFileSync(join(root, 'src/lib/store.ts'), 'utf8')
  const modsView = readFileSync(join(root, 'src/views/v1/V1Mods.vue'), 'utf8')
  assert.match(storeSrc, /specDecodeFindings\.value = publicDashboard\.specDecodeFindings/)
  assert.match(modsView, /specDecodeFindings/)
})

test('legacy heatmap spec-decode card is deprecated in favour of v1 mods', () => {
  const heatmap = readFileSync(join(root, 'src/views/SpeedHeatmap.vue'), 'utf8')
  const router = readFileSync(join(root, 'src/router.ts'), 'utf8')
  assert.ok(router.includes('/v1/mods'), 'v1 mods route exists')
  // Heatmap may still carry a static card until removed; v1 is the feed-driven surface.
  assert.match(heatmap, /dashboardRecords/)
})

test('the snapshot carries the hardware and footprint blocks the fit view needs', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  assert.ok(Array.isArray(snap.machines) && snap.machines.length > 0, 'machines block is published')
  assert.ok(Array.isArray(snap.model_registry) && snap.model_registry.length > 0, 'model_registry is published')
  // The join that makes the whole thing work: registry aliases must actually match the
  // model_alias on speed records, or every fit lookup silently returns nothing.
  const aliases = new Set(snap.model_registry.map((m) => m.alias))
  const hits = snap.speed_records.filter((r) => aliases.has(r.model_alias)).length
  assert.ok(hits > 10, `expected registry to join to speed records, matched ${hits}`)
})

test('a discrete card is never described as unified memory', () => {
  // Memory kind is a property of the silicon. Deriving it from "which VRAM key does this
  // profile happen to set" called the discrete 4090 unified and the Strix Halo APU
  // dedicated — and the fit arithmetic means the opposite thing on each.
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  const byProfile = Object.fromEntries(snap.machines.map((m) => [m.profile, m]))
  assert.equal(byProfile['cookys-gentoo']?.memory_kind, 'dedicated', '4090 is a discrete card')
  assert.equal(byProfile['cookys-gentoo']?.vram_usable_gb, 24)
  assert.equal(byProfile['cachyos-max395']?.memory_kind, 'unified', 'Strix Halo is an APU')
  assert.equal(byProfile['MacBook-Pro.M4Max.36GB']?.memory_kind, 'unified')
})

test('published speed rows name the card that produced them', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  const missing = snap.speed_records.filter((r) => !r.gpu_summary).length
  // Was 45/82 while the aggregator read only host_caps and ignored gpu_state_before.
  assert.ok(missing <= 10, `${missing} rows still publish no GPU identity`)
  const fourNinety = snap.speed_records.filter((r) => r.profile === 'cookys-gentoo')
  assert.ok(fourNinety.length > 0)
  assert.ok(fourNinety.every((r) => r.gpu_summary && r.vram_total_gb === 24),
    'every 4090 row names the card and its 24GB')
})

test('the published run configs carry no host filesystem path', () => {
  // These exist so a reader can reproduce a number. They are structured knobs rather than
  // a rendered command line precisely because the command is full of this machine's
  // absolute paths, and a leak here is a leak on a public site.
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  assert.ok(Array.isArray(snap.run_configs) && snap.run_configs.length > 0, 'run_configs is published')
  const blob = JSON.stringify(snap.run_configs)
  for (const leak of ['/home/', '/data/', '/Users/', 'C:\\\\']) {
    assert.ok(!blob.includes(leak), `run configs must not contain ${leak}`)
  }
  assert.ok(snap.run_configs.every((c) => c.model && c.config), 'every config names its model')
})

test('every published machine can be used for fit arithmetic', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  for (const m of snap.machines) {
    assert.ok(typeof m.vram_usable_gb === 'number' && m.vram_usable_gb > 0,
      `${m.profile} publishes no usable memory figure`)
    // A unified box must never report its whole pool as usable — the OS holds some of it.
    if (m.memory_kind === 'unified' && m.vram_pool_gb) {
      assert.ok(m.vram_usable_gb <= m.vram_pool_gb, `${m.profile} claims more than its pool`)
    }
  }
})

test('itx-5950x 2080 Ti IQ4 vendor cells are on the official feed', () => {
  const snap = JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))
  const feed = JSON.parse(readFileSync(join(root, 'public/public-bundles/index.json'), 'utf8'))
  const itx = snap.machines.find((m) => m.profile === 'itx-5950x')
  assert.ok(itx, 'itx-5950x is in machines')
  assert.equal(itx.memory_kind, 'dedicated')
  assert.equal(itx.vram_usable_gb, 22)
  assert.match(itx.gpu_name || '', /2080 Ti/)
  assert.ok(itx.aliases.includes('COOKYS-R5950-ITX'))

  const iq4 = snap.model_registry.find((m) => m.alias === 'Qwen3.8-27B-IQ4_XS')
  assert.ok(iq4, 'IQ4_XS registry row')
  assert.equal(iq4.quant, 'IQ4_XS')

  const speed = snap.speed_records.filter((r) => r.profile === 'itx-5950x')
  assert.ok(speed.length > 0, 'speed row for itx-5950x')
  assert.ok(speed.every((r) => r.model_alias === 'Qwen3.8-27B-IQ4_XS'))
  assert.ok(speed.every((r) => r.tg128_tps === 35.55))

  const findings = snap.spec_decode_findings.filter((f) => f.machine === 'itx-5950x')
  assert.ok(findings.length > 0, 'spec-decode finding for itx-5950x')
  assert.ok(findings.every((f) => f.method === 'mtp' && f.verdict === 'win'))

  const recipes = snap.run_configs.filter((c) => String(c.config).includes('qwen3.8-27b-iq4xs-64k-vendor'))
  assert.equal(recipes.length, 2, 'nospec + mtp serve recipes')
  assert.ok(recipes.every((c) => c.model === 'Qwen3.8-27B-IQ4_XS'))
  assert.ok(recipes.every((c) => c.ctx_size === 65536))

  const cells = [
    ...snap.bundles.map((b) => b.entry),
    ...feed.bundles,
  ].filter((e) => (e.base_url || '').includes('2080ti') && !(e.base_url || '').includes('jc-iq4'))
  const slugs = new Set(cells.map((e) => e.base_url))
  assert.equal(slugs.size, 2)
  const drafts = new Set(cells.map((e) => e.tags && e.tags.draft))
  assert.deepEqual([...drafts].sort(), ['mtp', 'none'])
  assert.ok(cells.every((e) => e.machine === 'itx-5950x'))
  assert.ok(cells.every((e) => e.tags && e.tags.quant === 'IQ4_XS'))

  const jcReg = snap.model_registry.find((m) => m.alias === 'Qwen3.8-27B-Uncensored-IQ4_XS')
  assert.ok(jcReg, 'JC Uncensored IQ4_XS registry row')
  assert.equal(jcReg.quant, 'IQ4_XS')
  const jcRecipes = snap.run_configs.filter((c) => String(c.config).includes('jc-iq4xs-64k-vendor'))
  assert.equal(jcRecipes.length, 2, 'JC IQ4 nospec + mtp serve recipes')
  assert.ok(jcRecipes.every((c) => c.model === 'Qwen3.8-27B-Uncensored-IQ4_XS'))
  assert.ok(jcRecipes.every((c) => c.ctx_size === 65536))
  const jcCells = [
    ...snap.bundles.map((b) => b.entry),
    ...feed.bundles,
  ].filter((e) => (e.base_url || '').includes('jc-iq4-2080ti'))
  const jcSlugs = new Set(jcCells.map((e) => e.base_url))
  assert.equal(jcSlugs.size, 2, 'JC IQ4 nospec + mtp SWE cells')
  assert.ok(jcCells.every((e) => e.machine === 'itx-5950x'))
  assert.ok(jcCells.every((e) => e.tags && e.tags.lineage === 'abliterated'))
  const jcDrafts = new Set(jcCells.map((e) => e.tags && e.tags.draft))
  assert.deepEqual([...jcDrafts].sort(), ['mtp', 'none'])
})
