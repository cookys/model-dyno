/**
 * Speed anatomy + cloud-frontier derivations.
 *
 * Everything here is a JOIN over real snapshot sections — nothing invented:
 *  - speed_records carry the BENCH numbers (pp512 = prefill, tg128 = decode,
 *    ±std) per weights × engine × machine;
 *  - eval cells carry the REAL-WORKLOAD number (agentic tok/s measured while
 *    actually solving the 34-task exam, tool round-trips included);
 *  - depth_findings carry TTFT at 120k context (cold vs hot);
 *  - task_verdicts give the per-task frontier between the local fleet and the
 *    cloud anchors on the same exam.
 */

import type { SweCell, SpeedRecord } from './store'
import type { RegistryModel } from './publicBundle'
import {
  registryModelForCell,
  isRankableCell,
  cellAxesOf,
  variantReceiptsForModel,
  type CellAxes,
} from './receipts.ts'
import { matchedPairsForModel, type MatchedPair } from './matchedPairs.ts'
import { flipDiff, type FlipDiff } from './taskMatrix.ts'

// ---------------------------------------------------------------------------
// Bench vs real-workload decode (the anti-marketing join)
// ---------------------------------------------------------------------------

export interface BenchVsReal {
  /** Weights checkpoint the two measurements share. */
  alias: string
  machine: string
  engine: string | null
  quant: string | null
  /** Bench decode (tg128, short prompt, no tools). */
  tg128: number
  /** Bench prefill (pp512). */
  pp512: number | null
  /** Real-workload decode across conditions [min, max] and the cell count. */
  agenticMin: number
  agenticMax: number
  nConditions: number
  /** Best rankable receipt for provenance (cell name / score). */
  bestCell: SweCell
  /** agenticMax / tg128 — < 1 means real work runs slower than the bench. */
  ratio: number
}

const GENERIC_MACHINE_TOKENS = new Set(['cookys', 'linux', 'windows', 'macos', 'mac'])

function machineTokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !GENERIC_MACHINE_TOKENS.has(t)),
  )
}

function sameMachine(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = machineTokens(a)
  const tb = machineTokens(b)
  if (!ta.size || !tb.size) return false
  for (const t of ta) if (tb.has(t)) return true
  return false
}

/** Normalized alias with any trailing `.gguf`/`gguf` stripped — for EXACT
 * checkpoint identity. Containment is too loose here: `…-Q4_K_M-unsloth`
 * contains `…-Q4_K_M`, but those are two different publishers' weights and
 * must never share a bench number. */
const norm = (s: string | null | undefined): string =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/gguf$/, '')

/**
 * Join eval cells (real-workload agentic tok/s) to speed records (bench
 * tg128/pp512) that measured the SAME weights on the SAME machine. Multiple
 * eval conditions (thinking, drafters…) collapse into one row with an
 * agentic range — a user runs one checkpoint, under some condition.
 */
export function benchVsRealRows(
  cells: SweCell[],
  records: SpeedRecord[],
  registry: RegistryModel[],
): BenchVsReal[] {
  const groups = new Map<string, { record: SpeedRecord; alias: string; cells: SweCell[] }>()

  for (const cell of cells) {
    if (cell.agentic_tok_s == null || (cell.identity?.access ?? '') !== 'local') continue
    const reg = registryModelForCell(cell, registry)
    if (!reg) continue
    const aliasKey = norm(reg.alias)
    const record = records.find((r) => {
      if (r.tg128_tps == null) return false
      const recAlias = norm(r.model_alias)
      if (!recAlias || recAlias !== aliasKey) return false
      return sameMachine(r.profile, cell.machine)
    })
    if (!record) continue
    const key = `${aliasKey}|${norm(record.profile)}`
    const g = groups.get(key) ?? { record, alias: reg.alias, cells: [] }
    g.cells.push(cell)
    groups.set(key, g)
  }

  return Array.from(groups.values())
    .map(({ record, alias, cells: cs }): BenchVsReal => {
      const speeds = cs.map((c) => c.agentic_tok_s!).sort((a, b) => a - b)
      const best = cs.reduce((a, b) => {
        const ra = isRankableCell(a) ? 1 : 0
        const rb = isRankableCell(b) ? 1 : 0
        if (ra !== rb) return ra > rb ? a : b
        return (b.headline ?? 0) > (a.headline ?? 0) ? b : a
      })
      return {
        alias,
        machine: cs[0].machine ?? record.profile ?? '—',
        engine: record.engine ?? null,
        quant: record.quant ?? null,
        tg128: record.tg128_tps!,
        pp512: record.pp512_tps ?? null,
        agenticMin: speeds[0],
        agenticMax: speeds[speeds.length - 1],
        nConditions: cs.length,
        bestCell: best,
        ratio: speeds[speeds.length - 1] / record.tg128_tps!,
      }
    })
    .sort((a, b) => b.tg128 - a.tg128)
}

