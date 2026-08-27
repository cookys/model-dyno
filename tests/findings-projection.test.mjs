// Plan 060: the credibility-gates + findings data path, end to end.
//
// Same regression class speed-feed-projection guards: a projector that silently
// returns [] looks healthy on a dev checkout and renders an empty page in
// production. These tests drive the COMMITTED snapshot and the source wiring, so
// either going missing fails loudly here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const snap = () =>
  JSON.parse(readFileSync(join(root, 'public/public-bundles/dashboard-snapshot.json'), 'utf8'))

test('the committed snapshot carries findings and depth rows', () => {
  const s = snap()
  assert.ok(Array.isArray(s.findings) && s.findings.length >= 5, 'findings present')
  assert.ok(Array.isArray(s.depth_findings) && s.depth_findings.length >= 8, 'depth_findings present')
  for (const f of s.findings) {
    assert.ok(f.id && f.title_en && f.title_zh, `finding ${f.id} bilingual title`)
    assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, `finding ${f.id} carries receipts`)
    assert.ok(f.conditions && f.repro_en && f.caveat_en, `finding ${f.id} conditions/repro/caveat`)
  }
})

test('regenerable feed entries carry a gates verdict, and rerun counts exist', () => {
  const s = snap()
  const entries = s.feed.bundles
  assert.ok(entries.length > 0)
  // Carry-forward entries (frozen cells another machine produced; this checkout cannot
  // regenerate them) ride the prior feed verbatim and legitimately lack gates — a hard
  // "every entry" here would veto the tombstone mechanism. The regenerable majority must
  // carry them, and every present verdict must be valid.
  const gated = entries.filter((e) => e.gates)
  assert.ok(gated.length >= entries.length * 0.9,
    `gates coverage ${gated.length}/${entries.length} — below the carried-forward tolerance`)
  for (const e of gated) {
    assert.ok(typeof e.gates.verdict === 'string'
      && ['CLEAN', 'CAPPED', 'TOOL-USE', 'INFRA'].includes(e.gates.verdict),
      `${e.label}: ${String(e.gates.verdict)}`)
  }
  // The gates must be real math, not a constant: the corpus is known to contain
  // capped cells, and known to contain rerun samples.
  assert.ok(gated.some((e) => e.gates.verdict !== 'CLEAN'), 'at least one non-CLEAN verdict')
  assert.ok(entries.some((e) => (e.n_runs ?? 1) > 1), 'at least one multi-run cell')
})

test('findings content passes the publish leak guard patterns', () => {
  const s = snap()
  const text = JSON.stringify([s.findings, s.depth_findings])
  // Mirror of the publish workflow's forbidden list (private markers + project names).
  const forbidden = /diff --git|pre_fix_log|post_fix_log|agent_diff|\/home\/[a-z]|personal-knowledge-base|(^|[^a-z])pkb([^a-z]|$)|mnemos|nikki|codeforge|hangar|twgame|codepower|claude-statusline|autopilot/i
  assert.doesNotMatch(text, forbidden)
})

test('the projector and store are wired, not hard-coded empty', () => {
  const bundleSrc = readFileSync(join(root, 'src/lib/publicBundle.ts'), 'utf8')
  const dashboardReturn = bundleSrc.slice(bundleSrc.indexOf('loadPublicBundleDashboardFeed'))
  assert.match(dashboardReturn, /findings: normalizeFindings\(snapshot\.findings\)/)
  assert.match(dashboardReturn, /depthFindings: normalizeDepthFindings\(snapshot\.depth_findings\)/)
  assert.match(bundleSrc, /gates: normalizeEntryGates\(entry\.gates\)/, 'feed entry passes gates through')
  assert.match(bundleSrc, /gates: metadata\.gates/, 'gates project into scorecard cells')

  const storeSrc = readFileSync(join(root, 'src/lib/store.ts'), 'utf8')
  assert.match(storeSrc, /findings\.value = publicDashboard\.findings/)
  assert.match(storeSrc, /depthFindings\.value = publicDashboard\.depthFindings/)

  const routerSrc = readFileSync(join(root, 'src/router.ts'), 'utf8')
  assert.ok(routerSrc.includes("path: '/findings'"), 'findings redirect exists')
})
