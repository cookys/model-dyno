import type {
  CellGates,
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
  'public_bundle.v4',
  'public_bundle.v5',
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
  billing?: string
  /** Producer's structured experiment-axis tags (engine/quant/draft/lineage/thinking/temp/variant/…). */
  tags?: Record<string, string>
  /** 3-gate credibility block (infra/noop/trunc/maxstep pct + verdict). */
  gates?: CellGates
  n_runs?: number
  headline_range?: [number, number]
}

export interface PublicBundleScorecardProjection {
  cells: SweCell[]
  meta: SweMeta | null
  loaded: boolean
}

/** Fleet machine spec row from the snapshot `machines` section (real hardware, not editorial). */
export interface FleetMachine {
  profile: string
  aliases: string[]
  gpu_name: string | null
  gpu_vendor: string | null
  gpu_count: number | null
  memory_kind: string | null
  vram_pool_gb: number | null
  vram_total_gb: number | null
  vram_per_gpu_gb: number | null
  vram_practical_gb: number | null
  vram_usable_gb: number | null
  alloc_cap_gb: number | null
}

/** Weight checkpoint row from the snapshot `model_registry` section (models/registry/*.toml). */
export interface RegistryModel {
  alias: string
  family: string | null
  hf_repo: string | null
  license: string | null
  quant: string | null
  weights_gb: number | null
  params_total_b: number | null
  params_active_b: number | null
  context_max: number | null
}

/** Launch config row from the snapshot `run_configs` section (configs/<tier>/*.toml). */
export interface RunConfig {
  config: string
  model: string | null
  model_key: string | null
  engine: string | null
  tier: string | null
  ctx_size: number | null
  n_gpu_layers: number | null
  split_mode: string | null
  jinja: boolean | null
  methods: string[]
  sampler_temp: number | null
  sampler_top_p: number | null
  sampler_top_k: number | null
  sampler_min_p: number | null
}

/** Curated finding (plan 060 narrative layer): claim vs measured, with evidence + repro. */
export interface FindingEvidence {
  metric: string | null
  value: string | null
  detail: string | null
}

export interface Finding {
  id: string
  title_en: string | null
  title_zh: string | null
  claim_en: string | null
  claim_zh: string | null
  measured_en: string | null
  measured_zh: string | null
  caveat_en: string | null
  conditions: string | null
  date: string | null
  source: string | null
  repro_en: string | null
  evidence: FindingEvidence[]
}

/** Deep-context latency receipt (cold vs hot TTFT at real context depths). */
export interface DepthFinding {
  machine: string | null
  config: string | null
  metric: string | null
  context: number | null
  concurrency: number | null
  state: string | null
  value: number | null
  date: string | null
  note: string | null
  source: string | null
}

/** Speculative-decoding verdict row (real measured speedups, wins AND losses). */
export interface SpecDecodeFinding {
  machine: string | null
  target: string | null
  method: string | null
  metric: string | null
  workload: string | null
  speedup: number | null
  accept: string | null
  verdict: string | null
  note: string | null
  source: string | null
}

export interface PublicBundleDashboardProjection extends PublicBundleScorecardProjection {
  generatedAt: string | null
  records: SpeedRecord[]
  sharedCells: SharedSweCell[]
  norm: NormIndex | null
  comp: CompIndex | null
  domainIndex: DomainIndex | null
  machines: FleetMachine[]
  modelRegistry: RegistryModel[]
  runConfigs: RunConfig[]
  findings: Finding[]
  depthFindings: DepthFinding[]
  specDecodeFindings: SpecDecodeFinding[]
  /** Task id → domain id map for the exam bank (drives the per-task matrix layer). */
  taskDomains: Record<string, string>
}

