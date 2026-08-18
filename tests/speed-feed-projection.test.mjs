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
