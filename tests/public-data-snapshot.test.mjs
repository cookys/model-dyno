import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const publicRoot = join(root, 'public', 'public-bundles')
const exactBundleFiles = ['benches.json', 'manifest.json', 'runs.json', 'scores.json', 'subjects.json']
const dataFiles = exactBundleFiles.filter((name) => name !== 'manifest.json')

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

test('published PublicBundle snapshot is complete, hashed, and raw-private-data free', () => {
  const feed = JSON.parse(readFileSync(join(publicRoot, 'index.json'), 'utf8'))
  assert.equal(feed.schema_version, 'dashboard_public_bundle_feed.v1')
  assert.ok(feed.bundles.length > 0)

  const referenced = new Set()
  for (const entry of feed.bundles) {
    const match = /^\.\/public-bundles\/([^/]+)\/$/.exec(entry.base_url)
    assert.ok(match, `invalid base_url: ${entry.base_url}`)
    const slug = match[1]
    referenced.add(slug)
    const dir = join(publicRoot, slug)
    assert.deepEqual(readdirSync(dir).sort(), exactBundleFiles, `${slug} exact file set`)

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    // v5 adds footing.role (llm-playground plan 057). This regex is a SECOND, independent
    // version guard — updating PUBLIC_BUNDLE_SCHEMA_VERSIONS in src/ does not update it,
    // and it is the one that fires against real published data rather than a fixture.
    assert.match(manifest.schema_version, /^public_bundle\.v[12345]$/)
    assert.deepEqual(Object.keys(manifest.file_hashes).sort(), dataFiles)
    for (const file of dataFiles) {
      const text = readFileSync(join(dir, file), 'utf8')
      assert.equal(sha256(text), manifest.file_hashes[file], `${slug}/${file} hash`)
      assert.doesNotMatch(text, /agent_diff|pre_fix_log|post_fix_log|\/home\/[A-Za-z0-9._-]+\//)
    }
    const digestInput = { ...manifest }
    delete digestInput.manifest_digest
    assert.equal(sha256(canonicalJson(digestInput)), manifest.manifest_digest, `${slug} manifest digest`)
  }

  const actual = new Set(
    readdirSync(publicRoot).filter((name) => statSync(join(publicRoot, name)).isDirectory()),
  )
  assert.deepEqual(actual, referenced, 'feed and snapshot directory sets match')
})

// The browser loads dashboard-snapshot.json, not index.json, and throws
// `bundle count mismatch` if its embedded feed and its bundles[] disagree —
// which takes the whole SWE board down. That happened on 2026-08-21: a cell was
// hand-added to index.json and to snapshot.bundles[] but not to snapshot.feed
// .bundles[], and nothing here noticed. These assertions are that missing guard.
test('materialized snapshot agrees with index.json and with its own bundles', () => {
  const index = JSON.parse(readFileSync(join(publicRoot, 'index.json'), 'utf8'))
  const snapshot = JSON.parse(readFileSync(join(publicRoot, 'dashboard-snapshot.json'), 'utf8'))
  assert.equal(snapshot.schema_version, 'dashboard_public_bundle_snapshot.v1')

  // A feed entry with no base_url is silently dropped by the loader, so an
  // entry count that merely LOOKS right still desynchronises the two arrays.
  for (const entry of snapshot.feed.bundles) {
    assert.ok(
      typeof entry.base_url === 'string' && entry.base_url.trim(),
      `snapshot feed entry without base_url: ${JSON.stringify(entry).slice(0, 120)}`,
    )
  }
  assert.equal(
    snapshot.bundles.length,
    snapshot.feed.bundles.length,
    'snapshot.bundles and snapshot.feed.bundles must be the same length — the loader throws otherwise',
  )

  const feedUrls = new Set(snapshot.feed.bundles.map((e) => e.base_url))
  for (const item of snapshot.bundles) {
    assert.ok(feedUrls.has(item.entry?.base_url), `snapshot bundle missing from snapshot.feed: ${item.entry?.base_url}`)
  }
  assert.deepEqual(
    new Set(index.bundles.map((e) => e.base_url)),
    feedUrls,
    'index.json and the embedded snapshot feed must reference the same bundles',
  )

  // Everything except the bundle list is one object in the producer; drift here
  // means one of the two files was hand-edited.
  for (const key of Object.keys(index)) {
    if (key === 'bundles') continue
    assert.deepEqual(snapshot.feed[key], index[key], `snapshot.feed.${key} drifted from index.json`)
  }
})
