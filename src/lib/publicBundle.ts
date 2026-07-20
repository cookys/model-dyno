import type {
  CompIndex,
  DomainCell,
  DomainIndex,
  ExamVersionInfo,
  NormIndex,
  SharedSweCell,
  SpeedRecord,
  SweCell,
  SweMeta,
} from './store'

export const PUBLIC_BUNDLE_SCHEMA_VERSIONS = [
  'public_bundle.v1',
  'public_bundle.v2',
  'public_bundle.v3',
] as const

export type PublicBundleSchemaVersion = typeof PUBLIC_BUNDLE_SCHEMA_VERSIONS[number]

const PUBLIC_BUNDLE_DATA_FILES = [
  'benches.json',
  'subjects.json',
  'runs.json',
  'scores.json',
] as const

type PublicBundleDataFile = typeof PUBLIC_BUNDLE_DATA_FILES[number]
type JsonObject = Record<string, unknown>

export interface PublicBundleManifest {
  schema_version: PublicBundleSchemaVersion
  created_at?: string
  file_hashes?: Partial<Record<PublicBundleDataFile, string>>
  manifest_digest?: string
}

export interface PublicBundle {
  manifest: PublicBundleManifest
  benches: JsonObject[]
  subjects: JsonObject[]
  runs: JsonObject[]
  scores: JsonObject[]
}

export interface PublicBundleFeedEntry {
  id?: string
  base_url: string
  current?: boolean
  label?: string
  owner?: string
  machine?: string
  publisher?: string
  operator?: string
  access_label?: string
}

export interface PublicBundleScorecardProjection {
  cells: SweCell[]
  meta: SweMeta | null
  loaded: boolean
}

export interface PublicBundleDashboardProjection extends PublicBundleScorecardProjection {
  generatedAt: string | null
  records: SpeedRecord[]
  sharedCells: SharedSweCell[]
  norm: NormIndex | null
  comp: CompIndex | null
  domainIndex: DomainIndex | null
}

interface PublicBundleProjectionMetadata {
  owner?: string
  machine?: string
  publisher?: string
  operator?: string
  access_label?: string
}

interface NormalizedPublicBundleFeed {
  entries: PublicBundleFeedEntry[]
  current: string | null
  generatedAt: string | null
  taskDomainsUrl: string | null
  meta: SweMeta | null
}

const isObject = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const asObject = (value: unknown): JsonObject =>
  isObject(value) ? value : {}

