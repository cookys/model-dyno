import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')
const fixture = JSON.parse(read('tests/fixtures/qualification-feed.sample.json'))

// qualificationFeed.ts is dependency-free by design so it can be transpiled and executed here.
async function loadModule() {
  const src = read('src/lib/qualificationFeed.ts')
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dir = mkdtempSync(join(tmpdir(), 'qual-feed-'))
  const file = join(dir, 'qualificationFeed.mjs')
  writeFileSync(file, out)
  return import(pathToFileURL(file).href)
}

test('fixture is a v1 feed and sanitizes into typed entries with effort in the seat', async () => {
  const m = await loadModule()
  const feed = m.sanitizeQualificationFeed(fixture)
  assert.ok(feed, 'fixture must sanitize')
  assert.equal(feed.schema, m.QUALIFICATION_FEED_SCHEMA)
  assert.equal(feed.owner, 'cookys')
  assert.equal(feed.n_defaults, 4)
  assert.equal(feed.n_strikes, 1)
  for (const e of feed.defaults) {
    assert.deepEqual(Object.keys(e.seat).sort(), ['effort', 'engine', 'role', 'runner'])
    assert.ok(['qualified', 'failed'].includes(e.status), e.default_id)
    assert.ok(e.administration.corpus_version, `${e.default_id} carries corpus_version`)
  }
  const low = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'low')
  const high = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'high')
  assert.equal(low.status, 'qualified')
  assert.equal(high.status, 'failed')
  assert.equal(high.quality.integrity_violations, 1, 'the failure reason survives sanitizing')
  assert.ok(feed.disclosure_notice.length > 100 && feed.adr_0001_notice.length > 50, 'notices verbatim')
})

test('board block is integer-only (permille) and formats without inventing precision', async () => {
  const m = await loadModule()
  const feed = m.sanitizeQualificationFeed(fixture)
  const withBoard = feed.defaults.filter((e) => e.board && e.board.cell)
  assert.ok(withBoard.length >= 2, 'grok cells are joined to the board')
  for (const e of withBoard) {
    for (const [k, v] of Object.entries(e.board)) {
      if (typeof v === 'number') assert.ok(Number.isInteger(v), `${e.default_id}.board.${k} must be an integer`)
    }
  }
  assert.equal(m.formatPermille(764), '76%')
  assert.equal(m.formatPermille(null), '—')
})

test('adopt command names the exact seat, including effort, against the published feed URL', async () => {
  const m = await loadModule()
  const feed = m.sanitizeQualificationFeed(fixture)
  const low = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'low')
  const cmd = m.adoptCommand(feed, low)
  assert.match(cmd, /^node scripts\/adopt-qualification-defaults\.js adopt --from https:\/\/cookys\.github\.io\/model-dyno\/public-bundles\/qualification-feed\.json --role implementer --seat grok-4\.6:grok --effort low$/)
  const legacy = feed.defaults.find((e) => e.seat.effort === null)
  assert.doesNotMatch(m.adoptCommand(feed, legacy), /--effort/, 'no effort flag for a default-tier row')
})

test('strikes are matched to their seat, never to a look-alike', async () => {
  const m = await loadModule()
  const feed = m.sanitizeQualificationFeed(fixture)
  const high = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'high')
  const gem = feed.defaults.find((e) => e.seat.engine === 'gemini-3.7-flash-high')
  assert.equal(m.strikesForEntry(feed, high).length, 1)
  assert.equal(m.strikesForEntry(feed, gem).length, 0)
})

test('a payload that is not a v1 feed sanitizes to null (page says not-published, never guesses)', async () => {
  const m = await loadModule()
  assert.equal(m.sanitizeQualificationFeed({ schema: 'something-else', defaults: [] }), null)
  assert.equal(m.sanitizeQualificationFeed(null), null)
  const partial = m.sanitizeQualificationFeed({ schema: m.QUALIFICATION_FEED_SCHEMA, defaults: [{ role: 'x' }, 42] })
  assert.equal(partial.n_defaults, 0, 'entries without a seat are dropped, not invented')
})

test('licences page is routed, navigable, localized, and fed non-fatally from the store', () => {
  const router = read('src/router.ts')
  const app = read('src/App.vue')
  const i18n = read('src/lib/i18n.ts')
  const store = read('src/lib/store.ts')
  const view = read('src/views/SweLicences.vue')

  assert.match(router, /path: '\/swe\/licences', name: 'SweLicences', component: SweLicences/)
  assert.match(app, /to="\/swe\/licences"/)
  assert.match(app, /route\.path === '\/swe\/licences'/)
  for (const key of ['subtab.swe.licences', 'crumb.swe.licences', 'licences.title', 'licences.notPublished',
                     'licences.disclosure', 'licences.expiryNote', 'licences.envNote', 'licences.copy']) {
    const hits = i18n.match(new RegExp(`"${key.replace(/\./g, '\\.')}":`, 'g')) || []
    assert.equal(hits.length, 2, `${key} must exist in both en and zh`)
  }
  assert.match(store, /export const qualificationFeed = ref<QualificationFeed \| null>\(null\)/)
  assert.match(store, /loadQualificationFeed\(\)/)
  assert.match(store, /qualificationFeedError\.value = /, 'feed failure is surfaced, not swallowed')
  assert.doesNotMatch(store.slice(store.indexOf('export async function loadAllData')), /throw new Error\([^)]*qualification/i,
    'a missing feed must not take the whole dashboard down')
  assert.match(view, /feed\.disclosure_notice/)
  assert.match(view, /adoptCommand\(feed, e\)/)
  assert.match(view, /strikesForEntry\(feed, e\)/)
  assert.doesNotMatch(view, /expires/, 'no expiry column: calendar never gates (autopilot rule)')
})
