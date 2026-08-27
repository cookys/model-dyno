/**
 * Cell condition axes — the single source of truth for "what condition was
 * this run served under" (engine / quant / drafter / TP / thinking / temp /
 * variant / ctx / effort / lineage).
 *
 * Priority order:
 *   1. Producer's structured `entry.tags` (authoritative — the producer
 *      records the run condition at emit time; carries values slugs cannot,
 *      e.g. real temp 0.6/0.7/1.0, draft_n, variant=tp2/trimfloor045).
 *   2. Slug parsing on the cell name's run-condition CORE (fallback for
 *      feeds without tags). Alias-embedded tokens never leak into axes.
 *   3. Registry join (GGUF checkpoint → llama.cpp family, flagged inferred).
 */

import type { SweCell } from './store'
import type { RegistryModel } from './publicBundle'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantAxes {
  /** Engine display name; `engineInferred` marks the GGUF→llama.cpp heuristic. */
  engine: string | null
  engineInferred: boolean
  /**
   * Speculative-decoding condition. Distinct drafter variants are distinct
   * values (DSpark vs DSpark-miaai vs DFlash2 vs MTP); 'none' = explicitly no
   * drafter; null = unstated.
   */
  spec: string | null
  /** Tensor-parallel degree when stated; null = unstated (single-device serve). */
  tp: number | null
  /** Context budget in K tokens when stated (`-64k-`); null = unstated. */
  ctxK: number | null
  /** thinking mode when stated ('on' / 'off' / 'on-low'). */
  thinking: string | null
  /** temp=0 when known (tags temp or slug -t0 marker). */
  tempZero: boolean
}

export interface CellAxes extends VariantAxes {
  /** Real sampling temperature when the producer recorded it ('0', '0.6', '0.7', '1.0'). */
  temp: string | null
  /** Producer variant tag minus the tp part (e.g. 'trimfloor045', 'miaai-flags'). */
  variant: string | null
  /** Reasoning-effort tag (cloud cells: 'low' / 'xhigh'). */
  effort: string | null
  /** Producer lineage tag (base / abliterated / heretic / merged / pruned / instruct). */
  lineage: string | null
  /** Quant label straight from tags, when stated (registry join is the other source). */
  quantTag: string | null
  /** True when the condition record came from producer tags (vs slug guessing). */
  fromTags: boolean
}

// ---------------------------------------------------------------------------
// Slug fallback parsing
// ---------------------------------------------------------------------------

const ENGINE_TOKENS: Array<[RegExp, string]> = [
  [/sglang/, 'SGLang'],
  [/vllm/, 'vLLM'],
  [/trtllm|tensorrt/, 'TensorRT-LLM'],
  [/exl3|exllama/, 'ExLlamaV3'],
  [/lemonade/, 'Lemonade'],
  [/ollama/, 'Ollama'],
  [/mlx/, 'MLX'],
  [/turbo3|turboquant/, 'TurboQuant'],
  [/vulkan/, 'llama.cpp (Vulkan)'],
  [/rocm/, 'llama.cpp (ROCm)'],
  [/llamacpp|llama-cpp/, 'llama.cpp'],
]

export const GGUF_QUANT_TOKEN = /(q\d(?:_[k0-9])*|iq\d|ud-q\d|q4km|q4k|iq4|iq1|iq2|iq3|gguf)/

/** Producer tag value → display name (tags use lowercase engine ids). */
const ENGINE_TAG_DISPLAY: Record<string, string> = {
  'llama.cpp': 'llama.cpp',
  llamacpp: 'llama.cpp',
  sglang: 'SGLang',
  vllm: 'vLLM',
  exllamav3: 'ExLlamaV3',
  exl3: 'ExLlamaV3',
  mlx: 'MLX',
  ollama: 'Ollama',
  lemonade: 'Lemonade',
  trtllm: 'TensorRT-LLM',
}

/** Producer draft tag value → display name. */
const DRAFT_TAG_DISPLAY: Record<string, string> = {
  mtp: 'MTP',
  'mtp-embedded': 'MTP-embedded',
  'mtp-embedded-n2': 'MTP-embedded',
  dspark: 'DSpark',
  dflash: 'DFlash',
  dflash2: 'DFlash2',
}

/**
 * Parse experiment axes out of a cell slug. IMPORTANT: pass the slug CORE
 * (the part before the embedded weight alias — see `slugCoreOfCell`), not the
 * full cell name: alias strings like `...-MTP-NVFP4` contain axis-looking
 * tokens that describe the CHECKPOINT, not this run's serving condition.
 */
