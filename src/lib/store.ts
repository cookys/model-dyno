import { computed, ref } from 'vue'
import { loadPublicBundleDashboardFeed } from './publicBundle'

export interface ExamVersionInfo {
  version: string
  label: string
  name: string
  date: string | null
  note: string | null
  n_tasks: number | null
  current: boolean
}

export interface SpeedRecord {
  source_file?: string
  timestamp?: string
  owner?: string
  profile?: string
  hostname?: string
  os_family?: string
  os_version?: string
  cpu_model?: string
  gpu_summary?: string
  gpu_vendor?: string
  ram_gb?: number
  tier?: string
  model_alias?: string
  quant?: string
  engine?: string
  engine_tag?: string
  pp512_tps?: number
  tg128_tps?: number
  test_backend?: string
}

export interface AgencyBlock {
  noop_pct?: number | null
  n_eligible?: number
  noop_count?: number
  infra_pct?: number | null
  budget_pct?: number | null
  cap_pct?: number | null
  verdict?: string
  flags?: string[]
}

export interface SweCell {
  model: string
  cell?: string
  display?: string
  source?: string
  owner?: string
  profile?: string
  machine?: string
  publisher?: string
  operator?: string
  harness?: string
  access_label?: string
  comparable?: boolean
  n_graded?: number
  n_passed?: number
  canonical_version?: string | null
  n_canon?: number | null
  owed?: number | null
  headline?: number
  headline_ci?: [number, number]
  capability_est?: number
  capability_est_ci?: [number, number]
  integrity?: string
  status_counts?: Record<string, number>
  status_denominator?: number
  suspect_error_count?: number
  suspect_error_rate?: number
  pps?: number
  tok_per_solved?: number
  sec_per_solved?: number
  usd_per_solved?: number
  solved_per_hour?: number
  price_known?: boolean
  tags?: Record<string, string>
  identity?: {
    access?: string
    canonical_model?: string
  }
  // agency / no-op credibility dim — is a low score the model, env, or tools?
  agency?: AgencyBlock
}

export interface SharedSweCell {
  model: string
  owner?: string
  harness?: string
  machine?: string
  profile?: string
  n_graded?: number
  n_passed?: number
  headline?: number
  headline_ci?: [number, number]
  capability_est?: number
  capability_est_ci?: [number, number]
  comparable?: boolean
  suspect_error_count?: number
  suspect_error_rate?: number
  integrity?: string
  status_counts?: Record<string, number>
  status_denominator?: number
}

export interface NormCell {
  model: string
  source: string
  n_passed: number
  n_graded: number
  n_on_set: number
  comparable?: boolean
  coverage?: number
  pass_rate: number
  ci: [number, number]
  publisher?: string
  operator?: string
  harness?: string
  access_label?: string
  identity?: {
    access?: string
    canonical_model?: string
  }
  tags?: Record<string, string>
  display?: string
  cell?: string
}

export interface NormIndex {
  cells: NormCell[]
  n_tasks: number
  task_set: string
  // plan 023 P4: NORM verdicts are id-matched, NOT version-pinned (the p4c matrices predate
  // per-task versioning). normalize-bench emits this as structured state so the board can warn
  // that a repaired-verifier task may reuse a stale cloud verdict here.
  version_aware?: boolean
  current_exam?: string | null
  stale_risk?: { version_pinned: boolean; reason: string }
}

export interface CompCell {
  model: string
  publisher?: string
  operator?: string
  harness?: string
  access_label?: string
  machine?: string
  cell: string
  source: string
  comparable?: boolean
  acc: number
  ci_lo: number
  ci_hi: number
  passed: number
  n: number
  sec_per_solved?: number
  solved_per_hour?: number
  med_wall?: number
  agentic_tok_s?: number
  tok_per_solved?: number
  med_in_tok?: number
  raw_tok_s?: number
  raw_latency_s?: number
  billing?: string
  plan?: string
  score?: number
  cost_per_solved?: number
  identity?: {
    access?: string
    canonical_model?: string
  }
  tags?: Record<string, string>
  display?: string
  integrity?: string
  status_counts?: Record<string, number>
  status_denominator?: number
  suspect_error_count?: number
  suspect_error_rate?: number
  trunc_pct?: number
  maxstep_pct?: number
  // agency / no-op credibility — is a low score the model, the env, or the tools? (same shape
  // the SWE scorecard renders; emitted by competitiveness.py via footing.agency_block)
  agency?: AgencyBlock
}