const requireObject = (value: unknown, where: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${where} must be an object`)
  return value
}

const requireObjectArray = (value: unknown, where: string): JsonObject[] => {
  if (!Array.isArray(value)) throw new Error(`${where} must be an array`)
  if (!value.every(isObject)) throw new Error(`${where} must contain objects only`)
  return value
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const boolOrNull = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const nonNegativeInt = (value: unknown): number | null => {
  if (!Number.isInteger(value)) return null
  const n = Number(value)
  return n >= 0 ? n : null
}

const supportedSchemaVersion = (value: unknown): PublicBundleSchemaVersion | null =>
  PUBLIC_BUNDLE_SCHEMA_VERSIONS.find((v) => v === value) ?? null

function parseManifestFileHashes(value: unknown): Partial<Record<PublicBundleDataFile, string>> {
  const hashes = requireObject(value, 'manifest.file_hashes')
  const keys = Object.keys(hashes).sort()
  if (keys.join('\n') !== [...PUBLIC_BUNDLE_DATA_FILES].sort().join('\n')) {
    throw new Error('manifest.file_hashes must cover exactly benches.json, subjects.json, runs.json, scores.json')
  }
  for (const file of PUBLIC_BUNDLE_DATA_FILES) {
    if (!stringOrNull(hashes[file])) throw new Error(`manifest.file_hashes.${file} must be a non-empty string`)
  }
  return hashes as Partial<Record<PublicBundleDataFile, string>>
}

export function parsePublicBundle(raw: {
  manifest: unknown
  benches: unknown
  subjects: unknown
  runs: unknown
  scores: unknown
}): PublicBundle {
  const manifestRaw = requireObject(raw.manifest, 'manifest')
  const schemaVersion = supportedSchemaVersion(manifestRaw.schema_version)
  if (!schemaVersion) {
    throw new Error(`Unsupported PublicBundle schema_version: ${String(manifestRaw.schema_version ?? 'missing')}`)
  }

  return {
    manifest: {
      schema_version: schemaVersion,
      created_at: stringOrNull(manifestRaw.created_at) ?? undefined,
      file_hashes: parseManifestFileHashes(manifestRaw.file_hashes),
      manifest_digest: stringOrNull(manifestRaw.manifest_digest) ?? undefined,
    },
    benches: requireObjectArray(raw.benches, 'benches.json'),
    subjects: requireObjectArray(raw.subjects, 'subjects.json'),
    runs: requireObjectArray(raw.runs, 'runs.json'),
    scores: requireObjectArray(raw.scores, 'scores.json'),
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.json()
}

export async function loadPublicBundle(baseUrl: string): Promise<PublicBundle> {
  const base = normalizeBaseUrl(baseUrl)
  const [manifest, benches, subjects, runs, scores] = await Promise.all([
    fetchJson(`${base}manifest.json`),
    fetchJson(`${base}benches.json`),
    fetchJson(`${base}subjects.json`),
    fetchJson(`${base}runs.json`),
    fetchJson(`${base}scores.json`),
  ])
  return parsePublicBundle({ manifest, benches, subjects, runs, scores })
}

function wilsonCi(passed: number, total: number): [number, number] {
  if (total <= 0) return [0, 1]
  const z = 1.96
  const phat = passed / total
  const denom = 1 + (z * z) / total
  const centre = phat + (z * z) / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)
  return [
    Math.max(0, (centre - margin) / denom),
    Math.min(1, (centre + margin) / denom),
  ]
}

function benchDisplayName(bench: JsonObject | undefined, fallback: string): string {
  return stringOrNull(bench?.display_name) ?? fallback
}

function benchVersion(bench: JsonObject | undefined, benchDigest: string | null): string {
  return stringOrNull(bench?.bench_id)
    ?? (benchDigest ? `bench:${benchDigest.slice(0, 12)}` : 'public-bundle')
}

function subjectDisplay(subject: JsonObject | undefined, comparisonKey: JsonObject, run: JsonObject | undefined): string {
  return stringOrNull(subject?.model)
    ?? stringOrNull(comparisonKey.model)
    ?? stringOrNull(run?.adapter_name)
    ?? stringOrNull(subject?.display_slug)
    ?? 'unknown'
}

function subjectProfile(subject: JsonObject | undefined, comparisonKey: JsonObject): string | undefined {
  return stringOrNull(subject?.display_slug)
    ?? stringOrNull(comparisonKey.policy)
    ?? undefined
}

function subjectAccess(backend: string | null): string | undefined {
  if (!backend) return undefined
  return backend.includes('local') ? 'local' : 'remote'
}

function statusCounts(aggregate: JsonObject): Record<string, number> {
  const pass = nonNegativeInt(aggregate.n_pass) ?? 0
  const fail = nonNegativeInt(aggregate.n_fail) ?? 0
  const error = nonNegativeInt(aggregate.n_error) ?? 0
  const infra = nonNegativeInt(aggregate.n_infra_error) ?? 0
  return {
    ok: pass + fail,
    infra_error: infra,
    verify_error: error,
  }
}

function rateDenominator(aggregate: JsonObject): number {
  const pass = nonNegativeInt(aggregate.n_pass) ?? 0
  const fail = nonNegativeInt(aggregate.n_fail) ?? 0
  return pass + fail
}

function nanoUsdPerSolved(cost: JsonObject, passed: number): number | undefined {
  if (passed <= 0) return undefined
  const total = finiteNumberOrNull(cost.total_cost_nano_usd)
  return total === null ? undefined : total / 1_000_000_000 / passed
}

function tokensPerSolved(usage: JsonObject, passed: number): number | undefined {
  if (passed <= 0) return undefined
  const input = nonNegativeInt(usage.input_tokens)
  const cached = nonNegativeInt(usage.cached_input_tokens)
  const output = nonNegativeInt(usage.output_tokens)
  if (input === null && cached === null && output === null) return undefined
  return ((input ?? 0) + (cached ?? 0) + (output ?? 0)) / passed
}

export function projectScorecardRowsFromPublicBundle(
  bundle: PublicBundle,
  metadata: PublicBundleProjectionMetadata = {},
): SweCell[] {
  const benchesByDigest = new Map<string, JsonObject>()
  for (const bench of bundle.benches) {
    const digest = stringOrNull(bench.content_digest)
    if (digest) benchesByDigest.set(digest, bench)
  }

  const subjectsByDigest = new Map<string, JsonObject>()
  for (const subject of bundle.subjects) {
    const digest = stringOrNull(subject.subject_digest)
    if (digest) subjectsByDigest.set(digest, subject)
  }

  const runsById = new Map<string, JsonObject>()
  for (const run of bundle.runs) {
    const runId = stringOrNull(run.run_id)
    if (runId) runsById.set(runId, run)
  }

  return bundle.scores.flatMap((score): SweCell[] => {
    const runId = stringOrNull(score.run_id)
    if (!runId) return []

    const run = runsById.get(runId)
    const comparisonKey = asObject(score.comparison_key)
    const aggregate = asObject(score.aggregate)
    const footing = asObject(score.footing)
    const cost = asObject(score.cost)
    const usage = asObject(score.usage)

    const benchDigest = stringOrNull(comparisonKey.bench_digest) ?? stringOrNull(run?.bench_digest)
    const bench = benchDigest ? benchesByDigest.get(benchDigest) : undefined
    const subjectDigest = stringOrNull(run?.subject_digest)
    const subject = subjectDigest ? subjectsByDigest.get(subjectDigest) : undefined

    const nPassed = nonNegativeInt(aggregate.n_pass)
    const nTasks = nonNegativeInt(aggregate.n_tasks)
    const headline = finiteNumberOrNull(aggregate.pass_rate)
    if (nPassed === null || nTasks === null || headline === null) return []

    const denominator = rateDenominator(aggregate) || nTasks
    const benchId = benchVersion(bench, benchDigest)
    const backend = stringOrNull(comparisonKey.backend) ?? stringOrNull(subject?.backend)
    const runPartial = boolOrNull(run?.partial)
    const comparable = boolOrNull(footing.comparable)
      ?? boolOrNull(comparisonKey.comparable)
      ?? (runPartial === null ? undefined : !runPartial)
    const costCoverage = stringOrNull(cost.coverage)
    const usageCoverage = stringOrNull(usage.coverage)

    return [{
      model: stringOrNull(comparisonKey.model) ?? subjectDisplay(subject, comparisonKey, run),
      cell: stringOrNull(subject?.display_slug) ?? undefined,
      display: subjectDisplay(subject, comparisonKey, run),
      source: `public-bundle:${benchId}`,
      owner: metadata.owner,
      profile: subjectProfile(subject, comparisonKey),
      machine: metadata.machine,
      publisher: metadata.publisher,
      operator: metadata.operator,
      harness: stringOrNull(comparisonKey.harness) ?? stringOrNull(subject?.harness) ?? undefined,
      access_label: metadata.access_label,
      comparable,
      n_graded: nTasks,
      n_passed: nPassed,
      canonical_version: benchId,
      n_canon: nonNegativeInt(bench?.task_count) ?? nTasks,
      owed: Math.max(0, (nonNegativeInt(bench?.task_count) ?? nTasks) - nTasks),
      headline,
      headline_ci: wilsonCi(nPassed, denominator),
      capability_est: headline,
      capability_est_ci: wilsonCi(nPassed, denominator),
      integrity: (nonNegativeInt(aggregate.n_infra_error) ?? 0) > 0 ? 'infra-suspect' : 'ok',
      status_counts: statusCounts(aggregate),
      status_denominator: nTasks,
      suspect_error_count: (nonNegativeInt(aggregate.n_error) ?? 0) + (nonNegativeInt(aggregate.n_infra_error) ?? 0),
      suspect_error_rate: nTasks > 0
        ? ((nonNegativeInt(aggregate.n_error) ?? 0) + (nonNegativeInt(aggregate.n_infra_error) ?? 0)) / nTasks
        : 0,
      tok_per_solved: usageCoverage === 'full' ? tokensPerSolved(usage, nPassed) : undefined,
      usd_per_solved: costCoverage === 'full' ? nanoUsdPerSolved(cost, nPassed) : undefined,
      price_known: costCoverage === 'full',
      tags: backend ? { placement: backend.includes('local') ? 'local' : 'remote' } : undefined,
      identity: {
        access: subjectAccess(backend),
        canonical_model: stringOrNull(comparisonKey.model) ?? stringOrNull(subject?.model) ?? undefined,
      },
    }]
  })
}

export function projectSharedCellsFromScorecardRows(cells: SweCell[]): SharedSweCell[] {
  return cells.map((cell): SharedSweCell => ({
    model: cell.model,
    owner: cell.owner,
    harness: cell.harness,
    machine: cell.machine,
    profile: cell.profile,
    n_graded: cell.n_graded,
    n_passed: cell.n_passed,
    headline: cell.headline,
    headline_ci: cell.headline_ci,
    capability_est: cell.capability_est,
    capability_est_ci: cell.capability_est_ci,
    comparable: cell.comparable,
    suspect_error_count: cell.suspect_error_count,
    suspect_error_rate: cell.suspect_error_rate,
    integrity: cell.integrity,
    status_counts: cell.status_counts,
    status_denominator: cell.status_denominator,
  }))
}

export function projectNormIndexFromScorecardRows(cells: SweCell[], meta: SweMeta | null): NormIndex | null {
  if (!cells.length) return null
  const current = meta?.current_exam ?? cells[0]?.canonical_version ?? 'public-bundle'
  const currentTaskCount = meta?.current_exam_n_tasks ?? meta?.n_canon ?? cells[0]?.n_canon ?? 0
  return {
    cells: cells.map((cell) => {
      const passRate = finiteNumberOrNull(cell.headline) ?? 0
      const ci = cell.headline_ci ?? wilsonCi(cell.n_passed ?? 0, cell.n_graded ?? 0)
      const nGraded = cell.n_graded ?? 0
      const nCanon = cell.n_canon ?? currentTaskCount
      return {
        model: cell.model,
        source: cell.source ?? 'public-bundle',
        n_passed: cell.n_passed ?? 0,
        n_graded: nGraded,
        n_on_set: nGraded,
        comparable: cell.comparable,
        coverage: nCanon ? nGraded / nCanon : undefined,
        pass_rate: passRate,
        ci,
        publisher: cell.publisher,
        operator: cell.operator,
        harness: cell.harness,
        access_label: cell.access_label,
        identity: cell.identity,
        tags: cell.tags,
        display: cell.display,
        cell: cell.cell,
      }
    }),
    n_tasks: currentTaskCount,
    task_set: current,
    version_aware: true,
    current_exam: current,
  }
}

export function projectCompIndexFromScorecardRows(cells: SweCell[], meta: SweMeta | null): CompIndex | null {
  if (!cells.length) return null
  return {
    exam: meta?.current_exam_label ?? meta?.current_exam ?? cells[0]?.canonical_version ?? undefined,
    cells: cells.map((cell) => {
      const acc = finiteNumberOrNull(cell.headline) ?? 0
      const ci = cell.headline_ci ?? wilsonCi(cell.n_passed ?? 0, cell.n_graded ?? 0)
      return {
        model: cell.model,
        publisher: cell.publisher,
        operator: cell.operator,
        harness: cell.harness,
        access_label: cell.access_label,
        machine: cell.machine,
        cell: cell.cell ?? cell.profile ?? cell.model,
        source: cell.source ?? 'public-bundle',
        comparable: cell.comparable,
        acc,
        ci_lo: ci[0],
        ci_hi: ci[1],
        passed: cell.n_passed ?? 0,
        n: cell.n_graded ?? 0,
        sec_per_solved: cell.sec_per_solved,
        solved_per_hour: cell.solved_per_hour,
        tok_per_solved: cell.tok_per_solved,
        cost_per_solved: cell.usd_per_solved,
        price_known: cell.price_known,
        identity: cell.identity,
        tags: cell.tags,
        display: cell.display,
        integrity: cell.integrity,
        status_counts: cell.status_counts,
        status_denominator: cell.status_denominator,
        suspect_error_count: cell.suspect_error_count,
        suspect_error_rate: cell.suspect_error_rate,
        agency: cell.agency,
      }
    }),
  }
}

export function projectDomainIndexFromPublicBundles(
  bundles: PublicBundle[],
  meta: SweMeta | null,
  taskDomains: Record<string, string> = {},
): DomainIndex | null {
  const domains = new Set<string>()
  const cells = bundles.flatMap((bundle) => {
    const runsById = new Map<string, JsonObject>()
    for (const run of bundle.runs) {
      const runId = stringOrNull(run.run_id)
      if (runId) runsById.set(runId, run)
    }

    const subjectsByDigest = new Map<string, JsonObject>()
    for (const subject of bundle.subjects) {
      const digest = stringOrNull(subject.subject_digest)
      if (digest) subjectsByDigest.set(digest, subject)
    }

    return bundle.scores.flatMap((score) => {
      const runId = stringOrNull(score.run_id)
      const run = runId ? runsById.get(runId) : undefined
      const subjectDigest = stringOrNull(run?.subject_digest)
      const subject = subjectDigest
        ? subjectsByDigest.get(subjectDigest)
        : undefined
      const comparisonKey = asObject(score.comparison_key)
      const entries = Array.isArray(score.entries) ? score.entries.filter(isObject) : []
      if (!entries.length) return []

      const by_domain: DomainCell['by_domain'] = {}
      for (const entry of entries) {
        const taskId = stringOrNull(entry.task_id)
        const domain = taskId && typeof taskDomains[taskId] === 'string' && taskDomains[taskId].trim()
          ? taskDomains[taskId].trim()
          : '_unknown'
        domains.add(domain)
        const stat = by_domain[domain] ?? { passed: 0, n: 0, acc: null }
        stat.n += 1
        if (stringOrNull(entry.verdict)?.toUpperCase() === 'PASS') stat.passed += 1
        stat.acc = stat.n ? stat.passed / stat.n : null
        by_domain[domain] = stat
      }

      const n = entries.length
      const label = subjectDisplay(subject, comparisonKey, run)
      return [{
        cell: stringOrNull(subject?.display_slug) ?? label,
        model: stringOrNull(comparisonKey.model) ?? label,
        backend: stringOrNull(comparisonKey.backend) ?? stringOrNull(subject?.backend),
        n,
        by_domain,
      }]
    })
  })
  if (!cells.length) return null
  return {
    exam: meta?.current_exam ?? undefined,
    comparable_min: meta?.comparable_min,
    domains: Array.from(domains).sort(),
    cells,
  }
}

function buildScorecardMeta(
  cells: SweCell[],
  bundles: PublicBundle[],
  feedCurrent: string | null,
  feedMeta: SweMeta | null = null,
): SweMeta | null {
  if (!cells.length) return null

  if (feedMeta?.exam_versions?.length) {
    const versions = feedMeta.exam_versions
    const current = versions.find((v) => v.current)
      ?? versions.find((v) => v.version === feedCurrent)
      ?? versions[0]
    return {
      current_exam: feedMeta.current_exam ?? current?.version ?? null,
      current_exam_label: feedMeta.current_exam_label ?? current?.label ?? null,
      current_exam_name: feedMeta.current_exam_name ?? current?.name ?? null,
      current_exam_n_tasks: feedMeta.current_exam_n_tasks ?? current?.n_tasks ?? null,
      n_canon: feedMeta.n_canon ?? current?.n_tasks ?? null,
      comparable_min: feedMeta.comparable_min,
      version_aware: feedMeta.version_aware ?? true,
      exam_versions: versions,
    }
  }

  const benchesById = new Map<string, JsonObject>()
  for (const bundle of bundles) {
    for (const bench of bundle.benches) {
      const version = benchVersion(bench, stringOrNull(bench.content_digest))
      if (!benchesById.has(version)) benchesById.set(version, bench)
    }
  }

  const versions = Array.from(benchesById.entries()).map(([version, bench]): ExamVersionInfo => ({
    version,
    label: benchDisplayName(bench, version),
    name: benchDisplayName(bench, version),
    date: stringOrNull(bench.freeze_time),
    note: null,
    n_tasks: nonNegativeInt(bench.task_count),
    current: version === feedCurrent,
  }))

  if (!versions.some((v) => v.current) && versions.length) {
    versions[0] = { ...versions[0], current: true }
  }

  const current = versions.find((v) => v.current) ?? versions[0]
  return {
    current_exam: current?.version ?? null,
    current_exam_label: current?.label ?? null,
    current_exam_name: current?.name ?? null,
    current_exam_n_tasks: current?.n_tasks ?? null,
    n_canon: current?.n_tasks ?? null,
    comparable_min: current?.n_tasks ?? undefined,
    version_aware: true,
    exam_versions: versions,
  }
}

function normalizeExamVersions(raw: unknown): ExamVersionInfo[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isObject)
    .map((v): ExamVersionInfo | null => {
      const version = stringOrNull(v.version)
      if (!version) return null
      const nTasks = nonNegativeInt(v.n_tasks)
      return {
        version,
        label: stringOrNull(v.label) ?? version,
        name: stringOrNull(v.name) ?? version,
        date: stringOrNull(v.date),
        note: stringOrNull(v.note),
        n_tasks: nTasks,
        current: boolOrNull(v.current) ?? false,
      }
    })
    .filter((v): v is ExamVersionInfo => v !== null)
}

function normalizeFeedEntries(raw: unknown): NormalizedPublicBundleFeed {
  const feed = asObject(raw)
  const bundles = Array.isArray(feed.bundles) ? feed.bundles : []
  const entries = bundles
    .filter(isObject)
    .map((entry): PublicBundleFeedEntry | null => {
      const base = stringOrNull(entry.base_url)
      if (!base) return null
      return {
        id: stringOrNull(entry.id) ?? undefined,
        base_url: base,
        current: boolOrNull(entry.current) ?? undefined,
        label: stringOrNull(entry.label) ?? undefined,
        owner: stringOrNull(entry.owner) ?? undefined,
        machine: stringOrNull(entry.machine) ?? undefined,
        publisher: stringOrNull(entry.publisher) ?? undefined,
        operator: stringOrNull(entry.operator) ?? undefined,
        access_label: stringOrNull(entry.access_label) ?? undefined,
      }
    })
    .filter((entry): entry is PublicBundleFeedEntry => entry !== null)
  const explicitCurrent = stringOrNull(feed.current_exam)
  const currentEntry = entries.find((entry) => entry.current)
  const current = explicitCurrent ?? currentEntry?.id ?? null
  const examVersions = normalizeExamVersions(feed.exam_versions)
  return {
    entries,
    current,
    generatedAt: stringOrNull(feed.generated_at),
    taskDomainsUrl: stringOrNull(feed.task_domains_url),
    meta: {
      current_exam: current,
      current_exam_label: stringOrNull(feed.current_exam_label),
      current_exam_name: stringOrNull(feed.current_exam_name),
      current_exam_n_tasks: nonNegativeInt(feed.current_exam_n_tasks),
      n_canon: nonNegativeInt(feed.n_canon),
      comparable_min: nonNegativeInt(feed.comparable_min) ?? undefined,
      version_aware: boolOrNull(feed.version_aware) ?? true,
      exam_versions: examVersions,
    },
  }
}

function normalizeTaskDomains(raw: unknown): Record<string, string> {
  const obj = asObject(raw)
  const out: Record<string, string> = {}
  for (const [taskId, domain] of Object.entries(obj)) {
    if (typeof domain === 'string' && domain.trim()) out[taskId] = domain.trim()
  }
  return out
}

export async function loadPublicBundleDashboardFeed(
  feedUrl = './public-bundles/index.json',
): Promise<PublicBundleDashboardProjection> {
  const feedRes = await fetch(feedUrl, { cache: 'no-cache' })
  if (!feedRes.ok) {
    if (feedRes.status === 404) {
      return {
        cells: [],
        meta: null,
        loaded: false,
        generatedAt: null,
        records: [],
        sharedCells: [],
        norm: null,
        comp: null,
        domainIndex: null,
      }
    }
    throw new Error(`HTTP ${feedRes.status} fetching ${feedUrl}`)
  }

  const feed = normalizeFeedEntries(await feedRes.json())
  if (!feed.entries.length) {
    return {
      cells: [],
      meta: null,
      loaded: true,
      generatedAt: feed.generatedAt,
      records: [],
      sharedCells: [],
      norm: null,
      comp: null,
      domainIndex: null,
    }
  }

  const loadedBundles = await Promise.all(feed.entries.map(async (entry) => ({
    entry,
    bundle: await loadPublicBundle(entry.base_url),
  })))
  const taskDomains = feed.taskDomainsUrl
    ? normalizeTaskDomains(await fetchJson(feed.taskDomainsUrl))
    : {}
  const bundles = loadedBundles.map((item) => item.bundle)
  const cells = loadedBundles.flatMap(({ entry, bundle }) => projectScorecardRowsFromPublicBundle(bundle, entry))
  const meta = buildScorecardMeta(cells, bundles, feed.current, feed.meta)
  return {
    cells,
    meta,
    loaded: true,
    generatedAt: feed.generatedAt,
    records: [],
    sharedCells: projectSharedCellsFromScorecardRows(cells),
    norm: projectNormIndexFromScorecardRows(cells, meta),
    comp: projectCompIndexFromScorecardRows(cells, meta),
    domainIndex: projectDomainIndexFromPublicBundles(bundles, meta, taskDomains),
  }
}

export async function loadPublicBundleScorecardFeed(
  feedUrl = './public-bundles/index.json',
): Promise<PublicBundleScorecardProjection> {
  const projection = await loadPublicBundleDashboardFeed(feedUrl)
  return {
    cells: projection.cells,
    meta: projection.meta,
    loaded: projection.loaded,
  }
}
