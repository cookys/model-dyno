import { classifyCell } from './runClass'
import { resolveExamMeta } from './examMeta'
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
  'public_bundle.v4',
  // v5 adds scores[].footing.role — the profile's [tags].role, so the board can prefer the
  // DEPLOYABLE configuration over the highest-scoring one (llm-playground plan 057).
  // Accepted BEFORE the producer emits it, on purpose: the version string is validated here,
  // so publishing v5 to a frontend that only knows v4 would break the live board.
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

/** plan 060 T1a: the three score-credibility gates, published per cell by the producer
 *  (single source: the same footing math the private boards read). */
export interface PublicGates {
  verdict?: string
  infra_pct?: number
  trunc_pct?: number
  maxstep_pct?: number
  noop_pct?: number
}

export interface PublicBundleFeedEntry {
  id?: string
  base_url: string
  current?: boolean
  label?: string
  owner?: string
  machine?: string
  tags?: Record<string, string>
  publisher?: string
  operator?: string
  access_label?: string
  gates?: PublicGates
  n_runs?: number
  headline_range?: [number, number]
}

export interface PublicBundleScorecardProjection {
  cells: SweCell[]
  meta: SweMeta | null
  loaded: boolean
}

export interface SpecDecodeFinding {
  machine: string
  target: string
  method: string
  workload: string
  /** `decode` = tok/s ratio, `agentic` = end-to-end task wall. They disagree, often. */
  metric: string
  speedup: number
  accept: string
  verdict: string
  note: string
  source: string
}

export interface MachineHardware {
  profile: string
  gpu_name: string | null
  gpu_vendor: string | null
  gpu_count: number | null
  /** dedicated = a discrete card's own VRAM; unified = one pool shared with the OS. */
  memory_kind: string
  vram_per_gpu_gb: number | null
  vram_total_gb: number | null
  vram_pool_gb: number | null
  vram_practical_gb: number | null
  /** The figure to subtract a model's weights from. Not the same quantity on both kinds. */
  vram_usable_gb: number | null
  /** Largest SINGLE allocation the driver grants — a separate limit from the pool. */
  alloc_cap_gb: number | null
  aliases: string[]
}

export interface ModelFootprint {
  alias: string
  family?: string
  quant?: string
  weights_gb?: number
  params_total_b?: number
  params_active_b?: number
  context_max?: number
  hf_repo?: string
  license?: string
}

export interface RunConfig {
  config: string
  tier: string
  model: string
  methods: string[]
  engine?: string
  ctx_size?: number
  [k: string]: unknown
}

export interface PublicFinding {
  id: string
  title_en: string
  title_zh: string
  claim_en: string
  claim_zh: string
  measured_en: string
  measured_zh: string
  conditions: string
  evidence: { metric: string; value: string; detail?: string }[]
  repro_en: string
  caveat_en: string
  date: string
  source: string
}

export interface DepthFinding {
  machine: string
  config: string
  metric: string
  context: number
  concurrency: number
  state: string
  value: number
  note: string
  date: string
  source: string
}

export interface PublicBundleDashboardProjection extends PublicBundleScorecardProjection {
  generatedAt: string | null
  records: SpeedRecord[]
  specDecodeFindings: SpecDecodeFinding[]
  findings: PublicFinding[]
  depthFindings: DepthFinding[]
  machines: MachineHardware[]
  modelFootprints: ModelFootprint[]
  runConfigs: RunConfig[]
  sharedCells: SharedSweCell[]
  norm: NormIndex | null
  comp: CompIndex | null
  domainIndex: DomainIndex | null
}