/** Fleet-level bench-vs-real join summary for Speed page header. */
export function benchVsRealSummary(rows: BenchVsReal[]): {
  nJoins: number
  medianRatio: number | null
} | null {
  if (!rows.length) return null
  const ratios = rows.map((r) => r.ratio).filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b)
  if (!ratios.length) return { nJoins: rows.length, medianRatio: null }
  const mid = ratios[Math.floor(ratios.length / 2)]
  return { nJoins: rows.length, medianRatio: mid }
}

// ---------------------------------------------------------------------------
// Machine explorer — every measured run, grouped by model, bench joined inline
// ---------------------------------------------------------------------------

export interface MachineRunRow {
  cell: SweCell
  canonical: string
  alias: string | null
  agentic: number
  rankable: boolean
  /** Serving-condition chips (engine, quant, drafter, TP, …). */
  chips: string[]
  benchTg128: number | null
  benchPp512: number | null
  /** agentic / benchTg128 when bench exists on the same machine. */
  ratio: number | null
  /** How many single-variable matched pairs include this run. */
  pairCount: number
}

export interface MachineModelGroup {
  canonical: string
  runs: MachineRunRow[]
  /** Controlled A/B pairs whose both legs appear on this machine. */
  pairs: MatchedPair[]
}

export interface MachineExplorerBoard {
  machine: string
  isCloud: boolean
  groups: MachineModelGroup[]
  maxAgentic: number
  totalRuns: number
  totalPairs: number
}

function benchRecordForCell(
  cell: SweCell,
  reg: RegistryModel | null,
  records: SpeedRecord[],
): SpeedRecord | null {
  if (!reg) return null
  const aliasKey = norm(reg.alias)
  return (
    records.find((r) => {
      if (r.tg128_tps == null) return false
      if (norm(r.model_alias) !== aliasKey) return false
      return sameMachine(r.profile, cell.machine)
    }) ?? null
  )
}

function conditionChips(axes: CellAxes, reg: RegistryModel | null): string[] {
  const chips: string[] = []
  const quant = axes.quantTag ?? reg?.quant
  if (quant) chips.push(quant)
  if (axes.engine) chips.push(axes.engineInferred ? `${axes.engine}?` : axes.engine)
  if (axes.spec && axes.spec !== 'none') chips.push(axes.spec)
  if (axes.tp != null && axes.tp !== 1) chips.push(`TP${axes.tp}`)
  if (axes.thinking) chips.push(`think:${axes.thinking}`)
  if (axes.temp != null && axes.temp !== '1' && axes.temp !== '1.0') chips.push(`t=${axes.temp}`)
  if (axes.variant) chips.push(axes.variant)
  if (axes.ctxK) chips.push(`${axes.ctxK}k`)
  return chips
}

