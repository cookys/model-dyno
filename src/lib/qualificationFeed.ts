// Plan 065 — autopilot qualification feed (public side payload, fixed URL).
//
// The feed is autopilot's own `official-qualification-defaults` artifact re-published from the
// maintainer's ledger, with additive `seat.effort` / `feed` / `board` blocks. This module is
// dependency-free on purpose: the node:test suite transpiles and runs it against a fixture.
//
// Semantics the page must not contradict (they are autopilot's rules, carried in the feed):
//   * a licence is not a score — it says whether one exact seat (engine × runner × effort)
//     may take a role, decided on a synthetic trap corpus with zero-tolerance thresholds;
//   * no calendar expiry — withdrawal comes from strikes, a model_version change, or a new
//     corpus / prompt contract;
//   * harness_version / runner_version are ENVIRONMENT: recorded and displayed, never gating.

export const QUALIFICATION_FEED_SCHEMA = 'model-dyno.qualification-feed.v1'
export const QUALIFICATION_FEED_URL = './public-bundles/qualification-feed.json'

export interface QualificationSeat {
  engine: string
  runner: string
  role: string
  effort: string | null
}

export interface QualificationAdministration {
  date: string | null
  qualified_at: string | null
  corpus_version: string | null
  harness_version: string | null
  runner_version: string | null
  prompt_config_hash: string | null
  model_version: string | null
  version_source: string | null
}

export interface QualificationBoard {
  cell: string | null
  exam: string | null
  passed: number | null
  n: number | null
  ci_lo_permille: number | null
  ci_hi_permille: number | null
  agency_verdict: string | null
  comparable: boolean
  med_wall_s: number | null
  latest_run_date: string | null
}

export interface QualificationEntry {
  default_id: string
  role: string
  status: string
  seat: QualificationSeat
  administration: QualificationAdministration
  quality: Record<string, unknown> | null
  capability_score: number | null
  feed: {
    owner: string
    origin_host: string | null
    record_id: string | null
    legacy: boolean
    evidence_url: string | null
    board_cell: string | null
    board_join: string | null
  }
  board: QualificationBoard | null
}

export interface QualificationStrike {
  engine: string
  runner: string
  role: string
  effort: string | null   // null = legacy (recorded before effort partitioning), not "any effort"
  class: string | null
  cause_class: string | null
  detector_id: string | null
  receipt_ref: string | null
}

