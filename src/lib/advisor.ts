/**
 * Advisor — the "pick for me" derivation layer behind the v1 home flow.
 *
 * Everything here is receipt-based, but the receipt is split along what it
 * actually proves: the exam SCORE is a property of the checkpoint + serving
 * config (hardware only changes speed), so a quant measured on a 96GB box
 * counts for any budget its WEIGHTS fit into — while the SPEED number stays
 * pinned to the machine it was measured on. Two qualification tracks:
 *   'weights'  — checkpoint weights fit the budget with KV headroom
 *   'measured' — the run itself happened on a machine that small (speed
 *                number transfers too)
 * No capability extrapolation ever: unmeasured models never appear.
 * The cloud anchor gives lay readers a familiar reference point ("the best
 * cloud agent solves 33/33; this local pick reaches ~85% of that").
 */

import type { SweCell } from './store'
import type { FleetMachine, RegistryModel } from './publicBundle'
import type { HardwareTier } from './hardwareTiers'
// Explicit .ts extension so `node --test` (type-stripping, no bundler resolution) can load this module.
import { registryModelForCell, isRankableCell, wilsonLowOf } from './receipts.ts'

/** Same precedence as hardwareTiers.machineVramGb (kept type-only importable for node --test). */
function machineVramGb(m: FleetMachine): number | null {
  return m.vram_pool_gb ?? m.vram_total_gb ?? m.vram_per_gpu_gb ?? null
}

/** Minimum graded tasks for a run to count as a full exam (canonical is 33–34). */
export const MIN_FULL_RUN = 30

/** Owner/OS noise tokens that don't identify hardware (cookys-cuda ≈ cookys-cuda-linux). */
const GENERIC_NAME_TOKENS = new Set(['cookys', 'linux', 'windows', 'wsl', 'main'])

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !GENERIC_NAME_TOKENS.has(t))
}

/**
 * Join a cell's stamped machine name to the fleet row. Exact profile/alias
 * match first; otherwise token containment — eval results stamp short names
 * (`cookys-cuda`, `cookys-7840hs`) while fleet profiles carry OS suffixes
 * (`cookys-cuda-linux`, `cookys-linux-7840hs`).
 */
export function machineForCell(
  cell: Pick<SweCell, 'machine' | 'profile'>,
  machines: FleetMachine[],
): FleetMachine | null {
  const key = (cell.machine ?? '').toLowerCase().trim()
  if (!key || key === '?') return null
  for (const m of machines) {
    if (m.profile.toLowerCase() === key) return m
    if (m.aliases.some((a) => a.toLowerCase() === key)) return m
  }
  const want = nameTokens(key)
  if (!want.length) return null
  for (const m of machines) {
    const have = new Set([m.profile, ...m.aliases].flatMap(nameTokens))
    if (want.every((t) => have.has(t))) return m
  }
  return null
}

const wilsonLow = wilsonLowOf

function isFullRankable(cell: SweCell): boolean {
  return isRankableCell(cell) && (cell.n_graded ?? 0) >= MIN_FULL_RUN
}

function isLocal(cell: SweCell): boolean {
  return (cell.identity?.access ?? '') === 'local'
}

function isRemote(cell: SweCell): boolean {
  const a = cell.identity?.access ?? ''
  return a !== '' && a !== 'local'
}

/**
 * Fraction of budget VRAM the weights may occupy — the rest is KV cache /
 * context headroom (same spirit as validate-configs.py's footprint check).
 */
export const KV_HEADROOM_FRACTION = 0.85

export function weightsFitBudget(weightsGb: number | null | undefined, budgetGb: number): boolean {
  if (weightsGb == null) return false
  if (!Number.isFinite(budgetGb)) return true
  return weightsGb <= budgetGb * KV_HEADROOM_FRACTION
}

export interface ModelPick {
  canonical: string
  cell: SweCell
  registry: RegistryModel | null
  machine: FleetMachine | null
  /** VRAM (GB) of the machine this exact score was measured on. */
  measuredOnGb: number | null
  /** Checkpoint weights size (GB) from the registry, if known. */
  weightsGb: number | null
  /**
   * Why this pick qualifies for the budget:
   * 'measured' — the run happened on a machine that small (speed transfers);
   * 'weights'  — the checkpoint fits by size, but the speed number was
   *              measured on a bigger machine.
   */
  fitBasis: 'measured' | 'weights'
}

/**
 * Best full-run local cells whose SCORE is valid for hardware within
 * `budgetGb`, folded to one pick per canonical model, best first (Wilson
 * lower bound, so small-n flukes don't outrank solid runs).
 *
 * A cell qualifies if EITHER the machine it ran on fits the budget
 * ('measured' — score AND speed transfer) or its checkpoint weights fit with
 * KV headroom ('weights' — score transfers, speed is machine-bound). Ties on
 * score prefer 'measured'. An infinite budget admits every full local run.
 */
export function localPicksForBudget(
  budgetGb: number,
  cells: SweCell[],
  machines: FleetMachine[],
  registry: RegistryModel[],
): ModelPick[] {
  const byCanonical = new Map<string, ModelPick>()
  for (const cell of cells) {
    if (!isLocal(cell) || !isFullRankable(cell)) continue
    const machine = machineForCell(cell, machines)
    const gb = machine ? machineVramGb(machine) : null
    const reg = registryModelForCell(cell, registry)
    const weightsGb = reg?.weights_gb ?? null
    const measuredFit = !Number.isFinite(budgetGb) || (gb != null && gb <= budgetGb)
    const weightsFit = weightsFitBudget(weightsGb, budgetGb)
    if (!measuredFit && !weightsFit) continue
    const canonical = cell.identity?.canonical_model ?? cell.model
    const pick: ModelPick = {
      canonical,
      cell,
      registry: reg,
      machine,
      measuredOnGb: gb,
      weightsGb,
      fitBasis: measuredFit ? 'measured' : 'weights',
    }
    const prev = byCanonical.get(canonical)
    if (
      !prev
      || wilsonLow(cell) > wilsonLow(prev.cell)
      || (wilsonLow(cell) === wilsonLow(prev.cell) && pick.fitBasis === 'measured' && prev.fitBasis === 'weights')
    ) byCanonical.set(canonical, pick)
  }
  return Array.from(byCanonical.values()).sort(
    (a, b) => wilsonLow(b.cell) - wilsonLow(a.cell),
  )
}