function buildExplorerBoard(
  machine: string,
  pool: SweCell[],
  isCloud: boolean,
  records: SpeedRecord[],
  registry: RegistryModel[],
  allCells: SweCell[],
): MachineExplorerBoard {
  const byCanonical = new Map<string, SweCell[]>()
  for (const c of pool) {
    const canonical = (c.identity?.canonical_model ?? c.model ?? '').toLowerCase()
    if (!canonical) continue
    const arr = byCanonical.get(canonical) ?? []
    arr.push(c)
    byCanonical.set(canonical, arr)
  }

  const groups: MachineModelGroup[] = []
  let totalPairs = 0

  for (const [canonical, cs] of byCanonical) {
    const allReceipts = variantReceiptsForModel(canonical, allCells, registry)
    const machineReceipts = isCloud
      ? allReceipts.filter((r) => (r.cell.identity?.access ?? '') !== 'local')
      : allReceipts.filter((r) => sameMachine(r.cell.machine, machine))

    const cellIds = new Set(cs.map((c) => c.cell).filter((id): id is string => !!id))
    const pairs = matchedPairsForModel(machineReceipts).filter(
      (p) => p.a.cell.cell && p.b.cell.cell && cellIds.has(p.a.cell.cell) && cellIds.has(p.b.cell.cell),
    )
    totalPairs += pairs.length

    const pairCountByCell = new Map<string, number>()
    for (const p of pairs) {
      const aId = p.a.cell.cell
      const bId = p.b.cell.cell
      if (!aId || !bId) continue
      pairCountByCell.set(aId, (pairCountByCell.get(aId) ?? 0) + 1)
      pairCountByCell.set(bId, (pairCountByCell.get(bId) ?? 0) + 1)
    }

    const runs: MachineRunRow[] = cs
      .map((c) => {
        const reg = registryModelForCell(c, registry)
        const axes = cellAxesOf(c, reg)
        const bench = isCloud ? null : benchRecordForCell(c, reg, records)
        const agentic = c.agentic_tok_s!
        const benchTg = bench?.tg128_tps ?? null
        return {
          cell: c,
          canonical,
          alias: reg?.alias ?? null,
          agentic,
          rankable: isRankableCell(c),
          chips: conditionChips(axes, reg),
          benchTg128: benchTg,
          benchPp512: bench?.pp512_tps ?? null,
          ratio: benchTg ? agentic / benchTg : null,
          pairCount: c.cell ? (pairCountByCell.get(c.cell) ?? 0) : 0,
        }
      })
      .sort((a, b) => b.agentic - a.agentic)

    groups.push({ canonical, runs, pairs })
  }

  groups.sort(
    (a, b) => Math.max(...b.runs.map((r) => r.agentic)) - Math.max(...a.runs.map((r) => r.agentic)),
  )
  const maxAgentic = Math.max(0, ...groups.flatMap((g) => g.runs.map((r) => r.agentic)))
  const totalRuns = groups.reduce((n, g) => n + g.runs.length, 0)
  return { machine, isCloud, groups, maxAgentic, totalRuns, totalPairs }
}

/**
 * Per-machine (or cloud-reference) explorer: every agentic measurement as its
 * own row, canonical models as collapsible groups, bench numbers joined inline,
 * matched pairs attached to the group they belong to.
 */
export function machineExplorerBoards(
  cells: SweCell[],
  records: SpeedRecord[],
  registry: RegistryModel[],
): MachineExplorerBoard[] {
  const localByMachine = new Map<string, SweCell[]>()
  const cloudPool: SweCell[] = []

  for (const c of cells) {
    if (c.agentic_tok_s == null) continue
    if ((c.identity?.access ?? '') !== 'local') {
      cloudPool.push(c)
      continue
    }
    const machine = c.machine && c.machine !== '?' ? c.machine : null
    if (!machine) continue
    const arr = localByMachine.get(machine) ?? []
    arr.push(c)
    localByMachine.set(machine, arr)
  }

  const boards: MachineExplorerBoard[] = []
  for (const [machine, pool] of localByMachine) {
    boards.push(buildExplorerBoard(machine, pool, false, records, registry, cells))
  }
  if (cloudPool.length) {
    boards.push(buildExplorerBoard('cloud', cloudPool, true, records, registry, cells))
  }
  return boards.sort(
    (a, b) => Number(a.isCloud) - Number(b.isCloud) || b.totalRuns - a.totalRuns,
  )
}

// ---------------------------------------------------------------------------
// Coding-harness comparison — local + cloud on the same exam, one table
// ---------------------------------------------------------------------------

export type HarnessSortKey = 'speed' | 'score' | 'efficiency'

export interface CodingHarnessRow {
  cell: SweCell
  canonical: string
  isLocal: boolean
  /** Where this run was served / accessed (machine profile or API route). */
  routeLabel: string
  chips: string[]
  agentic: number
  rankable: boolean
  benchTg128: number | null
  ratio: number | null
  solvedPerHour: number | null
  passed: number
  graded: number
  scoreRate: number | null
  /** Canonical exam version id (e.g. 34t-4885e69a). */
  examVersion: string | null
}

function routeLabelOf(cell: SweCell): string {
  const isLocal = (cell.identity?.access ?? '') === 'local'
  if (isLocal) return cell.machine ?? cell.profile ?? 'local'
  return (
    cell.access_label
    ?? cell.harness
    ?? cell.identity?.access
    ?? cell.source
    ?? 'cloud'
  )
}

/**
 * Every comparable full-exam cell with agentic throughput — local and cloud in
 * one pool. Same harness, same exam denominator; sort by speed, score, or
 * solved-per-hour to compare routes.
 */