interface PublicBundleProjectionMetadata {
  owner?: string
  machine?: string
  publisher?: string
  operator?: string
  access_label?: string
  billing?: string
  tags?: Record<string, string>
  gates?: CellGates
  n_runs?: number
  headline_range?: [number, number]
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

/** Plan 051 §2.3: tok/✓ is output-only (matches competitiveness.py). */
function tokensPerSolved(usage: JsonObject, passed: number): number | undefined {
  if (passed <= 0) return undefined
  if (stringOrNull(usage.coverage) !== 'full') return undefined
  const output = nonNegativeInt(usage.output_tokens)
  if (output === null || output <= 0) return undefined
  return output / passed
}

/** Plan 051 §2.3 + plan 052 perf.v2 — never 0/Infinity; gate failures → undefined. */
function derivePerfMetrics(
  usage: JsonObject,
  perf: JsonObject,
  nPassed: number,
): {
  sec_per_solved?: number
  solved_per_hour?: number
  agentic_tok_s?: number
  med_wall?: number
  med_wall_pass?: number
  mean_wall_pass?: number
  tok_per_solved?: number
  perf_coverage?: string
  fail_wall_share?: number
  maxstep_fail_n?: number
  maxstep_fail_wall_share?: number
  speed_verdict?: string
} {
  const coverage = stringOrNull(perf.coverage)
  const wallTotal = finiteNumberOrNull(perf.wall_seconds_total)
  const medWall = finiteNumberOrNull(perf.wall_seconds_median)
  const medPass = finiteNumberOrNull(perf.wall_seconds_median_pass)
  const sumPass = finiteNumberOrNull(perf.wall_seconds_sum_pass)
  const nPassTimed = nonNegativeInt(perf.n_records_timed_pass)
  const usageCoverage = stringOrNull(usage.coverage)
  const output = nonNegativeInt(usage.output_tokens)

  const out: {
    sec_per_solved?: number
    solved_per_hour?: number
    agentic_tok_s?: number
    med_wall?: number
    med_wall_pass?: number
    mean_wall_pass?: number
    tok_per_solved?: number
    perf_coverage?: string
    fail_wall_share?: number
    maxstep_fail_n?: number
    maxstep_fail_wall_share?: number
    speed_verdict?: string
  } = {}
  if (coverage) out.perf_coverage = coverage
  if (medWall !== null) out.med_wall = medWall

  if (coverage === 'full' && nPassed > 0 && wallTotal !== null) {
    out.sec_per_solved = wallTotal / nPassed
    if (wallTotal > 0) {
      out.solved_per_hour = nPassed / (wallTotal / 3600)
      if (usageCoverage === 'full' && output !== null && output > 0) {
        out.agentic_tok_s = output / wallTotal
      }
    }
  }
  // plan 052: pass-conditioned primary (only when publisher left pass keys non-null)
  if (coverage === 'full' && medPass !== null) {
    out.med_wall_pass = medPass
  }
  if (coverage === 'full' && sumPass !== null && nPassTimed !== null && nPassTimed > 0) {
    out.mean_wall_pass = sumPass / nPassTimed
  }
  // pass-conditioned ✓/h for speed/* ranking (plan 052)
  if (out.mean_wall_pass !== undefined && out.mean_wall_pass > 0) {
    ;(out as { solved_per_hour_pass?: number }).solved_per_hour_pass = 3600 / out.mean_wall_pass
  }
  const fws = finiteNumberOrNull(perf.fail_wall_share)
  if (fws !== null) out.fail_wall_share = fws
  const mfn = nonNegativeInt(perf.maxstep_fail_n)
  if (mfn !== null) out.maxstep_fail_n = mfn
  const mfws = finiteNumberOrNull(perf.maxstep_fail_wall_share)
  if (mfws !== null) out.maxstep_fail_wall_share = mfws
  const sv = stringOrNull(perf.speed_verdict)
  if (sv) out.speed_verdict = sv

  const tok = tokensPerSolved(usage, nPassed)
  if (tok !== undefined) out.tok_per_solved = tok
  return out
}

function taskVerdictsOf(run: JsonObject | undefined): Record<string, string> | undefined {
  const raw = run?.task_verdicts
  if (!isObject(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v) out[k] = v.toUpperCase()
  }
  return Object.keys(out).length ? out : undefined
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
    const perf = asObject(score.perf)

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
    const perfMetrics = derivePerfMetrics(usage, perf, nPassed)

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
      billing: metadata.billing,
      comparable,
      n_graded: nTasks,
      n_passed: nPassed,
      canonical_version: benchId,
      n_canon: nonNegativeInt(bench?.task_count) ?? nTasks,
      n_exam: nonNegativeInt(bench?.task_count) ?? nTasks,
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
      tok_per_solved: perfMetrics.tok_per_solved,
      sec_per_solved: perfMetrics.sec_per_solved,
      sec_per_solved_all: perfMetrics.sec_per_solved,
      solved_per_hour: perfMetrics.solved_per_hour,
      agentic_tok_s: perfMetrics.agentic_tok_s,
      med_wall: perfMetrics.med_wall,
      med_wall_pass: perfMetrics.med_wall_pass,
      mean_wall_pass: perfMetrics.mean_wall_pass,
      solved_per_hour_pass: (perfMetrics as { solved_per_hour_pass?: number }).solved_per_hour_pass,
      fail_wall_share: perfMetrics.fail_wall_share,
      maxstep_fail_n: perfMetrics.maxstep_fail_n,
      maxstep_fail_wall_share: perfMetrics.maxstep_fail_wall_share,
      speed_credibility: perfMetrics.speed_verdict
        ? { verdict: perfMetrics.speed_verdict }
        : undefined,
      usd_per_solved: costCoverage === 'full' ? nanoUsdPerSolved(cost, nPassed) : undefined,
      price_known: costCoverage === 'full',
      // Producer's structured axis tags win; the placement fallback survives for feeds without tags.
      tags: metadata.tags
        ?? (backend ? { placement: backend.includes('local') ? 'local' : 'remote' } : undefined),
      identity: {
        access: subjectAccess(backend),
        canonical_model: stringOrNull(comparisonKey.model) ?? stringOrNull(subject?.model) ?? undefined,
      },
      scored_at: stringOrNull(score.scored_at) ?? undefined,
      run_role: stringOrNull(footing.role) ?? undefined,
      gates: metadata.gates,
      n_runs: metadata.n_runs,
      headline_range: metadata.headline_range,
      task_verdicts: taskVerdictsOf(run),
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

/** plan 053: exam size SSOT from feed meta (never invent from max cell n). */
function examSizeFromMeta(meta: SweMeta | null, cells: SweCell[] = []): {
  nExam: number
  comparableMin: number | undefined
} {
  const nExam =
    nonNegativeInt(meta?.n_exam)
    ?? nonNegativeInt(meta?.current_exam_n_tasks)
    ?? nonNegativeInt(meta?.n_canon)
    ?? nonNegativeInt(cells[0]?.n_exam)
    ?? nonNegativeInt(cells[0]?.n_canon)
    ?? 0
  const comparableMin =
    nonNegativeInt(meta?.comparable_min)
    ?? (nExam > 0 ? Math.max(1, Math.round(0.9 * nExam)) : undefined)
  return { nExam, comparableMin }
}

export function projectNormIndexFromScorecardRows(cells: SweCell[], meta: SweMeta | null): NormIndex | null {
  if (!cells.length) return null
  const current = meta?.current_exam ?? cells[0]?.canonical_version ?? 'public-bundle'
  const { nExam, comparableMin } = examSizeFromMeta(meta, cells)
  const currentTaskCount = nExam
  return {
    cells: cells.map((cell) => {
      const passRate = finiteNumberOrNull(cell.headline) ?? 0
      const ci = cell.headline_ci ?? wilsonCi(cell.n_passed ?? 0, cell.n_graded ?? 0)
      const nGraded = cell.n_graded ?? 0
      const nCanon = cell.n_exam ?? cell.n_canon ?? currentTaskCount
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
        owed: cell.owed,
        n_exam: nCanon || null,
        n_canon: nCanon || null,
      }
    }),
    n_tasks: currentTaskCount,
    task_set: current,
    version_aware: true,
    current_exam: current,
    n_exam: currentTaskCount || undefined,
    n_canon: currentTaskCount || undefined,
    comparable_min: comparableMin,
  }
}

export function projectCompIndexFromScorecardRows(cells: SweCell[], meta: SweMeta | null): CompIndex | null {
  if (!cells.length) return null
  const { nExam, comparableMin } = examSizeFromMeta(meta, cells)
  return {
    exam: meta?.current_exam_label ?? meta?.current_exam ?? cells[0]?.canonical_version ?? undefined,
    n_exam: nExam || undefined,
    n_canon: nExam || undefined,
    comparable_min: comparableMin,
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
        n_exam: cell.n_exam ?? cell.n_canon ?? (nExam || null),
        n_canon: cell.n_canon ?? cell.n_exam ?? (nExam || null),
        owed: cell.owed,
        sec_per_solved: cell.sec_per_solved,
        sec_per_solved_all: cell.sec_per_solved_all ?? cell.sec_per_solved,
        solved_per_hour: cell.solved_per_hour,
        tok_per_solved: cell.tok_per_solved,
        agentic_tok_s: cell.agentic_tok_s,
        med_wall: cell.med_wall,
        med_wall_pass: cell.med_wall_pass,
        mean_wall_pass: cell.mean_wall_pass,
        solved_per_hour_pass: cell.solved_per_hour_pass,
        fail_wall_share: cell.fail_wall_share,
        maxstep_fail_n: cell.maxstep_fail_n,
        maxstep_fail_wall_share: cell.maxstep_fail_wall_share,
        speed_credibility: cell.speed_credibility,
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
    const nExam =
      nonNegativeInt(feedMeta.n_exam)
      ?? nonNegativeInt(feedMeta.current_exam_n_tasks)
      ?? nonNegativeInt(feedMeta.n_canon)
      ?? nonNegativeInt(current?.n_tasks)
      ?? null
    const comparableMin =
      nonNegativeInt(feedMeta.comparable_min)
      ?? (nExam != null && nExam > 0 ? Math.max(1, Math.round(0.9 * nExam)) : undefined)
    return {
      current_exam: feedMeta.current_exam ?? current?.version ?? null,
      current_exam_label: feedMeta.current_exam_label ?? current?.label ?? null,
      current_exam_name: feedMeta.current_exam_name ?? current?.name ?? null,
      current_exam_n_tasks: nExam,
      n_canon: nExam,
      n_exam: nExam,
      comparable_min: comparableMin,
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
  const nExam = nonNegativeInt(current?.n_tasks)
  // plan 053: comparable_min is 0.9·n_exam — NEVER equal to full n_tasks
  const comparableMin = nExam != null && nExam > 0
    ? Math.max(1, Math.round(0.9 * nExam))
    : undefined
  return {
    current_exam: current?.version ?? null,
    current_exam_label: current?.label ?? null,
    current_exam_name: current?.name ?? null,
    current_exam_n_tasks: nExam,
    n_canon: nExam,
    n_exam: nExam,
    comparable_min: comparableMin,
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
    .map(normalizeFeedEntry)
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
      n_canon: nonNegativeInt(feed.n_canon) ?? nonNegativeInt(feed.n_exam),
      n_exam: nonNegativeInt(feed.n_exam) ?? nonNegativeInt(feed.n_canon) ?? nonNegativeInt(feed.current_exam_n_tasks),
      comparable_min: nonNegativeInt(feed.comparable_min) ?? undefined,
      version_aware: boolOrNull(feed.version_aware) ?? true,
      exam_versions: examVersions,
    },
  }
}

function normalizeEntryTags(raw: unknown): Record<string, string> | undefined {
  if (!isObject(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v)
  }
  return Object.keys(out).length ? out : undefined
}

function normalizeEntryGates(raw: unknown): CellGates | undefined {
  if (!isObject(raw)) return undefined
  const gates: CellGates = {
    infra_pct: finiteNumberOrNull(raw.infra_pct) ?? undefined,
    noop_pct: finiteNumberOrNull(raw.noop_pct) ?? undefined,
    trunc_pct: finiteNumberOrNull(raw.trunc_pct) ?? undefined,
    maxstep_pct: finiteNumberOrNull(raw.maxstep_pct) ?? undefined,
    verdict: stringOrNull(raw.verdict) ?? undefined,
  }
  return gates.verdict != null || gates.infra_pct != null ? gates : undefined
}

function normalizeHeadlineRange(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined
  const lo = finiteNumberOrNull(raw[0])
  const hi = finiteNumberOrNull(raw[1])
  return lo != null && hi != null ? [lo, hi] : undefined
}

function normalizeFeedEntry(raw: unknown): PublicBundleFeedEntry | null {
  const entry = asObject(raw)
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
    // plan 056: the billing REGIME, derived producer-side from the cell's access route.
    // Lets the UI say whether a dollar figure is money actually spent (metered) or
    // notional against a plan/quota (subscription, token_plan) without guessing.
    billing: stringOrNull(entry.billing) ?? undefined,
    tags: normalizeEntryTags(entry.tags),
    gates: normalizeEntryGates(entry.gates),
    n_runs: nonNegativeInt(entry.n_runs) ?? undefined,
    headline_range: normalizeHeadlineRange(entry.headline_range),
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function normalizeMachines(raw: unknown): FleetMachine[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).flatMap((m): FleetMachine[] => {
    const profile = stringOrNull(m.profile)
    if (!profile) return []
    return [{
      profile,
      aliases: stringArray(m.aliases),
      gpu_name: stringOrNull(m.gpu_name),
      gpu_vendor: stringOrNull(m.gpu_vendor),
      gpu_count: finiteNumberOrNull(m.gpu_count),
      memory_kind: stringOrNull(m.memory_kind),
      vram_pool_gb: finiteNumberOrNull(m.vram_pool_gb),
      vram_total_gb: finiteNumberOrNull(m.vram_total_gb),
      vram_per_gpu_gb: finiteNumberOrNull(m.vram_per_gpu_gb),
      vram_practical_gb: finiteNumberOrNull(m.vram_practical_gb),
      vram_usable_gb: finiteNumberOrNull(m.vram_usable_gb),
      alloc_cap_gb: finiteNumberOrNull(m.alloc_cap_gb),
    }]
  })
}

function normalizeModelRegistry(raw: unknown): RegistryModel[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).flatMap((m): RegistryModel[] => {
    const alias = stringOrNull(m.alias)
    if (!alias) return []
    return [{
      alias,
      family: stringOrNull(m.family),
      hf_repo: stringOrNull(m.hf_repo),
      license: stringOrNull(m.license),
      quant: stringOrNull(m.quant),
      weights_gb: finiteNumberOrNull(m.weights_gb),
      params_total_b: finiteNumberOrNull(m.params_total_b),
      params_active_b: finiteNumberOrNull(m.params_active_b),
      context_max: finiteNumberOrNull(m.context_max),
    }]
  })
}

function normalizeRunConfigs(raw: unknown): RunConfig[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).flatMap((c): RunConfig[] => {
    const config = stringOrNull(c.config)
    if (!config) return []
    return [{
      config,
      model: stringOrNull(c.model),
      model_key: stringOrNull(c.model_key),
      engine: stringOrNull(c.engine),
      tier: stringOrNull(c.tier),
      ctx_size: finiteNumberOrNull(c.ctx_size),
      n_gpu_layers: finiteNumberOrNull(c.n_gpu_layers),
      split_mode: stringOrNull(c.split_mode),
      jinja: boolOrNull(c.jinja),
      methods: stringArray(c.methods),
      sampler_temp: finiteNumberOrNull(c.sampler_temp),
      sampler_top_p: finiteNumberOrNull(c.sampler_top_p),
      sampler_top_k: finiteNumberOrNull(c.sampler_top_k),
      sampler_min_p: finiteNumberOrNull(c.sampler_min_p),
    }]
  })
}