export interface CompIndex {
  cells: CompCell[]
  exam?: string
}

export interface DomainCell {
  cell: string
  model?: string | null
  backend?: string | null
  n: number
  by_domain: Record<string, { passed: number; n: number; acc: number | null }>
}
export interface DomainIndex {
  exam?: string
  comparable_min?: number
  domains: string[]
  cells: DomainCell[]
}

export interface SweMeta {
  current_exam?: string | null
  current_exam_label?: string | null
  current_exam_name?: string | null
  current_exam_n_tasks?: number | null
  n_canon?: number | null
  comparable_min?: number
  version_aware?: boolean
  exam_versions?: ExamVersionInfo[]
}

function finiteNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export function sanitizeDomainIndex(raw: unknown): DomainIndex {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const domains = Array.isArray(obj.domains)
    ? obj.domains.filter((d): d is string => typeof d === 'string')
    : []
  const domainSet = new Set(domains)
  const cells = Array.isArray(obj.cells)
    ? obj.cells
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => {
        const byDomainRaw = c.by_domain && typeof c.by_domain === 'object'
          ? c.by_domain as Record<string, unknown>
          : {}
        const by_domain: DomainCell['by_domain'] = {}
        for (const [domain, statRaw] of Object.entries(byDomainRaw)) {
          if (domainSet.size && !domainSet.has(domain)) continue
          if (!statRaw || typeof statRaw !== 'object') continue
          const stat = statRaw as Record<string, unknown>
          const acc = stat.acc
          by_domain[domain] = {
            passed: finiteNumber(stat.passed),
            n: finiteNumber(stat.n),
            acc: typeof acc === 'number' && Number.isFinite(acc) ? acc : null,
          }
        }
        return {
          cell: String(c.cell ?? ''),
          model: stringOrNull(c.model),
          backend: stringOrNull(c.backend),
          n: finiteNumber(c.n),
          by_domain,
        }
      })
      .filter((c) => c.cell)
    : []
  return {
    exam: stringOrNull(obj.exam) ?? undefined,
    comparable_min: typeof obj.comparable_min === 'number' && Number.isFinite(obj.comparable_min)
      ? obj.comparable_min
      : undefined,
    domains,
    cells,
  }
}

export const records = ref<SpeedRecord[]>([])
export const generatedAt = ref<string | null>(null)
export const nowMs = ref<number>(Date.now())
export const sweCells = ref<SweCell[]>([])
export const sweMeta = ref<SweMeta | null>(null)
export const publicBundleFeedLoaded = ref<boolean>(false)
export const publicBundleRecords = ref<SpeedRecord[]>([])
export const publicBundleSweCells = ref<SweCell[]>([])
export const publicBundleSweMeta = ref<SweMeta | null>(null)
export const publicBundleSharedCells = ref<SharedSweCell[]>([])
export const publicBundleNorm = ref<NormIndex | null>(null)
export const publicBundleComp = ref<CompIndex | null>(null)
export const publicBundleDomainIndex = ref<DomainIndex | null>(null)
export const dashboardRecords = computed<SpeedRecord[]>(() => publicBundleRecords.value)
export const scorecardSweCells = computed<SweCell[]>(() => publicBundleSweCells.value)
export const scorecardSweMeta = computed<SweMeta | null>(() => publicBundleSweMeta.value)
export const compatibilityFallbackActive = computed<boolean>(() => false)
const selectedExamQuery = ref<string | null>(null)
export const sharedCells = ref<SharedSweCell[]>([])
export const norm = ref<NormIndex | null>(null)
export const comp = ref<CompIndex | null>(null)
export const domainIndex = ref<DomainIndex | null>(null)
export const dashboardSharedCells = computed<SharedSweCell[]>(() => publicBundleSharedCells.value)
export const dashboardNorm = computed<NormIndex | null>(() => publicBundleNorm.value)
export const dashboardComp = computed<CompIndex | null>(() => publicBundleComp.value)
export const dashboardDomainIndex = computed<DomainIndex | null>(() => publicBundleDomainIndex.value)
export const loading = ref<boolean>(true)
export const error = ref<string | null>(null)