export function codingHarnessRows(
  cells: SweCell[],
  records: SpeedRecord[],
  registry: RegistryModel[],
): CodingHarnessRow[] {
  return cells
    .filter(
      (c) =>
        c.comparable === true
        && c.agentic_tok_s != null
        && (c.n_graded ?? 0) >= 30,
    )
    .map((c): CodingHarnessRow => {
      const isLocal = (c.identity?.access ?? '') === 'local'
      const reg = registryModelForCell(c, registry)
      const axes = cellAxesOf(c, reg)
      const bench = isLocal ? benchRecordForCell(c, reg, records) : null
      const agentic = c.agentic_tok_s!
      const benchTg = bench?.tg128_tps ?? null
      const passed = c.n_passed ?? 0
      const graded = c.n_graded ?? 0
      return {
        cell: c,
        canonical: (c.identity?.canonical_model ?? c.model ?? '').toLowerCase(),
        isLocal,
        routeLabel: routeLabelOf(c),
        chips: conditionChips(axes, reg),
        agentic,
        rankable: isRankableCell(c),
        benchTg128: benchTg,
        ratio: benchTg ? agentic / benchTg : null,
        solvedPerHour: c.solved_per_hour ?? null,
        passed,
        graded,
        scoreRate: graded ? passed / graded : null,
        examVersion: c.canonical_version ?? null,
      }
    })
}

export function sortHarnessRows(
  rows: CodingHarnessRow[],
  key: HarnessSortKey,
): CodingHarnessRow[] {
  const sorted = [...rows]
  if (key === 'speed') {
    sorted.sort((a, b) => b.agentic - a.agentic)
  } else if (key === 'score') {
    sorted.sort((a, b) => (b.scoreRate ?? -1) - (a.scoreRate ?? -1) || b.agentic - a.agentic)
  } else {
    sorted.sort(
      (a, b) => (b.solvedPerHour ?? -1) - (a.solvedPerHour ?? -1) || b.agentic - a.agentic,
    )
  }
  return sorted
}

// ---------------------------------------------------------------------------
// Real-workload speed boards — per machine, every model, score attached
// ---------------------------------------------------------------------------

export interface RealSpeedRow {
  canonical: string
  cell: SweCell
  /** Fastest measured condition for this model on this machine. */
  agentic: number
  rankable: boolean
}

export interface RealSpeedBoard {
  /** Machine profile, or 'cloud' for the API anchors. */
  machine: string
  isCloud: boolean
  rows: RealSpeedRow[]
  /** Fastest agentic tok/s on the board (for bar scaling). */
  maxAgentic: number
}

/**
 * Group real-workload throughput by machine (cloud APIs form one board).
 * One row per canonical model: the FASTEST measured condition, with its
 * score attached — speed without the capability price tag is marketing.
 */
export function realSpeedBoards(cells: SweCell[]): RealSpeedBoard[] {
  const pool = cells.filter(
    (c) => c.comparable === true && c.agentic_tok_s != null && (c.n_graded ?? 0) >= 30,
  )
  const groups = new Map<string, Map<string, SweCell>>()
  for (const c of pool) {
    const isCloud = (c.identity?.access ?? '') !== 'local'
    // '?' is the producer's unknown-machine marker: a local speed number with
    // no hardware attribution is meaningless on a per-machine board — skip it.
    const machine = isCloud ? 'cloud' : (c.machine && c.machine !== '?' ? c.machine : null)
    if (!machine) continue
    const canonical = (c.identity?.canonical_model ?? c.model ?? '').toLowerCase()
    if (!canonical) continue
    const board = groups.get(machine) ?? new Map<string, SweCell>()
    const prev = board.get(canonical)
    if (!prev || (c.agentic_tok_s ?? 0) > (prev.agentic_tok_s ?? 0)) board.set(canonical, c)
    groups.set(machine, board)
  }
  return Array.from(groups.entries())
    .map(([machine, byModel]): RealSpeedBoard => {
      const rows = Array.from(byModel.entries())
        .map(([canonical, c]): RealSpeedRow => ({
          canonical,
          cell: c,
          agentic: c.agentic_tok_s!,
          rankable: isRankableCell(c),
        }))
        .sort((a, b) => b.agentic - a.agentic)
      return {
        machine,
        isCloud: machine === 'cloud',
        rows,
        maxAgentic: rows[0]?.agentic ?? 0,
      }
    })
    // Local boards first (most-measured first); the cloud reference board last.
    .sort((a, b) => Number(a.isCloud) - Number(b.isCloud) || b.rows.length - a.rows.length)
}

// ---------------------------------------------------------------------------
// Bench boards — the full tg128/pp512 grid, grouped by machine profile
// ---------------------------------------------------------------------------

export interface BenchBoard {
  profile: string
  rows: SpeedRecord[]
  maxTg: number
}