function normalizeFindings(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).flatMap((f): Finding[] => {
    const id = stringOrNull(f.id)
    if (!id) return []
    const evidence = Array.isArray(f.evidence)
      ? f.evidence.filter(isObject).map((e): FindingEvidence => ({
          metric: stringOrNull(e.metric),
          value: stringOrNull(e.value),
          detail: stringOrNull(e.detail),
        }))
      : []
    return [{
      id,
      title_en: stringOrNull(f.title_en),
      title_zh: stringOrNull(f.title_zh),
      claim_en: stringOrNull(f.claim_en),
      claim_zh: stringOrNull(f.claim_zh),
      measured_en: stringOrNull(f.measured_en),
      measured_zh: stringOrNull(f.measured_zh),
      caveat_en: stringOrNull(f.caveat_en),
      conditions: stringOrNull(f.conditions),
      date: stringOrNull(f.date),
      source: stringOrNull(f.source),
      repro_en: stringOrNull(f.repro_en),
      evidence,
    }]
  })
}

function normalizeDepthFindings(raw: unknown): DepthFinding[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map((d): DepthFinding => ({
    machine: stringOrNull(d.machine),
    config: stringOrNull(d.config),
    metric: stringOrNull(d.metric),
    context: finiteNumberOrNull(d.context),
    concurrency: finiteNumberOrNull(d.concurrency),
    state: stringOrNull(d.state),
    value: finiteNumberOrNull(d.value),
    date: stringOrNull(d.date),
    note: stringOrNull(d.note),
    source: stringOrNull(d.source),
  }))
}