export function orderedExamVersions(versions: ExamVersionInfo[]): ExamVersionInfo[] {
  if (!versions.length) return []
  const current = versions.find((v) => v.current)
  if (!current) return versions
  return [current, ...versions.filter((v) => v.version !== current.version)]
}

export function pickSelectedExam(
  query: string | null,
  versions: ExamVersionInfo[],
  currentExam: string | null | undefined,
): string | null {
  const candidate = query && query.trim() ? query.trim() : null
  if (candidate && versions.some((v) => v.version === candidate)) {
    return candidate
  }

  const current = currentExam && versions.find((v) => v.version === currentExam)
    ? currentExam
    : versions.find((v) => v.current)?.version || null

  if (current) return current

  if (versions.length) return versions[0].version
  return null
}

export function isArchivedExam(selected: string | null, currentExam: string | null | undefined): boolean {
  if (!selected) return false
  if (!currentExam) return false
  return selected !== currentExam
}

export function setSelectedExamFromQuery(value: unknown) {
  selectedExamQuery.value = typeof value === 'string' && value.trim() ? value : null
}

const examVersions = computed<ExamVersionInfo[]>(() => scorecardSweMeta.value?.exam_versions || [])

export const selectedExam = computed<string | null>(() => {
  return pickSelectedExam(selectedExamQuery.value, examVersions.value, scorecardSweMeta.value?.current_exam ?? null)
})

export const sweCellsByExam = computed<SweCell[]>(() => {
  const activeSweCells = scorecardSweCells.value
  if (!scorecardSweMeta.value?.version_aware) return activeSweCells
  const target = selectedExam.value
  if (!target) return activeSweCells
  return activeSweCells.filter((c) => c.canonical_version === target)
})

export async function loadAllData() {
  loading.value = true
  error.value = null
  try {
    const publicDashboard = await loadPublicBundleDashboardFeed()
    if (!publicDashboard.loaded) {
      throw new Error('PublicBundle dashboard feed missing at ./public-bundles/index.json; run python3 scripts/build-dashboard.py --no-build')
    }
    publicBundleFeedLoaded.value = true
    publicBundleRecords.value = publicDashboard.records
    publicBundleSweCells.value = publicDashboard.cells
    publicBundleSweMeta.value = publicDashboard.meta
    publicBundleSharedCells.value = publicDashboard.sharedCells
    publicBundleNorm.value = publicDashboard.norm
    publicBundleComp.value = publicDashboard.comp
    publicBundleDomainIndex.value = publicDashboard.domainIndex
    generatedAt.value = publicDashboard.generatedAt
    nowMs.value = generatedAt.value ? Date.parse(generatedAt.value) || Date.now() : Date.now()
  } catch (e: any) {
    publicBundleFeedLoaded.value = false
    publicBundleRecords.value = []
    publicBundleSweCells.value = []
    publicBundleSweMeta.value = null
    publicBundleSharedCells.value = []
    publicBundleNorm.value = null
    publicBundleComp.value = null
    publicBundleDomainIndex.value = null
    generatedAt.value = null
    nowMs.value = Date.now()
    error.value = e.message
  } finally {
    loading.value = false
  }
}