export function localPicksForTier(
  tier: HardwareTier,
  cells: SweCell[],
  machines: FleetMachine[],
  registry: RegistryModel[],
): ModelPick[] {
  const budget = Number.isFinite(tier.maxGb) ? tier.maxGb : Number.MAX_SAFE_INTEGER
  return localPicksForBudget(budget, cells, machines, registry)
}

/** The strongest full-run cloud cell — the familiar reference point. */
export function cloudAnchor(cells: SweCell[]): SweCell | null {
  let best: SweCell | null = null
  for (const cell of cells) {
    if (!isRemote(cell) || !isFullRankable(cell)) continue
    if (!best || wilsonLow(cell) > wilsonLow(best)) best = cell
  }
  return best
}

/** pick pass-rate as a fraction of the anchor's (for "~N 成功力" phrasing). */
export function anchorRatio(cell: SweCell, anchor: SweCell | null): number | null {
  const mine = cell.headline
  const theirs = anchor?.headline
  if (mine == null || theirs == null || theirs === 0) return null
  return mine / theirs
}

/** "X 成" phrasing: 0.85 → "8.5 成" / "85%" for en. */
export function ratioPhrase(ratio: number | null, locale: 'en' | 'zh'): string | null {
  if (ratio == null) return null
  if (locale === 'zh') {
    const tenths = Math.round(ratio * 100) / 10
    return `${tenths % 1 === 0 ? tenths.toFixed(0) : tenths.toFixed(1)} 成`
  }
  return `${Math.round(ratio * 100)}%`
}

export function passFraction(cell: SweCell): string {
  return `${cell.n_passed ?? '?'} / ${cell.n_graded ?? '?'}`
}

/**
 * One-sentence plain-language verdict, fully derived:
 * 「34 道真實 coding 題解出 29 題，約為雲端最強 grok-4.5（33/33）的 8.8 成」
 */
export function plainVerdict(
  pick: ModelPick,
  anchor: SweCell | null,
  locale: 'en' | 'zh',
): string {
  const solved = pick.cell.n_passed ?? 0
  const total = pick.cell.n_graded ?? 0
  const ratio = ratioPhrase(anchorRatio(pick.cell, anchor), locale)
  const anchorName = anchor ? (anchor.identity?.canonical_model ?? anchor.model) : null
  if (locale === 'zh') {
    let s = `在 ${total} 道真實 coding 題中解出 ${solved} 題`
    if (ratio && anchorName && anchor) {
      s += `，約為雲端最強 ${anchorName}（${passFraction(anchor)}）的 ${ratio}功力`
    }
    return s
  }
  let s = `Solved ${solved} of ${total} real coding tasks`
  if (ratio && anchorName && anchor) {
    s += `, roughly ${ratio} of the best cloud agent ${anchorName} (${passFraction(anchor)})`
  }
  return s
}

// ---------------------------------------------------------------------------
// Hardware budget presets — the entry question, phrased in gear people own.
// Membership/examples are derived from the fleet at render time.
// ---------------------------------------------------------------------------

export interface BudgetPreset {
  id: string
  maxGb: number
  title: { en: string; zh: string }
  examples: { en: string; zh: string }
}

export const BUDGET_PRESETS: BudgetPreset[] = [
  {
    id: 'gpu-16',
    maxGb: 16,
    title: { zh: '入門獨顯 / 小筆電', en: 'Entry GPU / small laptop' },
    examples: { zh: 'RTX 4060 Ti、3080、16GB Mac', en: 'RTX 4060 Ti, 3080, 16GB Mac' },
  },
  {
    id: 'gpu-24',
    maxGb: 32,
    title: { zh: '一張遊戲旗艦卡', en: 'One flagship gaming GPU' },
    examples: { zh: 'RTX 3090 / 4090 / 5090、24–32GB Mac', en: 'RTX 3090 / 4090 / 5090, 24–32GB Mac' },
  },
  {
    id: 'unified-64',
    maxGb: 64,
    title: { zh: '大統一記憶體 / 雙卡', en: 'Big unified memory / dual GPU' },
    examples: { zh: 'Strix Halo 64GB、Mac 36–64GB、雙 24GB 卡', en: 'Strix Halo 64GB, Mac 36–64GB, 2× 24GB' },
  },
  {
    id: 'workstation',
    maxGb: Infinity,
    title: { zh: '工作站級', en: 'Workstation class' },
    examples: { zh: 'RTX 6000 Pro、128GB+ 統一記憶體', en: 'RTX 6000 Pro, 128GB+ unified' },
  },
]

/** Fleet machines whose measured VRAM fits inside the preset budget. */
export function fleetExamplesForBudget(
  preset: BudgetPreset,
  machines: FleetMachine[],
): FleetMachine[] {
  const floor = BUDGET_PRESETS[BUDGET_PRESETS.indexOf(preset) - 1]?.maxGb ?? 0
  return machines.filter((m) => {
    const gb = machineVramGb(m)
    return gb != null && gb > floor && gb <= preset.maxGb
  })
}