export function axesFromCellSlug(slug: string | null | undefined): VariantAxes {
  const s = (slug ?? '').toLowerCase()
  let engine: string | null = null
  let engineInferred = false
  for (const [re, name] of ENGINE_TOKENS) {
    if (re.test(s)) {
      engine = name
      break
    }
  }
  if (!engine && GGUF_QUANT_TOKEN.test(s)) {
    // GGUF quants in this corpus are served by the llama.cpp family; flagged as inferred.
    engine = 'llama.cpp'
    engineInferred = true
  }

  // Explicit "no speculative decoding" beats any drafter token; most-specific
  // drafter names first so dflash2img is not read as dflash.
  let spec: string | null = null
  if (/nospec/.test(s)) spec = 'none'
  else if (/dspark-?miaai|miaai-?dspark/.test(s)) spec = 'DSpark-miaai'
  else if (/dspark/.test(s)) spec = 'DSpark'
  else if (/dflash2img/.test(s)) spec = 'DFlash2img'
  else if (/dflash2/.test(s)) spec = 'DFlash2'
  else if (/dflash/.test(s)) spec = 'DFlash'
  else if (/(^|-)mtp(-|$)/.test(s)) spec = 'MTP'

  const tpMatch = s.match(/(^|-)tp(\d+)(-|$)/)
  const tp = tpMatch ? Number(tpMatch[2]) : null

  const ctxMatch = s.match(/(^|-)(\d+)k(-|$)/)
  const ctxK = ctxMatch ? Number(ctxMatch[2]) : null

  let thinking: 'on' | 'off' | null = null
  if (/think(ing)?-?on/.test(s)) thinking = 'on'
  else if (/think(ing)?-?off/.test(s)) thinking = 'off'

  const tempZero = /(^|-)t0(-|$)/.test(s)
  return { engine, engineInferred, spec, tp, ctxK, thinking, tempZero }
}

// ---------------------------------------------------------------------------
// Slug core
// ---------------------------------------------------------------------------

export function normalizedAlias(alias: string): string {
  return alias.endsWith('.gguf') ? alias.slice(0, -5) : alias
}

/**
 * The run-condition part of the cell name: everything BEFORE the embedded
 * weight alias. Axis parsing must run on this core only — alias strings like
 * `sakamakismile-...-MTP-NVFP4` carry checkpoint descriptors (MTP head,
 * NVFP4) that are not this run's serving condition.
 */
export function slugCoreOfCell(
  cell: Pick<SweCell, 'cell'>,
  registryModel: RegistryModel | null,
): string {
  const s = (cell.cell ?? '').toLowerCase()
  if (!registryModel) return s
  const needle = normalizedAlias(registryModel.alias).toLowerCase()
  // LAST occurrence: run-condition slugs often start with the model name
  // (results-qwen3.8-27b-nvfp4-sglang-…-Qwen3.8-27B-NVFP4-hash), so the first
  // occurrence can sit inside the condition part and would eat the axes.
  const idx = s.lastIndexOf(needle)
  return idx > 0 ? s.slice(0, idx) : s
}

// ---------------------------------------------------------------------------
// Unified axes: tags first, slug fallback, registry inference last
// ---------------------------------------------------------------------------

/** Tag accessor treating 'n/a' / '' as absent. */
function tagOf(tags: Record<string, string> | undefined, key: string): string | null {
  const v = tags?.[key]
  return v && v !== 'n/a' && v !== 'none' ? v : v === 'none' ? 'none' : null
}

export function cellAxesOf(
  cell: Pick<SweCell, 'cell' | 'tags'>,
  registryModel: RegistryModel | null,
): CellAxes {
  const slug = axesFromCellSlug(slugCoreOfCell(cell, registryModel))
  const tags = cell.tags
  // The loader synthesizes a lone {placement} for feeds without tags; a real
  // producer tag block always carries the engine key.
  const fromTags = !!tags && 'engine' in tags

  const engineTag = fromTags ? tagOf(tags, 'engine') : null
  const draftTag = fromTags ? tagOf(tags, 'draft') : null
  const thinkingTag = fromTags ? tagOf(tags, 'thinking') : null
  const tempTag = fromTags ? tagOf(tags, 'temp') : null
  const variantTag = fromTags ? tagOf(tags, 'variant') : null
  const quantTag = fromTags ? tagOf(tags, 'quant') : null

  let engine = engineTag ? (ENGINE_TAG_DISPLAY[engineTag] ?? engineTag) : null
  let engineInferred = false
  if (!engine) {
    engine = slug.engine
    engineInferred = slug.engineInferred
  }
  if (!engine && registryModel && (
    registryModel.alias.toLowerCase().endsWith('.gguf') ||
    GGUF_QUANT_TOKEN.test((registryModel.quant ?? '').toLowerCase())
  )) {
    engine = 'llama.cpp'
    engineInferred = true
  }

  let spec: string | null
  if (draftTag != null) {
    spec = draftTag === 'none' ? 'none' : (DRAFT_TAG_DISPLAY[draftTag] ?? draftTag)
    // The slug can carry a drafter detail the coarse tag loses (dspark-miaai).
    if (spec === 'DSpark' && slug.spec === 'DSpark-miaai') spec = 'DSpark-miaai'
  } else {
    spec = slug.spec
  }
  // The producer records the miaai drafter as variant=miaai-flags on some cells.
  if (variantTag === 'miaai-flags' && spec === 'DSpark') spec = 'DSpark-miaai'

  let tp: number | null = slug.tp
  let variant: string | null = null
  if (variantTag) {
    const m = variantTag.match(/^tp(\d+)$/)
    if (m) tp = Number(m[1])
    else if (variantTag !== 'miaai-flags') variant = variantTag
  }

  const temp = tempTag ?? (slug.tempZero ? '0' : null)

  return {
    engine,
    engineInferred,
    spec,
    tp,
    ctxK: slug.ctxK,
    thinking: thinkingTag ?? slug.thinking,
    tempZero: temp != null ? Number(temp) === 0 : slug.tempZero,
    temp,
    variant,
    effort: fromTags ? tagOf(tags, 'effort') : null,
    lineage: fromTags ? tagOf(tags, 'lineage') : null,
    quantTag,
    fromTags,
  }
}
