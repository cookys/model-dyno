import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (path) => readFileSync(join(root, path), 'utf8')

test('by-domain data enters dashboard state through PublicBundle task domain map', () => {
  const store = read('src/lib/store.ts')
  const loader = read('src/lib/publicBundle.ts')

  assert.match(store, /export function sanitizeDomainIndex\(raw: unknown\): DomainIndex/)
  assert.match(loader, /function normalizeTaskDomains\(raw: unknown\): Record<string, string>/)
  assert.match(loader, /projectDomainIndexFromPublicBundles\(bundles, meta, taskDomains\)/)
  assert.doesNotMatch(store, /DOMAIN-INDEX\.json/)
  assert.match(store, /const by_domain: DomainCell\['by_domain'\] = \{\}/)
  assert.doesNotMatch(store, /task_ids\??:/)
  assert.doesNotMatch(store, /records\??:/)
})

test('by-domain heatmap renders a complete model x domain grid with explicit not-run cells', () => {
  const view = read('src/views/SweByDomain.vue')

  assert.match(view, /for \(const dom of domains\.value\)/)
  assert.match(view, /acc: null/)
  assert.match(view, /status: t\('domain\.notRun'\)/)
  assert.match(view, /field: 'statusShort'/)
  assert.match(view, /role="img"/)
  assert.match(view, /role="table"/)
  assert.match(view, /heatmapAria\(/)
})

test('domain labels and not-run chrome are localized in English and Chinese', () => {
  const i18n = read('src/lib/i18n.ts')

  for (const key of [
    'domain.label.backend',
    'domain.label.frontend',
    'domain.label.tui',
    'domain.label._unknown',
    'domain.notRun',
    'domain.notRunShort',
    'domain.tableFallback',
    'domain.aria.heatmap',
  ]) {
    assert.equal((i18n.match(new RegExp(`"${key}":`, 'g')) || []).length, 2, `${key} must exist in en and zh`)
  }
})

test('folded variant affordances are localized in English and Chinese', () => {
  const i18n = read('src/lib/i18n.ts')

  for (const key of [
    'fold.variants.badge',
    'fold.routes.badge',
    'fold.variants.badgeTip',
    'fold.routes.badgeTip',
    'fold.variants.title',
    'fold.variants.explainer',
  ]) {
    assert.equal((i18n.match(new RegExp(`"${key}":`, 'g')) || []).length, 2, `${key} must exist in en and zh`)
  }
})

test('data table headers expose hover descriptions', () => {
  const table = read('src/components/DataTable.vue')
  const i18n = read('src/lib/i18n.ts')

  assert.match(table, /description\?: string/)
  assert.match(table, /const columnDescription/)
  assert.match(table, /:title="columnDescription\(col\)"/)
  assert.match(table, /:aria-label="`\$\{col\.label\}: \$\{columnDescription\(col\)\}`"/)

  for (const key of [
    'table.tip.model',
    'table.tip.modelGroup',
    'table.tip.route',
    'table.tip.eff',
    'table.tip.n',
    'table.tip.coverage',
    'table.tip.agency',
    'table.tip.pps',
    'table.tip.tokSolved',
    'table.tip.secSolved',
    'table.tip.usdSolved',
    'table.tip.perHour',
    'table.tip.perMin',
    'table.tip.tokS',
    'table.tip.sec',
  ]) {
    assert.equal((i18n.match(new RegExp(`"${key}":`, 'g')) || []).length, 2, `${key} must exist in en and zh`)
  }
})

test('SWE scorecard rows expose the credibility verdict badge with three-gate tooltip text', () => {
  const scorecard = read('src/views/SweScorecard.vue')
  const comp = read('src/views/SweComp.vue')
  const helper = read('src/components/CellHelpers.ts')
  const i18n = read('src/lib/i18n.ts')

  assert.match(scorecard, /key: 'agency'/)
  assert.match(scorecard, /label: t\('col\.agency'\)/)
  assert.match(scorecard, /agencyBadge\(r\.__record\.agency, r\.__record\)/)
  assert.match(scorecard, /indicatorIconBadge/)
  assert.match(scorecard, /suspectErrorBadge/)
  assert.match(scorecard, /Trophy/)
  assert.match(scorecard, /History/)
  assert.doesNotMatch(scorecard, /'≈top'/)
  assert.doesNotMatch(scorecard, /t\('error\.suspect\.label'\)[\s\S]{0,120}\),\s*$/m)
  assert.match(comp, /agencyBadge\(r\._rec\.agency, r\._rec\)/)
  assert.match(helper, /function credibilityDims\(agency: any, source: any\)/)
  assert.match(helper, /infraFromStatus/)
  assert.doesNotMatch(helper, /verify_error[^\n]*infraFromStatus|infraFromStatus[\s\S]{0,200}verify_error/, 'infra dim must NOT fold verify_error (footing.infra_casualty parity)')
  assert.match(helper, /capFromSource/)
  assert.match(helper, /'aria-label': `\$\{localizedLabel\}: \$\{dimText\}`/)

  for (const key of ['agency.dim.noop', 'agency.dim.infra', 'agency.dim.cap', 'agency.pctUnknown', 'agency.label.clean']) {
    assert.equal((i18n.match(new RegExp(`"${key}":`, 'g')) || []).length, 2, `${key} must exist in en and zh`)
  }
})

test('SWE board indicators use compact icon badges instead of long text pills', () => {
  const comp = read('src/views/SweComp.vue')
  const scorecard = read('src/views/SweScorecard.vue')
  const norm = read('src/views/SweNorm.vue')
  const shared = read('src/views/SweShared.vue')
  const helper = read('src/components/CellHelpers.ts')

  assert.match(helper, /export function indicatorIconBadge/)
  assert.match(helper, /export function foldedRoutesBadge/)
  assert.match(helper, /export function foldedVariantsBadge/)
  assert.match(helper, /export function suspectErrorBadge/)
  assert.match(comp, /foldedRoutesBadge\(r\.variantCount, t\)/)
  assert.match(comp, /suspectErrorBadge\(r\._rec\.suspect_error_count, t\)/)
  assert.match(comp, /usageScenarioBadge\(r\.usage\)/)
  assert.match(helper, /export function usageScenarioBadge/)
  assert.doesNotMatch(comp, /`\$\{r\.usage\.icon\} \$\{r\.usage\.label\}`/)
  assert.doesNotMatch(comp, /t\('fold\.routes\.badge'\)\.replace\('\{n\}'/)
  assert.match(scorecard, /foldedVariantsBadge\(r\.variantCount, t\)/)
  assert.match(norm, /foldedVariantsBadge\(r\.variantCount, t\)/)
  assert.match(shared, /suspectErrorBadge\(r\.__record\.suspect_error_count, t\)/)
})

test('cloud speed page gives correct answers per minute the main visual weight', () => {
  const view = read('src/views/SpeedCloud.vue')
  const i18n = read('src/lib/i18n.ts')

  assert.match(view, /const leaderRows = computed/)
  assert.match(view, /leaderRows/)
  assert.match(view, /description: t\('cloud\.tip\.primary'\)/)
  assert.match(view, /text-2xl font-bold/)
  assert.match(view, /:default-sort="'perMin'"/)

  for (const key of [
    'cloud.primary.desc',
    'cloud.primary.unit',
    'cloud.tip.primary',
    'cloud.tip.agenticTokS',
    'cloud.tip.avgSolve',
  ]) {
    assert.equal((i18n.match(new RegExp(`"${key}":`, 'g')) || []).length, 2, `${key} must exist in en and zh`)
  }
})
