/**
 * Matched pairs — the controlled-experiment layer.
 *
 * Two receipts of the same canonical model form a controlled comparison when
 * they agree on EVERY experiment axis except exactly one. Each such pair is a
 * real single-variable experiment already sitting in the corpus: TP1 vs TP2,
 * drafter A vs drafter B, the same quant from two publishers, temp 0 vs 1.0,
 * thinking on vs off, trimfloor on vs off…
 *
 * Axis values come from `cellAxesOf` (producer tags first, slug fallback).
 *
 * Guardrails (per the read-eval-board rule "a shared label is not a shared
 * condition"):
 *  - both cells must be on the same exam denominator (equal n_graded ≥ 30);
 *  - UNRECOGNIZED slug tokens must match too (the residual): a run with an
 *    extra unexplained condition token never silently pairs with one without;
 *  - experiment legs (ab-leg / control / probe) ARE eligible — controlled
 *    pairs are exactly what those legs were run for — but each side carries
 *    its role on the card. Pairing never feeds the leaderboard.
 */

import { slugCoreOfCell, type VariantReceipt } from './receipts.ts'

export type PairAxis =
  | 'engine'
  | 'quant'
  | 'publisher'
  | 'drafter'
  | 'tp'
  | 'thinking'
  | 'temp'
  | 'variant'
  | 'effort'
  | 'ctx'
  | 'machine'

export const PAIR_AXES: PairAxis[] = [
  'quant', 'engine', 'publisher', 'drafter', 'tp',
  'thinking', 'temp', 'variant', 'effort', 'ctx', 'machine',
]

/**
 * '∅' means UNSTATED, not a condition value. Only axes with a defensible
 * default may use one: no drafter, tp=1 and no variant are what a plain
 * serve means. Every other axis refuses to pair against an unknown.
 */
const UNSTATED = '∅'

interface Signature {
  axes: Record<PairAxis, string>
  /** Unrecognized condition tokens — must be identical for a pair to form. */
  residual: string
  n: number
}

// Tokens that describe scaffolding/identity rather than a run condition.
// Lineage words are checkpoint identity (already pinned by the canonical
// model + registry join), not a serving condition — and the producer's
// lineage tag is not reliable enough to explain them away (the same weights
// appear tagged base on one cell and abliterated on its sibling).
const NOISE_TOKEN = new RegExp(
  '^(results|local|remote|bake|off|on|vendor|prequal|control|candidate|probe|ab|leg' +
  '|ablit|abliterated|uncensored|heretic' +
  '|thinking|think|thinkon|thinkoff|nospec|t0' +
  '|dspark|dflash|dflash2|dflash2img|mtp|miaai' +
  '|sglang|vllm|trtllm|tensorrt|exl3|exllama|lemonade|ollama|mlx|vulkan|rocm|llamacpp|turbo3|turboquant' +
  '|gguf|gentoo|cuda|itx|blackwell|aimax395|z13|spark|mac' +
  ')$',
)
const QUANT_TOKEN = /^(q\d[a-z0-9_]*|iq\d[a-z0-9_]*|udq\d[a-z0-9_]*|ud|nvfp4|mxfp4|bf16|fp8|fp16|moq\d|xs|xl|k|m|km)$/
const HEXISH = /^[0-9a-f]{6,}$/
const STARTS_DIGIT = /^\d/

