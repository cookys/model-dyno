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
    assert.match(manifest.schema_version, /^public_bundle\.v[123]$/)
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