export function benchBoards(records: SpeedRecord[]): BenchBoard[] {
  const groups = new Map<string, SpeedRecord[]>()
  for (const r of records) {
    if (r.tg128_tps == null) continue
    const key = r.profile ?? '—'
    const arr = groups.get(key) ?? []
    arr.push(r)
    groups.set(key, arr)
  }
  return Array.from(groups.entries())
    .map(([profile, rows]): BenchBoard => {
      const sorted = [...rows].sort((a, b) => (b.tg128_tps ?? 0) - (a.tg128_tps ?? 0))
      return { profile, rows: sorted, maxTg: sorted[0]?.tg128_tps ?? 0 }
    })
    .sort((a, b) => b.maxTg - a.maxTg)
}

// ---------------------------------------------------------------------------
// Cloud frontier: best single local model vs best cloud anchor, per task
// ---------------------------------------------------------------------------

export interface FrontierTaskGap {
  taskId: string
  domain: string | null
  /** Share of local full-exam rankable cells that solve this task. */
  localShare: number
  /** Share of cloud full-exam cells that solve this task. */
  cloudShare: number
  /** cloudShare − localShare: high = the local fleet broadly stalls here. */
  gap: number
}

export interface FrontierComparison {
  bestLocal: SweCell
  bestCloud: SweCell
  /** Per-task diff between the two champions (a = cloud, b = local). */
  flip: FlipDiff | null
  /** Tasks sorted by cloud-vs-local solve-share gap (locally hard first). */
  taskGaps: FrontierTaskGap[]
  nLocalCells: number
  nCloudCells: number
}

function fullExamPool(cells: SweCell[]): SweCell[] {
  return cells.filter((c) => c.comparable === true && c.task_verdicts && (c.n_graded ?? 0) >= 30)
}

export function frontierComparison(
  cells: SweCell[],
  taskDomains: Record<string, string>,
): FrontierComparison | null {
  const pool = fullExamPool(cells)
  const local = pool.filter((c) => (c.identity?.access ?? '') === 'local' && isRankableCell(c))
  const cloud = pool.filter((c) => (c.identity?.access ?? '') !== 'local')
  if (!local.length || !cloud.length) return null

  const best = (arr: SweCell[]) =>
    arr.reduce((a, b) => ((b.headline ?? 0) > (a.headline ?? 0) ? b : a))
  const bestLocal = best(local)
  const bestCloud = best(cloud)

  const taskGaps: FrontierTaskGap[] = Object.keys(taskDomains)
    .map((taskId): FrontierTaskGap | null => {
      const share = (arr: SweCell[]) => {
        const graded = arr.filter((c) => c.task_verdicts![taskId])
        if (!graded.length) return null
        return graded.filter((c) => c.task_verdicts![taskId] === 'PASS').length / graded.length
      }
      const localShare = share(local)
      const cloudShare = share(cloud)
      if (localShare === null || cloudShare === null) return null
      return {
        taskId,
        domain: taskDomains[taskId] ?? null,
        localShare,
        cloudShare,
        gap: cloudShare - localShare,
      }
    })
    .filter((g): g is FrontierTaskGap => g !== null)
    .sort((a, b) => b.gap - a.gap)

  return {
    bestLocal,
    bestCloud,
    flip: flipDiff(bestCloud, bestLocal, taskDomains),
    taskGaps,
    nLocalCells: local.length,
    nCloudCells: cloud.length,
  }
}

// ---------------------------------------------------------------------------
// Toolchain error rate: ERROR verdicts are harness/infra casualties, not FAILs
// ---------------------------------------------------------------------------

export interface ErrorRateSummary {
  access: 'local' | 'cloud'
  nCells: number
  nVerdicts: number
  nError: number
  errorShare: number
}

export function errorRateByAccess(cells: SweCell[]): ErrorRateSummary[] {
  const pool = fullExamPool(cells)
  const out: ErrorRateSummary[] = []
  for (const access of ['local', 'cloud'] as const) {
    const mine = pool.filter((c) =>
      access === 'local'
        ? (c.identity?.access ?? '') === 'local'
        : (c.identity?.access ?? '') !== 'local',
    )
    let nVerdicts = 0
    let nError = 0
    for (const c of mine) {
      for (const v of Object.values(c.task_verdicts!)) {
        nVerdicts += 1
        if (v === 'ERROR') nError += 1
      }
    }
    out.push({
      access,
      nCells: mine.length,
      nVerdicts,
      nError,
      errorShare: nVerdicts ? nError / nVerdicts : 0,
    })
  }
  return out
}