export interface QualificationFeed {
  schema: string
  owner: string
  exam: string | null
  generated_at: string | null
  digest: string | null
  feed_url: string | null
  disclosure_notice: string
  adr_0001_notice: string
  semantics: { expiry: string; identity: string; trust: string }
  harness_versions: string[]
  role_summary: Record<string, { qualified: number; failed: number; other: number }>
  n_defaults: number
  n_strikes: number
  n_priors: number
  defaults: QualificationEntry[]
  strikes: QualificationStrike[]
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function sanitizeSeat(raw: unknown, roleFallback: string | null): QualificationSeat | null {
  const s = obj(raw)
  const engine = str(s.engine)
  const runner = str(s.runner)
  const role = str(s.role) ?? roleFallback
  if (!engine || !runner || !role) return null
  return { engine, runner, role, effort: str(s.effort) }
}

function sanitizeBoard(raw: unknown): QualificationBoard | null {
  const b = obj(raw)
  if (!Object.keys(b).length) return null
  return {
    cell: str(b.cell),
    exam: str(b.exam),
    passed: int(b.passed),
    n: int(b.n),
    ci_lo_permille: int(b.ci_lo_permille),
    ci_hi_permille: int(b.ci_hi_permille),
    agency_verdict: str(b.agency_verdict),
    comparable: b.comparable === true,
    med_wall_s: int(b.med_wall_s),
    latest_run_date: str(b.latest_run_date),
  }
}

export function sanitizeQualificationEntry(raw: unknown): QualificationEntry | null {
  const e = obj(raw)
  const role = str(e.role)
  const seat = sanitizeSeat(e.seat, role)
  const status = str(e.status)
  const defaultId = str(e.default_id)
  if (!seat || !status || !defaultId) return null
  const a = obj(e.administration)
  const f = obj(e.feed)
  return {
    default_id: defaultId,
    role: seat.role,
    status,
    seat,
    administration: {
      date: str(a.date),
      qualified_at: str(a.qualified_at),
      corpus_version: str(a.corpus_version),
      harness_version: str(a.harness_version),
      runner_version: str(a.runner_version),
      prompt_config_hash: str(a.prompt_config_hash),
      model_version: str(a.model_version),
      version_source: str(a.version_source),
    },
    quality: Object.keys(obj(e.quality)).length ? obj(e.quality) : null,
    capability_score: num(e.capability_score),
    feed: {
      owner: str(f.owner) ?? '',
      origin_host: str(f.origin_host),
      record_id: str(f.record_id),
      legacy: f.legacy === true,
      evidence_url: str(f.evidence_url),
      board_cell: str(f.board_cell),
      board_join: str(f.board_join),
    },
    board: sanitizeBoard(e.board),
  }
}

function sanitizeStrike(raw: unknown): QualificationStrike | null {
  const s = obj(raw)
  const engine = str(s.engine)
  const runner = str(s.runner)
  const role = str(s.role)
  if (!engine || !runner || !role) return null
  return {
    engine,
    runner,
    role,
    effort: str(s.effort),
    class: str(s.class),
    cause_class: str(s.cause_class),
    detector_id: str(s.detector_id),
    receipt_ref: str(s.receipt_ref),
  }
}

/** null when the payload is not a v1 feed — the page then says "not published", never guesses. */
export function sanitizeQualificationFeed(raw: unknown): QualificationFeed | null {
  const f = obj(raw)
  if (f.schema !== QUALIFICATION_FEED_SCHEMA) return null
  const defaults = (Array.isArray(f.defaults) ? f.defaults : [])
    .map(sanitizeQualificationEntry)
    .filter((e): e is QualificationEntry => e !== null)
  const strikes = (Array.isArray(f.strikes) ? f.strikes : [])
    .map(sanitizeStrike)
    .filter((s): s is QualificationStrike => s !== null)
  const sem = obj(f.semantics)
  const roleSummary: QualificationFeed['role_summary'] = {}
  for (const [role, counts] of Object.entries(obj(f.role_summary))) {
    const c = obj(counts)
    roleSummary[role] = { qualified: int(c.qualified) ?? 0, failed: int(c.failed) ?? 0, other: int(c.other) ?? 0 }
  }
  return {
    schema: QUALIFICATION_FEED_SCHEMA,
    owner: str(f.owner) ?? '',
    exam: str(f.exam),
    generated_at: str(f.generated_at),
    digest: str(f.digest),
    feed_url: str(f.feed_url),
    disclosure_notice: str(f.disclosure_notice) ?? '',
    adr_0001_notice: str(f.adr_0001_notice) ?? '',
    semantics: { expiry: str(sem.expiry) ?? '', identity: str(sem.identity) ?? '', trust: str(sem.trust) ?? '' },
    harness_versions: (Array.isArray(f.harness_versions) ? f.harness_versions : []).filter((v): v is string => typeof v === 'string'),
    role_summary: roleSummary,
    n_defaults: defaults.length,
    n_strikes: strikes.length,
    n_priors: int(f.n_priors) ?? 0,
    defaults,
    strikes,
  }
}

/** The exact command an autopilot user runs to adopt one entry (autopilot ≥ the `--from` release). */
export function adoptCommand(feed: Pick<QualificationFeed, 'feed_url'>, entry: QualificationEntry): string {
  const from = feed.feed_url ?? QUALIFICATION_FEED_URL
  const parts = [
    'node scripts/adopt-qualification-defaults.js adopt',
    `--from ${from}`,
    `--role ${entry.role}`,
    `--seat ${entry.seat.engine}:${entry.seat.runner}`,
  ]
  if (entry.seat.effort) parts.push(`--effort ${entry.seat.effort}`)
  return parts.join(' ')
}

/** Strikes that name an entry's EXACT seat (engine × runner × role × effort) — a strike recorded
 * against effort=high must never attach to the low-tier row, and a legacy (effort=null) strike
 * attaches only to a legacy (effort=null) entry, never to "every effort tier of this engine". */
export function strikesForEntry(feed: Pick<QualificationFeed, 'strikes'>, entry: QualificationEntry): QualificationStrike[] {
  return feed.strikes.filter(
    (s) => s.engine === entry.seat.engine && s.runner === entry.seat.runner && s.role === entry.role
      && s.effort === entry.seat.effort,
  )
}

export function formatPermille(p: number | null): string {
  return p === null ? '—' : `${(p / 10).toFixed(0)}%`
}

/** 404 → null (feed not published); any other failure throws so the caller can show it. */
export async function loadQualificationFeed(url = QUALIFICATION_FEED_URL): Promise<QualificationFeed | null> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return sanitizeQualificationFeed(await res.json())
}
