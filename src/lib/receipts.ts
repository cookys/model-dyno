/**
 * Variant receipts — the derived comparison layer.
 *
 * Every comparison table in the v1 UI (quantization ladder, engine spread,
 * lineage tree, config receipts) is DERIVED here from the real snapshot
 * sections (SWE cells + model_registry + run_configs), never hand-written.
 * Rule: a number that cannot be traced back to a cell/registry row does not
 * get rendered. Unknown → null → the UI shows "—", not an invented value.
 */

import type { SweCell } from './store'
import type { RegistryModel, RunConfig } from './publicBundle'
import {
  cellAxesOf,
  normalizedAlias,
  slugCoreOfCell,
  axesFromCellSlug,
  type CellAxes,
  type VariantAxes,
} from './cellAxes.ts'

// Re-exported so existing imports (views/tests) keep one entry point.
export { cellAxesOf, slugCoreOfCell, axesFromCellSlug }
export type { CellAxes, VariantAxes }

// ---------------------------------------------------------------------------
// Mod typology (derived from checkpoint naming, not curated per-model)
// ---------------------------------------------------------------------------

export type ModType = 'official' | 'abliterated' | 'draft' | 'mtp'

export function modTypeOfAlias(alias: string, hfRepo?: string | null): ModType {
  const hay = `${alias} ${hfRepo ?? ''}`.toLowerCase()
  if (/abliterat|uncensor|heretic/.test(hay)) return 'abliterated'
  if (/dspark|dflash|eagle|draft/.test(hay)) return 'draft'
  if (/(^|[-_/])mtp([-_.]|$)/.test(hay)) return 'mtp'
  return 'official'
}

export function publisherOfRepo(hfRepo: string | null | undefined): string | null {
  if (!hfRepo) return null
  const org = hfRepo.split('/')[0]?.trim()
  return org || null
}

export function getModTypeBadge(modType: ModType, locale: 'en' | 'zh' = 'zh') {
  switch (modType) {
    case 'official':
      return {
        label: locale === 'zh' ? '官方權重' : 'Official weights',
        colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      }
    case 'abliterated':
      return {
        label: locale === 'zh' ? '去審查改裝 (Abliterated)' : 'Abliterated (uncensored)',
        colorClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      }
    case 'draft':
      return {
        label: locale === 'zh' ? '推測解碼草稿模型' : 'Spec-decode draft model',
        colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
      }
    case 'mtp':
      return {
        label: locale === 'zh' ? 'MTP 多 token 預測頭' : 'MTP head variant',
        colorClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      }
  }
}

// ---------------------------------------------------------------------------
// Registry join (cell display_slug embeds the registry alias)
// ---------------------------------------------------------------------------

/**
 * Join a cell to its weight checkpoint: the producer's display_slug embeds the
 * registry alias (`results-<cell>-<Alias>-<hash>`), so longest-contained-alias
 * wins. Cloud cells have no local weights and return null — by design.
 */