function normalizeSpecDecodeFindings(raw: unknown): SpecDecodeFinding[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map((s): SpecDecodeFinding => ({
    machine: stringOrNull(s.machine),
    target: stringOrNull(s.target),
    method: stringOrNull(s.method),
    metric: stringOrNull(s.metric),
    workload: stringOrNull(s.workload),
    speedup: finiteNumberOrNull(s.speedup),
    accept: stringOrNull(s.accept),
    verdict: stringOrNull(s.verdict),
    note: stringOrNull(s.note),
    source: stringOrNull(s.source),
  }))
}

function normalizeSpeedRecords(raw: unknown): SpeedRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map((r) => r as unknown as SpeedRecord)
}

function normalizeTaskDomains(raw: unknown): Record<string, string> {
  const obj = asObject(raw)
  const out: Record<string, string> = {}
  for (const [taskId, domain] of Object.entries(obj)) {
    if (typeof domain === 'string' && domain.trim()) out[taskId] = domain.trim()
  }
  return out
}

/** Resolve a Vite ``public/`` asset path from any vue-router view (hash or history). */
export function resolvePublicPath(relativePath: string): string {
  const cleanPath = relativePath.replace(/^\.?\//, '')
  if (typeof window === 'undefined') {
    return `./${cleanPath}`
  }

  const viteBase = import.meta.env.BASE_URL || '/'
  if (viteBase.startsWith('http://') || viteBase.startsWith('https://')) {
    const base = viteBase.endsWith('/') ? viteBase : `${viteBase}/`
    return new URL(cleanPath, base).href
  }

  if (viteBase.startsWith('/')) {
    const prefix = viteBase.endsWith('/') ? viteBase : `${viteBase}/`
    return `${prefix}${cleanPath}`.replace(/([^:]\/)\/+/g, '$1')
  }

  // base './' — hash-router keeps pathname at the deploy root; ignore #/v1/… segments.
  const { pathname } = window.location
  const deployRoot = pathname.endsWith('/')
    ? pathname
    : pathname.replace(/\/[^/]*$/, '/')
  return `${deployRoot}${cleanPath}`.replace(/([^:]\/)\/+/g, '/')
}

const LOCAL_DATA_CMD = 'python3 scripts/build-dashboard.py --no-build'

export async function fetchPublicJson<T>(
  url: string,
  opts?: { missingOk?: boolean },
): Promise<T | null> {
  const resolvedUrl = resolvePublicPath(url)
  const response = await fetch(resolvedUrl, { cache: 'no-cache' })
  if (!response.ok) {
    if (response.status === 404 && opts?.missingOk) return null
    if (response.status === 404) {
      throw new Error(
        `Dashboard data missing at ${resolvedUrl} — run ${LOCAL_DATA_CMD} (or python3 scripts/build-dashboard.py --serve).`,
      )
    }
    throw new Error(`HTTP ${response.status} fetching ${resolvedUrl}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  if (contentType.includes('text/html') || text.trimStart().startsWith('<!')) {
    throw new Error(
      `PublicBundle dashboard feed missing at ${resolvedUrl} (server returned HTML). `
      + `Run ${LOCAL_DATA_CMD}, then npm run dev or python3 scripts/build-dashboard.py --serve.`,
    )
  }

  try {
    return JSON.parse(text) as T
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid JSON from ${resolvedUrl}: ${detail}`)
  }
}

export async function loadPublicBundleDashboardFeed(
  snapshotUrl = './public-bundles/dashboard-snapshot.json',
): Promise<PublicBundleDashboardProjection> {
  const emptySections = {
    machines: [] as FleetMachine[],
    modelRegistry: [] as RegistryModel[],
    runConfigs: [] as RunConfig[],
    findings: [] as Finding[],
    depthFindings: [] as DepthFinding[],
    specDecodeFindings: [] as SpecDecodeFinding[],
  }
  const snapshotRaw = await fetchPublicJson<unknown>(snapshotUrl, { missingOk: true })
  if (!snapshotRaw) {
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
      taskDomains: {},
      ...emptySections,
    }
  }

  const snapshot = asObject(snapshotRaw)
  if (snapshot.schema_version !== 'dashboard_public_bundle_snapshot.v1') {
    throw new Error(`Unsupported dashboard snapshot schema: ${String(snapshot.schema_version ?? 'missing')}`)
  }
  const sections = {
    machines: normalizeMachines(snapshot.machines),
    modelRegistry: normalizeModelRegistry(snapshot.model_registry),
    runConfigs: normalizeRunConfigs(snapshot.run_configs),
    findings: normalizeFindings(snapshot.findings),
    depthFindings: normalizeDepthFindings(snapshot.depth_findings),
    specDecodeFindings: normalizeSpecDecodeFindings(snapshot.spec_decode_findings),
  }
  const snapshotSpeedRecords = normalizeSpeedRecords(snapshot.speed_records)
  const feed = normalizeFeedEntries(snapshot.feed)
  if (!feed.entries.length) {
    return {
      cells: [],
      meta: null,
      loaded: true,
      generatedAt: feed.generatedAt,
      records: snapshotSpeedRecords,
      sharedCells: [],
      norm: null,
      comp: null,
      domainIndex: null,
      taskDomains: normalizeTaskDomains(snapshot.task_domains),
      ...sections,
    }
  }

  const packed = Array.isArray(snapshot.bundles) ? snapshot.bundles : []
  const loadedBundles = packed.map((raw, index) => {
    const item = asObject(raw)
    const entry = normalizeFeedEntry(item.entry) ?? feed.entries[index]
    if (!entry) throw new Error(`dashboard snapshot bundle ${index} has no feed entry`)
    const bundleRaw = requireObject(item.bundle, `snapshot.bundles[${index}].bundle`)
    return {
      entry,
      bundle: parsePublicBundle({
        manifest: bundleRaw.manifest,
        benches: bundleRaw.benches,
        subjects: bundleRaw.subjects,
        runs: bundleRaw.runs,
        scores: bundleRaw.scores,
      }),
    }
  })
  if (loadedBundles.length !== feed.entries.length) {
    throw new Error(`dashboard snapshot bundle count mismatch: ${loadedBundles.length}/${feed.entries.length}`)
  }
  const taskDomains = normalizeTaskDomains(snapshot.task_domains)
  const bundles = loadedBundles.map((item) => item.bundle)
  const cells = loadedBundles.flatMap(({ entry, bundle }) => projectScorecardRowsFromPublicBundle(bundle, entry))
  const meta = buildScorecardMeta(cells, bundles, feed.current, feed.meta)
  return {
    cells,
    meta,
    loaded: true,
    generatedAt: feed.generatedAt,
    records: snapshotSpeedRecords,
    sharedCells: projectSharedCellsFromScorecardRows(cells),
    norm: projectNormIndexFromScorecardRows(cells, meta),
    comp: projectCompIndexFromScorecardRows(cells, meta),
    domainIndex: projectDomainIndexFromPublicBundles(bundles, meta, taskDomains),
    taskDomains,
    ...sections,
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
