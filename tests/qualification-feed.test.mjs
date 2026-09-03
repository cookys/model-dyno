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
  assert.equal(feed.n_strikes, 2)
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

test('strikes are matched to their EXACT seat including effort, never to a look-alike or a sibling tier', async () => {
  const m = await loadModule()
  const feed = m.sanitizeQualificationFeed(fixture)
  const high = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'high')
  const low = feed.defaults.find((e) => e.seat.engine === 'grok-4.6' && e.seat.effort === 'low')
  const gem = feed.defaults.find((e) => e.seat.engine === 'gemini-3.7-flash-high')
  // fixture carries 2 strikes for grok-4.6/grok/implementer: one legacy (no effort, pre-partitioning)
  // and one synthetic effort='high' row. The legacy one must NOT attach to either effort-specific
  // entry (it belongs to neither), and the high-scoped one must never leak onto low.
  assert.equal(m.strikesForEntry(feed, high).length, 1)
  assert.equal(m.strikesForEntry(feed, high)[0].effort, 'high')
  assert.equal(m.strikesForEntry(feed, low).length, 0, 'a high-scoped strike must not attach to the low-tier row')
  assert.equal(m.strikesForEntry(feed, gem).length, 0)
  const legacy = feed.strikes.find((s) => s.effort === null)
  assert.ok(legacy, 'the legacy (effort-less) strike survives sanitizing')
  assert.equal(legacy.engine, 'grok-4.6')
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

test('V1 rank exposes token + cost columns with honest empty states', () => {
  const view = read('src/views/v1/V1Rank.vue')
  const store = read('src/lib/store.ts')
  const loader = read('src/lib/publicBundle.ts')

  // the columns exist and read the projected fields
  assert.match(view, /tokPerSolved: c\.tok_per_solved/)
  assert.match(view, /usdPerSolved: c\.usd_per_solved/)
  assert.match(view, /priceKnown: c\.price_known === true/)

  // plan 056: no published rate must render as an em dash, never as $0
  assert.match(view, /if \(r\.usdPerSolved == null \|\| !r\.priceKnown\) return '—'/)
  assert.doesNotMatch(view, /\$0\.00/)

  // a notional (plan/quota) figure is marked, and the mark comes from producer-side
  // billing rather than being guessed from the access label in the frontend
  assert.match(view, /r\.billing === 'subscription' \|\| r\.billing === 'token_plan'/)
  assert.match(store, /billing\?: string/)
  assert.match(loader, /billing: stringOrNull\(entry\.billing\)/)
  assert.match(loader, /billing: metadata\.billing/)
})

test('tok/solved is output-token based, so cache-free routes are not penalised', () => {
  const loader = read('src/lib/publicBundle.ts')
  const view = read('src/views/v1/V1Rank.vue')
  // the projection divides OUTPUT tokens by solved count, and refuses on partial coverage
  assert.match(loader, /function tokensPerSolved[\s\S]{0,400}usage\.output_tokens/)
  assert.match(loader, /function tokensPerSolved[\s\S]{0,300}coverage\) !== 'full'\) return undefined/)
  // and the column says so, so nobody reads it as total tokens
  assert.match(view, /Output tokens burned per solved task/)
})

test('value frontier: log axes, capped accuracy, frontier-only labels, real hit targets', () => {
  const view = read('src/components/v1/ValueFrontier.vue')
  const rank = read('src/views/v1/V1Rank.vue')

  // the chart is placed under the ranked table, fed from the RANKABLE rows only
  assert.match(rank, /<ValueFrontier :rows="frontierRows" \/>/)
  assert.match(rank, /rankedRows\.value\.map/)

  // log x: the spread is ~360x on cost; a linear axis buries every cheap cell at the origin
  assert.match(view, /scale: \{ type: 'log'/)
  // an accuracy axis must never run past 100% (nice+padding pushed it to 110 before this)
  assert.match(view, /domainMax: 100/)
  assert.doesNotMatch(view, /nice: true/)

  // only the frontier is direct-labelled — a label on every point is the named anti-pattern
  assert.match(view, /transform: \[\{ filter: 'datum\.isFrontier' \}\]/)
  assert.match(view, /!pts\.some\(\(q\) => q !== p && q\.x <= p\.x && q\.acc >= p\.acc/)

  // hover must not require landing dead-centre on a ~10px dot
  assert.match(view, /size: 560, opacity: 0, tooltip: true/)

  // $ axis excludes cells with no published rate and cells that solved nothing —
  // absent, never plotted at zero
  assert.match(view, /if \(axis\.value === 'usd' && !r\.priceKnown\) continue/)
  assert.match(view, /r\.passed <= 0\) continue/)

  // colour is the producer-derived billing regime, and the notional caveat is stated
  assert.match(view, /r\.billing \?\? 'unknown'/)
  assert.match(view, /notional \(list price × measured usage\), not money actually billed/)
})