function residualTokens(receipt: VariantReceipt, slugCore: string): string {
  const known = new Set(
    `${receipt.cell.model ?? ''} ${receipt.cell.identity?.canonical_model ?? ''} ${receipt.registry?.alias ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
  // Tokens explained by producer tag values don't count as "unrecognized":
  // e.g. slug token 'trimfloor' is covered by the variant tag 'trimfloor045'.
  const tagTokens: string[] = []
  for (const v of Object.values(receipt.cell.tags ?? {})) {
    for (const t of String(v).toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 3) tagTokens.push(t)
    }
  }
  const explainedByTags = (t: string): boolean =>
    tagTokens.some((tag) => tag.startsWith(t) || t.startsWith(tag))

  const out: string[] = []
  for (const t of slugCore.split(/[^a-z0-9]+/)) {
    if (!t || known.has(t)) continue
    if (NOISE_TOKEN.test(t) || QUANT_TOKEN.test(t) || HEXISH.test(t)) continue
    if (STARTS_DIGIT.test(t) && !/^\d+k$/.test(t)) continue
    if (/^tp\d+$/.test(t) || /^\d+k$/.test(t)) continue
    if (t.length >= 3 && explainedByTags(t)) continue
    out.push(t)
  }
  return out.sort().join('·')
}

export function signatureOf(receipt: VariantReceipt, slugCore: string): Signature {
  const a = receipt.axes
  return {
    axes: {
      engine: a.engine ?? UNSTATED,
      quant: a.quantTag ?? receipt.registry?.quant ?? UNSTATED,
      publisher: receipt.publisher ?? UNSTATED,
      // Unstated ≡ no drafter: the default serve has no speculative decoding.
      drafter: a.spec ?? 'none',
      // Unstated ≡ tp1: single-device serving is the default.
      tp: String(a.tp ?? 1),
      thinking: a.thinking ?? UNSTATED,
      temp: a.temp ?? UNSTATED,
      // Unstated ≡ no special variant flags.
      variant: a.variant ?? '',
      effort: a.effort ?? UNSTATED,
      ctx: a.ctxK != null ? `${a.ctxK}k` : UNSTATED,
      machine: (receipt.cell.machine ?? UNSTATED).toLowerCase(),
    },
    residual: residualTokens(receipt, slugCore),
    n: receipt.cell.n_graded ?? 0,
  }
}

export interface MatchedPair {
  axis: PairAxis
  /** Better-scoring side first. */
  a: VariantReceipt
  b: VariantReceipt
  aValue: string
  bValue: string
  /** a.n_passed - b.n_passed (same denominator by construction). */
  deltaPassed: number
  /** Wilson CIs overlap → the gap is within exam noise. Null when a CI is missing. */
  withinNoise: boolean | null
  /** a.agentic_tok_s / b.agentic_tok_s when both known. */
  speedRatio: number | null
}

function eligible(r: VariantReceipt): boolean {
  return r.cell.comparable === true && (r.cell.n_graded ?? 0) >= 30
}

function ciOverlap(a: VariantReceipt, b: VariantReceipt): boolean | null {
  const ca = a.cell.headline_ci
  const cb = b.cell.headline_ci
  if (!ca || !cb) return null
  return Math.max(ca[0], cb[0]) <= Math.min(ca[1], cb[1])
}

const DISPLAY_VALUE: Record<PairAxis, (v: string) => string> = {
  engine: (v) => v,
  quant: (v) => v,
  publisher: (v) => v,
  drafter: (v) => v,
  tp: (v) => `TP${v}`,
  thinking: (v) => `thinking ${v}`,
  temp: (v) => `temp ${v}`,
  variant: (v) => (v === '' ? 'standard' : v),
  effort: (v) => `effort ${v}`,
  ctx: (v) => `ctx ${v}`,
  machine: (v) => v,
}

/** All single-variable pairs among one model's receipts. */
export function matchedPairsForModel(receipts: VariantReceipt[]): MatchedPair[] {
  const rows = receipts
    .filter(eligible)
    .map((r) => ({ r, sig: signatureOf(r, slugCoreOfCell(r.cell, r.registry)) }))
  const pairs: MatchedPair[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const A = rows[i]
      const B = rows[j]
      if (A.sig.n !== B.sig.n || A.sig.residual !== B.sig.residual) continue
      let differing: PairAxis | null = null
      let tooMany = false
      for (const axis of PAIR_AXES) {
        if (A.sig.axes[axis] !== B.sig.axes[axis]) {
          if (differing) { tooMany = true; break }
          differing = axis
        }
      }
      if (tooMany || !differing) continue
      // Unstated never counts as a condition value (drafter/tp/variant already
      // carry their defaults in the signature, so any '∅' left is unknowable).
      if (A.sig.axes[differing] === UNSTATED || B.sig.axes[differing] === UNSTATED) continue
      const [hi, lo] =
        (A.r.cell.n_passed ?? 0) >= (B.r.cell.n_passed ?? 0) ? [A, B] : [B, A]
      const sa = hi.r.cell.agentic_tok_s
      const sb = lo.r.cell.agentic_tok_s
      const fmt = DISPLAY_VALUE[differing]
      pairs.push({
        axis: differing,
        a: hi.r,
        b: lo.r,
        aValue: fmt(hi.sig.axes[differing]),
        bValue: fmt(lo.sig.axes[differing]),
        deltaPassed: (hi.r.cell.n_passed ?? 0) - (lo.r.cell.n_passed ?? 0),
        withinNoise: ciOverlap(hi.r, lo.r),
        speedRatio: sa != null && sb != null && sb > 0 ? sa / sb : null,
      })
    }
  }
  return pairs
}

export const AXIS_LABELS: Record<PairAxis, { en: string; zh: string }> = {
  quant: { zh: '量化精度', en: 'Quantization' },
  engine: { zh: '推論引擎', en: 'Engine' },
  publisher: { zh: '同量化不同出品者', en: 'Same quant, different publisher' },
  drafter: { zh: '推測解碼 drafter', en: 'Spec-decode drafter' },
  tp: { zh: 'Tensor Parallel (TP)', en: 'Tensor parallel (TP)' },
  thinking: { zh: 'Thinking 開關', en: 'Thinking on/off' },
  temp: { zh: '取樣溫度', en: 'Sampling temperature' },
  variant: { zh: '特殊旗標 (variant)', en: 'Variant flags' },
  effort: { zh: 'Reasoning effort', en: 'Reasoning effort' },
  ctx: { zh: 'Context 上限', en: 'Context budget' },
  machine: { zh: '同配置不同機器', en: 'Same config, different machine' },
}