interface PublicBundleProjectionMetadata {
  owner?: string
  machine?: string
  tags?: Record<string, string>
  publisher?: string
  operator?: string
  access_label?: string
  gates?: PublicGates
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

/** Map the producer's gates onto the AgencyBlock shape the existing agencyBadge renders.
 *  budget_pct = max(trunc, maxstep), matching credibilityDims' fallback chain. */
function gatesToAgency(gates: PublicGates | undefined): Record<string, unknown> | undefined {
  if (!gates || typeof gates.verdict !== 'string') return undefined
  const trunc = finiteNumberOrNull(gates.trunc_pct)
  const maxstep = finiteNumberOrNull(gates.maxstep_pct)
  const budget = trunc === null && maxstep === null ? null : Math.max(trunc ?? 0, maxstep ?? 0)
  return {
    verdict: gates.verdict,
    noop_pct: finiteNumberOrNull(gates.noop_pct),
    infra_pct: finiteNumberOrNull(gates.infra_pct),
    budget_pct: budget,
  }
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
  tok_med?: number
  tok_med_pass?: number
  tok_med_fail?: number
  tok_fail_ratio?: number
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
    tok_med?: number
    tok_med_pass?: number
    tok_med_fail?: number
    tok_fail_ratio?: number
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

  // Outcome-split output-token medians. The publisher nulls all three together
  // when either subset is under the privacy floor, so treat them as one set and
  // derive the ratio only when both sides are present and the pass side is > 0.
  const tMed = finiteNumberOrNull(perf.tokens_out_median)
  const tPass = finiteNumberOrNull(perf.tokens_out_median_pass)
  const tFail = finiteNumberOrNull(perf.tokens_out_median_fail)
  if (tMed !== null && tPass !== null && tFail !== null) {
    out.tok_med = tMed
    out.tok_med_pass = tPass
    out.tok_med_fail = tFail
    if (tPass > 0) out.tok_fail_ratio = tFail / tPass
  }
  return out
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
      tok_med: perfMetrics.tok_med,
      tok_med_pass: perfMetrics.tok_med_pass,
      tok_med_fail: perfMetrics.tok_med_fail,
      tok_fail_ratio: perfMetrics.tok_fail_ratio,
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
      // `coverage: "full"` means every token was OBSERVED, not that a rate exists to
      // price them with. Every local cell in the feed is coverage:"full" with
      // total_cost_nano_usd:null and reason:"rate_unavailable" — 65 of them — so
      // conflating the two published a confident "price known" for runs whose price is
      // explicitly unavailable, and the $0 branch downstream reads that as "local is
      // free". A price is known when there is a number.
      price_known: costCoverage === 'full' && finiteNumberOrNull(cost.total_cost_nano_usd) !== null,
      // Config axes come from the feed entry, which carries what the eval profile
      // declared and the tag validator checked. The old fallback synthesized a
      // placement-only object out of the backend string, so every other tag column
      // rendered empty here while looking populated against a private aggregate — a
      // failure that only shows up on the published site, never in local development.
      // v5: footing.role is the profile's [tags].role. It rides in `tags` because that is
      // where every other config axis already lives, and it is merged rather than replacing
      // the feed's tags so a v4 bundle (no role) projects exactly as before.
      tags: (() => {
        const base: Record<string, string> = (metadata.tags && Object.keys(metadata.tags).length)
          ? { ...metadata.tags }
          : (backend ? { placement: backend.includes('local') ? 'local' : 'remote' } : {})
        const role = stringOrNull(footing.role)
        if (role) base.role = role
        return Object.keys(base).length ? base : undefined
      })(),
      // plan 060 T1a/T1c: gates ride the feed entry; project them into the agency slot the
      // existing badge already renders, plus the cap-detail and rerun-sample fields.
      agency: gatesToAgency(metadata.gates) as SweCell['agency'],
      trunc_pct: finiteNumberOrNull(metadata.gates?.trunc_pct) ?? undefined,
      maxstep_pct: finiteNumberOrNull(metadata.gates?.maxstep_pct) ?? undefined,
      n_runs: metadata.n_runs,
      headline_range: metadata.headline_range,
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
    display_floor: meta?.display_floor,
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
    display_floor: meta?.display_floor,
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
        trunc_pct: cell.trunc_pct,
        maxstep_pct: cell.maxstep_pct,
        n_runs: cell.n_runs,
        headline_range: cell.headline_range,
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
      display_floor: feedMeta.display_floor,
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
    // Carried on this branch too: a feed without exam_versions still stamped a
    // floor, and dropping it here would let the meta disagree with the filter
    // that already ran at the choke point.
    display_floor: feedMeta?.display_floor,
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
      display_floor: nonNegativeInt(feed.display_floor) ?? undefined,
      version_aware: boolOrNull(feed.version_aware) ?? true,
      exam_versions: examVersions,
    },
  }
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
    tags: (entry.tags && typeof entry.tags === 'object' && !Array.isArray(entry.tags))
      ? (entry.tags as Record<string, string>)
      : undefined,
    publisher: stringOrNull(entry.publisher) ?? undefined,
    operator: stringOrNull(entry.operator) ?? undefined,
    access_label: stringOrNull(entry.access_label) ?? undefined,
    gates: isObject(entry.gates) ? (entry.gates as PublicGates) : undefined,
    n_runs: nonNegativeInt(entry.n_runs) ?? undefined,
    headline_range: (Array.isArray(entry.headline_range) && entry.headline_range.length === 2
      && entry.headline_range.every((v) => typeof v === 'number' && Number.isFinite(v)))
      ? (entry.headline_range as [number, number])
      : undefined,
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

