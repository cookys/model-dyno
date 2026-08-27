/**
 * Channel parity — port of scripts/eval/channel-parity.py analyze_parity().
 * Same model, different access route: is the spread capability or tools?
 */
import type { SweCell } from './store'

export type ChannelParityVerdict =
  | 'consistent'
  | 'divergent-tools'
  | 'divergent-unexplained'
  | 'tool-floored'

export interface ParityChannelInput {
  canonical_model: string
  access: string
  acc: number
  noop_pct: number | null
  cap_pct: number | null
  n: number
  cell?: string
  machine?: string
}

export interface ChannelParityChannel {
  access: string
  acc: number
  noop_pct: number | null
  cap_pct: number | null
  n: number
}

export interface ChannelParityRow {
  canonical_model: string
  spread: number
  verdict: ChannelParityVerdict
  low_channel: string | null
  high_channel: string | null
  channels: ChannelParityChannel[]
}

export const DIVERGENCE_PP = 0.15
export const TOOLS_NOOP_PCT = 20
export const DEFAULT_MIN_N = 20

function capPctOf(cell: SweCell): number | null {
  const g = cell.gates
  if (g) {
    const trunc = g.trunc_pct ?? 0
    const maxstep = g.maxstep_pct ?? 0
    const cap = Math.max(trunc, maxstep)
    return cap > 0 ? cap : null
  }
  const ag = cell.agency
  if (ag?.budget_pct != null) return ag.budget_pct
  if (ag?.cap_pct != null) return ag.cap_pct
  return null
}

function accOf(cell: SweCell): number | null {
  if (cell.headline != null && isFinite(cell.headline)) return cell.headline
  const n = cell.n_graded ?? 0
  if (n > 0 && cell.n_passed != null) return cell.n_passed / n
  return null
}

/** Map snapshot cells → parity analyzer inputs (full pool, min_n applied inside analyze). */
export function parityInputsFromCells(cells: SweCell[]): ParityChannelInput[] {
  const out: ParityChannelInput[] = []
  for (const c of cells) {
    const cm = c.identity?.canonical_model ?? c.model
    const access = c.identity?.access ?? c.access_label ?? c.source
    const acc = accOf(c)
    if (!cm || !access || acc == null) continue
    out.push({
      canonical_model: cm,
      access,
      acc,
      noop_pct: c.agency?.noop_pct ?? c.gates?.noop_pct ?? null,
      cap_pct: capPctOf(c),
      n: c.n_graded ?? 0,
      cell: c.cell,
      machine: c.machine,
    })
  }
  return out
}

function toolFloored(c: { noop_pct?: number | null; cap_pct?: number | null }): boolean {
  return (c.noop_pct ?? 0) >= TOOLS_NOOP_PCT || (c.cap_pct ?? 0) >= TOOLS_NOOP_PCT
}

/** Pure core — mirrors channel-parity.py analyze_parity(). */
export function analyzeParity(
  cells: ParityChannelInput[],
  minN: number = DEFAULT_MIN_N,
): ChannelParityRow[] {
  const byModel = new Map<string, Map<string, ParityChannelInput>>()

  for (const c of cells) {
    if (!c.canonical_model || !c.access || c.acc == null || c.n < minN) continue
    const chans = byModel.get(c.canonical_model) ?? new Map()
    const prev = chans.get(c.access)
    const ckey = `${c.cell ?? ''}|${c.machine ?? ''}`
    const pkey = prev ? `${prev.cell ?? ''}|${prev.machine ?? ''}` : null
    if (
      !prev
      || c.n > prev.n
      || (c.n === prev.n && pkey != null && ckey < pkey)
    ) {
      chans.set(c.access, c)
    }
    byModel.set(c.canonical_model, chans)
  }

  const out: ChannelParityRow[] = []
  for (const [cm, chans] of byModel) {
    if (chans.size < 2) continue
    const rows = [...chans.values()].sort((a, b) => a.acc - b.acc)
    const accs = rows.map((r) => r.acc)
    const spread = Math.round((Math.max(...accs) - Math.min(...accs)) * 1000) / 1000
    const low = rows[0]
    const wide = spread >= DIVERGENCE_PP
    let verdict: ChannelParityVerdict
    if (wide && toolFloored(low)) verdict = 'divergent-tools'
    else if (wide) verdict = 'divergent-unexplained'
    else if (rows.some(toolFloored)) verdict = 'tool-floored'
    else verdict = 'consistent'

    out.push({
      canonical_model: cm,
      spread,
      verdict,
      low_channel: low.access,
      high_channel: rows[rows.length - 1].access,
      channels: rows.map((c) => ({
        access: c.access,
        acc: Math.round(c.acc * 1000) / 1000,
        noop_pct: c.noop_pct,
        cap_pct: c.cap_pct,
        n: c.n,
      })),
    })
  }
  out.sort((a, b) => b.spread - a.spread)
  return out
}

export function channelParityForModel(
  cells: SweCell[],
  canonical: string,
  minN: number = DEFAULT_MIN_N,
): ChannelParityRow | null {
  const rows = analyzeParity(parityInputsFromCells(cells), minN)
  const key = canonical.toLowerCase()
  return rows.find((r) => r.canonical_model.toLowerCase() === key) ?? null
}

export function channelParityRows(
  cells: SweCell[],
  minN: number = DEFAULT_MIN_N,
): ChannelParityRow[] {
  return analyzeParity(parityInputsFromCells(cells), minN)
}