export function registryModelForCell(
  cell: Pick<SweCell, 'cell' | 'profile' | 'display'>,
  registry: RegistryModel[],
): RegistryModel | null {
  const hay = `${cell.cell ?? ''} ${cell.profile ?? ''}`
  if (!hay.trim()) return null
  let best: RegistryModel | null = null
  let bestLen = 0
  for (const m of registry) {
    const needle = normalizedAlias(m.alias)
    if (needle.length > bestLen && hay.includes(needle)) {
      best = m
      bestLen = needle.length
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Variant receipts for one canonical model
// ---------------------------------------------------------------------------

export interface VariantReceipt {
  cell: SweCell
  registry: RegistryModel | null
  axes: CellAxes
  modType: ModType
  publisher: string | null
  /** Rankable capability cell vs experiment leg (A/B, prequal, partial). */
  rankable: boolean
}

/**
 * Experiment-leg roles per the producer's tag vocabulary (scripts/eval/README):
 * `vendor-settings` is the headline run, `candidate` is a standard evaluation
 * run, while `ab-leg`/`probe` vary sampling and `control`/`prequal` are
 * experiment scaffolding — visible in receipts, never ranked.
 */
const EXPERIMENT_ROLES = new Set(['ab-leg', 'probe', 'control', 'prequal', 'partial'])

export function isRankableCell(
  cell: Pick<SweCell, 'comparable' | 'run_role'>,
): boolean {
  if (cell.comparable !== true) return false
  return cell.run_role == null || !EXPERIMENT_ROLES.has(cell.run_role)
}

export function variantReceiptsForModel(
  canonical: string,
  cells: SweCell[],
  registry: RegistryModel[],
): VariantReceipt[] {
  const key = canonical.toLowerCase().trim()
  const mine = cells.filter((c) => {
    const cm = (c.identity?.canonical_model ?? c.model ?? '').toLowerCase()
    return cm === key
  })
  return mine.map((cell) => {
    const reg = registryModelForCell(cell, registry)
    const axes = cellAxesOf(cell, reg)
    const modType: ModType = reg ? modTypeOfAlias(reg.alias, reg.hf_repo) : 'official'
    return {
      cell,
      registry: reg,
      axes,
      modType,
      publisher: reg ? publisherOfRepo(reg.hf_repo) : null,
      rankable: isRankableCell(cell),
    }
  })
}

/** All canonical models that share a registry family with this one (lineage siblings). */
export function lineageSiblings(
  canonical: string,
  cells: SweCell[],
  registry: RegistryModel[],
): string[] {
  const receipts = variantReceiptsForModel(canonical, cells, registry)
  const families = new Set(
    receipts.map((r) => r.registry?.family).filter((f): f is string => !!f),
  )
  if (!families.size) return []
  const out = new Set<string>()
  for (const c of cells) {
    const reg = registryModelForCell(c, registry)
    if (reg?.family && families.has(reg.family)) {
      const cm = c.identity?.canonical_model ?? c.model
      if (cm && cm.toLowerCase() !== canonical.toLowerCase()) out.add(cm)
    }
  }
  return Array.from(out).sort()
}

/** Registry entries in this model's family — including checkpoints not yet benched. */
export interface LineageEntry {
  registry: RegistryModel
  modType: ModType
  publisher: string | null
  benched: boolean
  bestReceipt: VariantReceipt | null
}

export function lineageEntriesForModel(
  canonical: string,
  cells: SweCell[],
  registry: RegistryModel[],
): LineageEntry[] {
  const receipts = variantReceiptsForModel(canonical, cells, registry)
  const siblings = lineageSiblings(canonical, cells, registry)
  const allReceipts = receipts.concat(
    siblings.flatMap((s) => variantReceiptsForModel(s, cells, registry)),
  )
  const families = new Set(
    allReceipts.map((r) => r.registry?.family).filter((f): f is string => !!f),
  )
  if (!families.size) return []
  const byAlias = new Map<string, VariantReceipt>()
  for (const r of allReceipts) {
    if (!r.registry) continue
    const prev = byAlias.get(r.registry.alias)
    if (!prev || betterReceipt(r, prev)) byAlias.set(r.registry.alias, r)
  }
  return registry
    .filter((m) => m.family && families.has(m.family))
    .map((m): LineageEntry => {
      const best = byAlias.get(m.alias) ?? null
      return {
        registry: m,
        modType: modTypeOfAlias(m.alias, m.hf_repo),
        publisher: publisherOfRepo(m.hf_repo),
        benched: best !== null,
        bestReceipt: best,
      }
    })
    .sort((a, b) => {
      const order: Record<ModType, number> = { official: 0, mtp: 1, abliterated: 2, draft: 3 }
      const d = order[a.modType] - order[b.modType]
      if (d !== 0) return d
      return a.registry.alias.localeCompare(b.registry.alias)
    })
}

function betterReceipt(a: VariantReceipt, b: VariantReceipt): boolean {
  if (a.rankable !== b.rankable) return a.rankable
  const an = a.cell.n_graded ?? 0
  const bn = b.cell.n_graded ?? 0
  if (an !== bn) return an > bn
  return (a.cell.headline ?? 0) > (b.cell.headline ?? 0)
}

// ---------------------------------------------------------------------------
// Groupings (quant / engine) — pure filters over the receipt list
// ---------------------------------------------------------------------------

export interface AxisGroup {
  key: string
  receipts: VariantReceipt[]
  best: VariantReceipt
}

function groupBy(
  receipts: VariantReceipt[],
  keyOf: (r: VariantReceipt) => string | null,
): AxisGroup[] {
  const groups = new Map<string, VariantReceipt[]>()
  for (const r of receipts) {
    const k = keyOf(r)
    if (!k) continue
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  return Array.from(groups.entries())
    .map(([key, rs]) => {
      const sorted = [...rs].sort((a, b) => (betterReceipt(a, b) ? -1 : 1))
      return { key, receipts: sorted, best: sorted[0] }
    })
    .sort((a, b) => (b.best.cell.headline ?? 0) - (a.best.cell.headline ?? 0))
}

/** Same model grouped by quantization label — producer tag first, registry join fallback. */
export function quantGroupsForModel(receipts: VariantReceipt[]): AxisGroup[] {
  return groupBy(receipts, (r) => {
    const q = r.axes.quantTag ?? r.registry?.quant ?? null
    return q && q !== 'none' ? q : null
  })
}

/** Same model grouped by serving engine (explicit slug token or flagged inference). */
export function engineGroupsForModel(receipts: VariantReceipt[]): AxisGroup[] {
  return groupBy(receipts, (r) => r.axes.engine)
}

/**
 * Wilson lower bound of a cell's pass rate — the one RANKING key used across
 * the advisor and views. Always computed from the cell's own counts so every
 * cell is ranked on the same basis: at least one producer cell ships a
 * `headline_ci` inconsistent with its own counts (27/33 with CI [0.74, 0.97];
 * correct is [0.66, 0.91]), which would out-rank an honest 29/33. Producer CI
 * stays display-only (ScorePill bands, tiedWithBest) and is used here only
 * when counts are missing.
 */
export function wilsonLowOf(
  cell: Pick<SweCell, 'headline' | 'headline_ci' | 'n_passed' | 'n_graded'>,
): number {
  const n = cell.n_graded ?? 0
  if (n <= 0) return cell.headline_ci?.[0] ?? cell.headline ?? 0
  const p = cell.n_passed != null ? cell.n_passed / n : (cell.headline ?? 0)
  const z = 1.96
  const z2 = z * z
  const centre = p + z2 / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  return Math.max(0, (centre - margin) / (1 + z2 / n))
}

/**
 * Wilson-CI overlap vs the best group: "statistically tied with best" is the
 * honest replacement for hand-assigned quality tiers.
 */
export function tiedWithBest(group: AxisGroup, best: AxisGroup): boolean {
  const g = group.best.cell
  const b = best.best.cell
  const gHi = g.headline_ci?.[1]
  const bLo = b.headline_ci?.[0]
  if (gHi == null || bLo == null) return false
  return gHi >= bLo
}

// ---------------------------------------------------------------------------
// Launch recipe (from real run_configs — the reproducible command is launch.py)
// ---------------------------------------------------------------------------

export interface LaunchRecipe {
  config: RunConfig
  command: string
}

export function launchRecipesForModel(
  canonical: string,
  receipts: VariantReceipt[],
  runConfigs: RunConfig[],
): LaunchRecipe[] {
  const aliases = new Set(
    receipts
      .map((r) => r.registry?.alias)
      .filter((a): a is string => !!a)
      .map((a) => normalizedAlias(a).toLowerCase()),
  )
  const key = canonical.toLowerCase().replace(/[^a-z0-9]/g, '')
  const matches = runConfigs.filter((c) => {
    const model = (c.model ?? '').toLowerCase()
    const modelKey = (c.model_key ?? c.config).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (aliases.has(model)) return true
    return key.length >= 6 && (modelKey.includes(key) || key.includes(modelKey))
  })
  return matches.map((config) => ({
    config,
    command: `python scripts/launch.py ${config.config}`,
  }))
}