// The speed routes' data, straight off the snapshot.
//
// These used to be hard-coded to [] here, with a comment deferring them to a future
// ABI — which meant /speed/heatmap, /speed/leaderboard and /speed/contributors
// rendered nothing in production while looking healthy on a dev checkout, where the
// private INDEX.json still exists. The producer publishes both arrays now; this only
// has to not throw when an older snapshot lacks them.
function projectSpeedRecords(raw: unknown): SpeedRecord[] {
  return Array.isArray(raw) ? (raw.filter((r) => r && typeof r === 'object') as SpeedRecord[]) : []
}

function projectMachines(raw: unknown): MachineHardware[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({
      profile: String(m.profile ?? ''),
      gpu_name: (m.gpu_name as string) ?? null,
      gpu_vendor: (m.gpu_vendor as string) ?? null,
      gpu_count: typeof m.gpu_count === 'number' ? m.gpu_count : null,
      memory_kind: String(m.memory_kind ?? 'dedicated'),
      vram_per_gpu_gb: typeof m.vram_per_gpu_gb === 'number' ? m.vram_per_gpu_gb : null,
      vram_total_gb: typeof m.vram_total_gb === 'number' ? m.vram_total_gb : null,
      vram_pool_gb: typeof m.vram_pool_gb === 'number' ? m.vram_pool_gb : null,
      vram_practical_gb: typeof m.vram_practical_gb === 'number' ? m.vram_practical_gb : null,
      vram_usable_gb: typeof m.vram_usable_gb === 'number' ? m.vram_usable_gb : null,
      alloc_cap_gb: typeof m.alloc_cap_gb === 'number' ? m.alloc_cap_gb : null,
      aliases: Array.isArray(m.aliases) ? m.aliases.map(String) : [],
    }))
    .filter((m) => m.profile)
}

function projectModelFootprints(raw: unknown): ModelFootprint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m) => ({ ...(m as unknown as ModelFootprint), alias: String(m.alias ?? '') }))
    .filter((m) => m.alias)
}

function projectPublicFindings(raw: unknown): PublicFinding[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      id: String(f.id ?? ''),
      title_en: String(f.title_en ?? ''),
      title_zh: String(f.title_zh ?? ''),
      claim_en: String(f.claim_en ?? ''),
      claim_zh: String(f.claim_zh ?? ''),
      measured_en: String(f.measured_en ?? ''),
      measured_zh: String(f.measured_zh ?? ''),
      conditions: String(f.conditions ?? ''),
      evidence: Array.isArray(f.evidence)
        ? f.evidence.filter(isObject).map((e) => ({
            metric: String(e.metric ?? ''),
            value: String(e.value ?? ''),
            detail: e.detail ? String(e.detail) : undefined,
          }))
        : [],
      repro_en: String(f.repro_en ?? ''),
      caveat_en: String(f.caveat_en ?? ''),
      date: String(f.date ?? ''),
      source: String(f.source ?? ''),
    }))
    .filter((f) => f.id && f.title_en)
}

function projectDepthFindings(raw: unknown): DepthFinding[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      machine: String(f.machine ?? ''),
      config: String(f.config ?? ''),
      metric: String(f.metric ?? ''),
      context: typeof f.context === 'number' ? f.context : 0,
      concurrency: typeof f.concurrency === 'number' ? f.concurrency : 1,
      state: String(f.state ?? 'n/a'),
      value: typeof f.value === 'number' ? f.value : NaN,
      note: String(f.note ?? ''),
      date: String(f.date ?? ''),
      source: String(f.source ?? ''),
    }))
    .filter((f) => f.machine && Number.isFinite(f.value))
}

