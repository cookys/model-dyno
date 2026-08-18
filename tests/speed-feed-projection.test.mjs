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
  // Guards the exact regression: the dashboard projection returning a literal [].
  const dashboardReturn = src.slice(src.indexOf('loadPublicBundleDashboardFeed'))
  assert.match(dashboardReturn, /records: projectSpeedRecords\(snapshot\.speed_records\)/)
  assert.match(dashboardReturn, /specDecodeFindings: projectSpecDecodeFindings\(snapshot\.spec_decode_findings\)/)
})

test('the heatmap renders findings from the feed, not from a literal', () => {
  const view = readFileSync(join(root, 'src/views/SpeedHeatmap.vue'), 'utf8')
  assert.ok(!view.includes('SPEC_DECODE_FINDINGS'), 'the hard-coded Apple-only array is gone')
  assert.match(view, /dashboardSpecDecodeFindings/)
})

test('the spec-decode card copy does not describe a narrower dataset than it shows', () => {
  // The rows went data-driven and covered 5 machines and 3 methods while the heading
  // still read "(DFlash) — Apple Silicon", so the page looked unchanged. Copy that
  // names one method or one vendor is a claim about the data, and it goes stale
  // silently the moment the feed grows.
  const i18n = readFileSync(join(root, 'src/lib/i18n.ts'), 'utf8')
  const titles = [...i18n.matchAll(/"idx\.specdecode\.title":\s*"([^"]*)"/g)].map((m) => m[1])
  assert.ok(titles.length >= 2, 'both locales declare the title')
  for (const title of titles) {
    assert.ok(!/DFlash|Apple/i.test(title), `title must not name one method or vendor: ${title}`)
  }
  assert.ok(!i18n.includes('specdecode.note.'), 'per-row notes come from the feed, not from i18n')
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