function projectSpecDecodeFindings(raw: unknown): SpecDecodeFinding[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      machine: String(f.machine ?? ''),
      target: String(f.target ?? ''),
      method: String(f.method ?? ''),
      metric: String(f.metric ?? ''),
      workload: String(f.workload ?? ''),
      speedup: typeof f.speedup === 'number' ? f.speedup : NaN,
      accept: String(f.accept ?? ''),
      verdict: String(f.verdict ?? ''),
      note: String(f.note ?? ''),
      source: String(f.source ?? ''),
    }))
    .filter((f) => f.machine && Number.isFinite(f.speedup))
}

export async function loadPublicBundleDashboardFeed(
  snapshotUrl = './public-bundles/dashboard-snapshot.json',
): Promise<PublicBundleDashboardProjection> {
  const snapshotRes = await fetch(snapshotUrl, { cache: 'no-cache' })
  if (!snapshotRes.ok) {
    if (snapshotRes.status === 404) {
      return {
        cells: [],
        meta: null,
        loaded: false,
        generatedAt: null,
        records: [],
        specDecodeFindings: [],
        findings: [],
        depthFindings: [],
        machines: [],
        modelFootprints: [],
        runConfigs: [],
        sharedCells: [],
        norm: null,
        comp: null,
        domainIndex: null,
      }
    }
    throw new Error(`HTTP ${snapshotRes.status} fetching ${snapshotUrl}`)
  }

  const snapshot = asObject(await snapshotRes.json())
  if (snapshot.schema_version !== 'dashboard_public_bundle_snapshot.v1') {
    throw new Error(`Unsupported dashboard snapshot schema: ${String(snapshot.schema_version ?? 'missing')}`)
  }
  const feed = normalizeFeedEntries(snapshot.feed)
  if (!feed.entries.length) {
    return {
      cells: [],
      meta: null,
      loaded: true,
      generatedAt: feed.generatedAt,
      records: [],
      specDecodeFindings: [],
      findings: [],
      depthFindings: [],
      machines: [],
      modelFootprints: [],
      runConfigs: [],
      sharedCells: [],
      norm: null,
      comp: null,
      domainIndex: null,
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

  // Drop TRIVIAL cells once, here, rather than in each view: this is the single
  // point every downstream projection (scorecard / norm / comp / shared / domain)
  // reads from, so a run below the display floor is genuinely absent instead of
  // merely unranked — including from the expanded per-model sub-tables, which
  // render group members and would otherwise still list the hidden rows.
  const floorOpts = resolveExamMeta(feed.meta)
  const kept = loadedBundles
    .map(({ entry, bundle }) => ({
      bundle,
      rows: projectScorecardRowsFromPublicBundle(bundle, entry).filter(
        (c) =>
          classifyCell(
            { n_graded: c.n_graded, comparable: c.comparable, owed: c.owed, n_exam: c.n_canon ?? c.n_exam, n_canon: c.n_canon },
            floorOpts,
          ).coverage !== 'TRIVIAL',
      ),
    }))
    .filter((item) => item.rows.length > 0)

  const bundles = kept.map((item) => item.bundle)
  const cells = kept.flatMap((item) => item.rows)
  const meta = buildScorecardMeta(cells, bundles, feed.current, feed.meta)
  return {
    cells,
    meta,
    loaded: true,
    generatedAt: feed.generatedAt,
    records: projectSpeedRecords(snapshot.speed_records),
    specDecodeFindings: projectSpecDecodeFindings(snapshot.spec_decode_findings),
    findings: projectPublicFindings(snapshot.findings),
    depthFindings: projectDepthFindings(snapshot.depth_findings),
    machines: projectMachines(snapshot.machines),
    modelFootprints: projectModelFootprints(snapshot.model_registry),
    runConfigs: Array.isArray(snapshot.run_configs)
      ? (snapshot.run_configs.filter((c) => c && typeof c === 'object') as RunConfig[])
      : [],
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
