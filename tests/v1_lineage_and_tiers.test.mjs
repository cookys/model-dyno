// v1 derived-data layer tests.
//
// These tests exercise the DERIVATION logic (registry join, mod typology,
// slug axes, quant grouping, tier bucketing, domain aggregation) against
// fixtures shaped exactly like the real public bundle snapshot sections.
// The previous version of this file asserted hand-written constants against
// themselves (circular); those constants are gone.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  modTypeOfAlias,
  publisherOfRepo,
  getModTypeBadge,
  axesFromCellSlug,
  registryModelForCell,
  variantReceiptsForModel,
  quantGroupsForModel,
  engineGroupsForModel,
  tiedWithBest,
  lineageEntriesForModel,
  launchRecipesForModel,
} from '../src/lib/receipts.ts'
import {
  HARDWARE_TIERS,
  tierOfMachine,
  machinesForTier,
  tierSpeedSummary,
} from '../src/lib/hardwareTiers.ts'
import { domainScoresForModel } from '../src/lib/domainBreakdown.ts'

// --- Fixtures shaped like the real snapshot sections -----------------------

const REGISTRY = [
  {
    alias: 'Qwen3.8-27B-Q4_K_M',
    family: 'qwen3.8', hf_repo: 'ggml-org/Qwen3.8-27B-GGUF', license: 'apache-2.0',
    quant: 'Q4_K_M', weights_gb: 17.7, params_total_b: 27, params_active_b: 27, context_max: 262144,
  },
  {
    alias: 'Qwen3.8-27B-NVFP4',
    family: 'qwen3.8', hf_repo: 'RadixArk/Qwen3.8-27B-NVFP4', license: 'apache-2.0',
    quant: 'NVFP4', weights_gb: 20.4, params_total_b: 27, params_active_b: 27, context_max: 262144,
  },
  {
    alias: 'Huihui-Qwen3.8-27B-abliterated-Q4_K.gguf',
    family: 'qwen3.8', hf_repo: 'huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF', license: 'apache-2.0',
    quant: 'Q4_K', weights_gb: 16.81, params_total_b: 27, params_active_b: 27, context_max: 262144,
  },
  {
    alias: 'Qwen3.8-27B-DSpark',
    family: 'qwen3.8', hf_repo: 'RadixArk/Qwen3.8-27B-DSpark', license: 'apache-2.0',
    quant: 'BF16', weights_gb: 2.7, params_total_b: 1.36, params_active_b: 1.36, context_max: 262144,
  },
]

const cell = (over) => ({
  model: 'qwen3.8-27b',
  identity: { access: 'local', canonical_model: 'qwen3.8-27b' },
  comparable: true,
  n_graded: 34,
  n_passed: 25,
  headline: 25 / 34,
  headline_ci: [0.57, 0.85],
  machine: 'cookys-cuda',
  scored_at: '2026-08-26T08:29:21+00:00',
  ...over,
})

const CELLS = [
  cell({
    cell: 'results-qwen3.8-27b-q4km-local-Qwen3.8-27B-Q4_K_M-9d2df85f1ff8',
    n_passed: 25, headline: 25 / 34, headline_ci: [0.57, 0.85],
  }),
  cell({
    cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-local-Qwen3.8-27B-NVFP4-1b4263bf',
    n_passed: 29, headline: 29 / 34, headline_ci: [0.69, 0.93],
    run_role: 'vendor-settings',
  }),
  cell({
    cell: 'results-qwen3.8-27b-q4km-dspark-local-Qwen3.8-27B-Q4_K_M-59e0bfc7',
    n_passed: 22, headline: 22 / 34, comparable: false, run_role: 'ab-leg',
  }),
  cell({
    model: 'opus-4.8',
    identity: { access: 'remote', canonical_model: 'opus-4.8' },
    cell: 'anthropic-opus-4.8-bc4c11beda51',
    n_passed: 30, headline: 30 / 34,
  }),
]

// --- Mod typology -----------------------------------------------------------

test('mod typology is derived from checkpoint naming, not curated', () => {
  assert.equal(modTypeOfAlias('Huihui-Qwen3.8-27B-abliterated-Q4_K.gguf', 'huihui-ai/x'), 'abliterated')
  assert.equal(modTypeOfAlias('Qwen3.8-27B-Uncensored-IQ4_XS', 'JonathanColetti/x'), 'abliterated')
  assert.equal(modTypeOfAlias('Qwen3.8-27B-DSpark', 'RadixArk/x'), 'draft')
  assert.equal(modTypeOfAlias('sakamakismile-Qwen3.8-27B-MTP-NVFP4', null), 'mtp')
  assert.equal(modTypeOfAlias('Qwen3.8-27B-Q4_K_M', 'ggml-org/x'), 'official')
  assert.equal(publisherOfRepo('unsloth/Qwen3.8-27B-GGUF'), 'unsloth')
  assert.equal(publisherOfRepo(null), null)

  for (const mt of ['official', 'abliterated', 'draft', 'mtp']) {
    const badge = getModTypeBadge(mt, 'zh')
    assert.ok(badge.label.length > 0)
    assert.ok(badge.colorClass.includes('border'))
  }
})

// --- Slug axes ---------------------------------------------------------------

test('cell slug axes: engine token, spec leg, thinking, temp', () => {
  const sglang = axesFromCellSlug('qwen3.8-27b-nvfp4-sglang-thinkon-t0-local')
  assert.equal(sglang.engine, 'SGLang')
  assert.equal(sglang.engineInferred, false)
  assert.equal(sglang.thinking, 'on')
  assert.equal(sglang.tempZero, true)

  const gguf = axesFromCellSlug('qwen3.8-27b-q4km-dspark-local')
  assert.equal(gguf.engine, 'llama.cpp') // inferred from GGUF quant token
  assert.equal(gguf.engineInferred, true)
  assert.equal(gguf.spec, 'DSpark')

  const cloud = axesFromCellSlug('anthropic-opus-4.8-bc4c11beda51')
  assert.equal(cloud.engine, null)
  assert.equal(cloud.spec, null)
})

// --- Registry join ------------------------------------------------------------

test('registry join picks longest embedded alias; cloud cells return null', () => {
  const joined = registryModelForCell(
    { cell: 'results-qwen3.8-27b-q4km-local-Qwen3.8-27B-Q4_K_M-9d2df85f1ff8', profile: '' },
    REGISTRY,
  )
  assert.equal(joined?.alias, 'Qwen3.8-27B-Q4_K_M')

  // .gguf-suffixed aliases match after normalization
  const huihui = registryModelForCell(
    { cell: 'results-bake-off-huihui-Huihui-Qwen3.8-27B-abliterated-Q4_K-abc123', profile: '' },
    REGISTRY,
  )
  assert.equal(huihui?.alias, 'Huihui-Qwen3.8-27B-abliterated-Q4_K.gguf')

  const cloud = registryModelForCell({ cell: 'anthropic-opus-4.8-bc4c11beda51', profile: '' }, REGISTRY)
  assert.equal(cloud, null)
})

// --- Variant receipts & rankability --------------------------------------------

test('variant receipts: A/B legs are visible but never rankable', () => {
  const receipts = variantReceiptsForModel('qwen3.8-27b', CELLS, REGISTRY)
  assert.equal(receipts.length, 3) // opus cell belongs to another canonical model

  const abLeg = receipts.find((r) => r.cell.run_role === 'ab-leg')
  assert.ok(abLeg)
  assert.equal(abLeg.rankable, false)

  const vendor = receipts.find((r) => r.cell.run_role === 'vendor-settings')
  assert.ok(vendor)
  assert.equal(vendor.rankable, true)
  assert.equal(vendor.registry?.quant, 'NVFP4')
})

// --- Quant / engine groupings ----------------------------------------------------

test('quant groups derive from registry join and judge ties by CI overlap', () => {
  const receipts = variantReceiptsForModel('qwen3.8-27b', CELLS, REGISTRY)
    .filter((r) => r.rankable)
  const groups = quantGroupsForModel(receipts)
  assert.deepEqual(groups.map((g) => g.key), ['NVFP4', 'Q4_K_M']) // sorted best-first
  // CI [0.57,0.85] vs best low bound 0.69 → overlap → statistically tied
  assert.equal(tiedWithBest(groups[1], groups[0]), true)

  const engines = engineGroupsForModel(receipts)
  assert.deepEqual(engines.map((g) => g.key).sort(), ['SGLang', 'llama.cpp'])
})

// --- Lineage entries ---------------------------------------------------------------

test('lineage lists the whole registry family, marking unbenched checkpoints', () => {
  const entries = lineageEntriesForModel('qwen3.8-27b', CELLS, REGISTRY)
  assert.equal(entries.length, REGISTRY.length) // whole qwen3.8 family
  const drafter = entries.find((e) => e.registry.alias === 'Qwen3.8-27B-DSpark')
  assert.equal(drafter.modType, 'draft')
  assert.equal(drafter.benched, false) // registry presence ≠ a score
  const q4km = entries.find((e) => e.registry.alias === 'Qwen3.8-27B-Q4_K_M')
  assert.equal(q4km.benched, true)
})

// --- Launch recipes -----------------------------------------------------------------

test('launch recipes come from real run_configs and emit launch.py commands', () => {
  const receipts = variantReceiptsForModel('qwen3.8-27b', CELLS, REGISTRY)
  const configs = [
    {
      config: 'qwen3.8-27b', model: 'Qwen3.8-27B-Q4_K_M', model_key: 'qwen3.8-27b',
      engine: 'llamacpp-mainline', tier: 'medium', ctx_size: 131072, n_gpu_layers: 99,
      split_mode: null, jinja: true, methods: ['kv-quant/q8_0'],
      sampler_temp: 0, sampler_top_p: 0.95, sampler_top_k: 20, sampler_min_p: 0,
    },
    {
      config: 'unrelated-model', model: 'Other-Model', model_key: 'other-model',
      engine: null, tier: 'small', ctx_size: null, n_gpu_layers: null,
      split_mode: null, jinja: null, methods: [],
      sampler_temp: null, sampler_top_p: null, sampler_top_k: null, sampler_min_p: null,
    },
  ]
  const recipes = launchRecipesForModel('qwen3.8-27b', receipts, configs)
  assert.equal(recipes.length, 1)
  assert.equal(recipes[0].command, 'python scripts/launch.py qwen3.8-27b')
})

// --- Hardware tiers ------------------------------------------------------------------

const MACHINES = [
  { profile: 'cookys-gentoo', aliases: [], gpu_name: 'RTX 4090', gpu_vendor: 'nvidia', gpu_count: 1, memory_kind: 'discrete', vram_pool_gb: 24, vram_total_gb: 24, vram_per_gpu_gb: 24, vram_practical_gb: 23, vram_usable_gb: 23, alloc_cap_gb: null },
  { profile: 'cookys-cuda', aliases: ['cookys-cuda-linux'], gpu_name: 'RTX PRO 6000 x2', gpu_vendor: 'nvidia', gpu_count: 2, memory_kind: 'discrete', vram_pool_gb: 192, vram_total_gb: 192, vram_per_gpu_gb: 96, vram_practical_gb: 180, vram_usable_gb: 180, alloc_cap_gb: null },
  { profile: 'MacBook-Pro.M5Pro.24GB', aliases: [], gpu_name: 'Apple M5 Pro GPU', gpu_vendor: 'apple', gpu_count: 1, memory_kind: 'unified', vram_pool_gb: 24, vram_total_gb: null, vram_per_gpu_gb: null, vram_practical_gb: 18, vram_usable_gb: 18, alloc_cap_gb: null },
  { profile: 'no-vram-info', aliases: [], gpu_name: null, gpu_vendor: null, gpu_count: null, memory_kind: null, vram_pool_gb: null, vram_total_gb: null, vram_per_gpu_gb: null, vram_practical_gb: null, vram_usable_gb: null, alloc_cap_gb: null },
]

test('hardware tiers: membership derived from real machine VRAM, numbers from records', () => {
  const t24 = HARDWARE_TIERS.find((t) => t.id === 'tier-24-32')
  const members = machinesForTier(t24, MACHINES)
  assert.deepEqual(members.map((m) => m.profile).sort(), ['MacBook-Pro.M5Pro.24GB', 'cookys-gentoo'])

  const big = tierOfMachine(MACHINES[1])
  assert.equal(big.id, 'tier-gt64')

  assert.equal(tierOfMachine(MACHINES[3]), null) // unknown VRAM → no invented bucket

  const records = [
    { profile: 'cookys-gentoo', tg128_tps: 50.0, pp512_tps: 2000 },
    { profile: 'cookys-gentoo', tg128_tps: 60.0, pp512_tps: 2100 },
    { profile: 'MacBook-Pro.M5Pro.24GB', tg128_tps: 40.0, pp512_tps: 600 },
    { profile: 'cookys-cuda', tg128_tps: 90.0, pp512_tps: 9000 }, // other tier — excluded
  ]
  const summary = tierSpeedSummary(t24, MACHINES, records)
  assert.equal(summary.nRecords, 3)
  assert.equal(summary.medianTg, 50.0)
  assert.equal(summary.maxTg, 60.0)
})

// --- Advisor (pick-for-me flow) -----------------------------------------------------------

test('advisor: score travels with the weights, speed stays with the machine', async () => {
  const { localPicksForBudget, weightsFitBudget, cloudAnchor, plainVerdict, anchorRatio, ratioPhrase, machineForCell } =
    await import('../src/lib/advisor.ts')

  const cloudCell = CELLS[3] // opus-4.8 30/34 remote

  // Fit rule: weights must leave KV/context headroom (15%).
  assert.equal(weightsFitBudget(17.7, 32), true) // 17.7 ≤ 27.2
  assert.equal(weightsFitBudget(17.7, 16), false) // 17.7 > 13.6
  assert.equal(weightsFitBudget(null, 32), false) // unknown weights never fit a finite budget
  assert.equal(weightsFitBudget(500, Infinity), true)

  // 16GB: all fixture checkpoints exceed 13.6GB usable and every run was on the
  // 192GB box → the advisor still refuses to recommend anything.
  assert.equal(localPicksForBudget(16, CELLS, MACHINES, REGISTRY).length, 0)

  // 32GB: the runs happened on the 192GB box, but the checkpoints FIT — the
  // score is hardware-independent, so they now qualify via the weights track.
  const picks32 = localPicksForBudget(32, CELLS, MACHINES, REGISTRY)
  assert.equal(picks32.length, 1) // folded per canonical
  assert.equal(picks32[0].canonical, 'qwen3.8-27b')
  assert.equal(picks32[0].cell.n_passed, 29) // NVFP4 vendor cell wins the fold
  assert.equal(picks32[0].fitBasis, 'weights') // speed number does NOT transfer
  assert.equal(picks32[0].weightsGb, 20.4)
  assert.equal(picks32[0].measuredOnGb, 192)

  const picksBig = localPicksForBudget(Infinity, CELLS, MACHINES, REGISTRY)
  assert.ok(picksBig.length >= 1)
  // folded to one pick per canonical model; NVFP4 vendor cell (29/34) wins
  assert.equal(picksBig[0].canonical, 'qwen3.8-27b')
  assert.equal(picksBig[0].cell.n_passed, 29)
  assert.equal(picksBig[0].measuredOnGb, 192)
  assert.equal(picksBig[0].fitBasis, 'measured') // unlimited budget: the run itself fits

  // ab-legs (comparable=false) never become recommendations
  assert.ok(picksBig.every((p) => p.cell.comparable === true))

  const anchor = cloudAnchor(CELLS)
  assert.equal(anchor, cloudCell)

  const ratio = anchorRatio(picksBig[0].cell, anchor)
  assert.ok(Math.abs(ratio - (29 / 34) / (30 / 34)) < 1e-9)
  assert.equal(ratioPhrase(0.85, 'zh'), '8.5 成')
  assert.equal(ratioPhrase(0.85, 'en'), '85%')

  const verdict = plainVerdict(picksBig[0], anchor, 'zh')
  assert.ok(verdict.includes('29'))
  assert.ok(verdict.includes('opus-4.8'))

  // machine join is alias-aware
  const m = machineForCell({ machine: 'cookys-cuda-linux', profile: '' }, MACHINES)
  assert.equal(m?.profile, 'cookys-cuda')

  // …and token-aware: eval results stamp short names, fleet profiles carry OS suffixes
  const tokenMachines = [
    { profile: 'cookys-linux-7840hs', aliases: [], gpu_name: 'Radeon 780M', gpu_vendor: 'amd', gpu_count: 1, memory_kind: 'unified', vram_pool_gb: 64, vram_total_gb: null, vram_per_gpu_gb: null, vram_practical_gb: 48, vram_usable_gb: 48, alloc_cap_gb: null },
  ]
  const tm = machineForCell({ machine: 'cookys-7840hs', profile: '' }, tokenMachines)
  assert.equal(tm?.profile, 'cookys-linux-7840hs')
  assert.equal(machineForCell({ machine: '?', profile: '' }, tokenMachines), null)
})

test('rankable rule: candidate counts, experiment scaffolding never does', async () => {
  const { isRankableCell } = await import('../src/lib/receipts.ts')
  assert.equal(isRankableCell({ comparable: true, run_role: 'vendor-settings' }), true)
  assert.equal(isRankableCell({ comparable: true, run_role: 'candidate' }), true)
  assert.equal(isRankableCell({ comparable: true, run_role: undefined }), true)
  for (const role of ['ab-leg', 'probe', 'control', 'prequal']) {
    assert.equal(isRankableCell({ comparable: true, run_role: role }), false, role)
  }
  assert.equal(isRankableCell({ comparable: false, run_role: 'candidate' }), false)
})

test('advisor: budget presets partition the fleet without overlap', async () => {
  const { BUDGET_PRESETS, fleetExamplesForBudget } = await import('../src/lib/advisor.ts')
  const seen = new Set()
  for (const preset of BUDGET_PRESETS) {
    for (const m of fleetExamplesForBudget(preset, MACHINES)) {
      assert.ok(!seen.has(m.profile), `${m.profile} appears in two budget presets`)
      seen.add(m.profile)
    }
  }
  // every machine with known VRAM lands in exactly one preset
  assert.equal(seen.size, MACHINES.filter((m) => m.vram_pool_gb != null || m.vram_total_gb != null || m.vram_per_gpu_gb != null).length)
})

// --- Matched pairs (controlled single-variable experiments) ---------------------------

test('matched pairs: same model, exactly one axis differs', async () => {
  const { matchedPairsForModel } = await import('../src/lib/matchedPairs.ts')
  const { slugCoreOfCell } = await import('../src/lib/receipts.ts')
  const REG2 = [
    ...REGISTRY,
    {
      alias: 'Qwen3.8-27B-Q4_K_M-unsloth',
      family: 'qwen3.8', hf_repo: 'unsloth/Qwen3.8-27B-GGUF', license: 'apache-2.0',
      quant: 'Q4_K_M', weights_gb: 17.7, params_total_b: 27, params_active_b: 27, context_max: 262144,
    },
    {
      alias: 'sakamakismile-Qwen3.8-27B-MTP-NVFP4',
      family: 'qwen3.8', hf_repo: 'sakamakismile/Qwen3.8-27B-MTP-NVFP4', license: 'apache-2.0',
      quant: 'NVFP4', weights_gb: 20.4, params_total_b: 27, params_active_b: 27, context_max: 262144,
    },
  ]
  const cells = [
    // drafter axis on the same NVFP4+SGLang base (experiment legs ARE eligible here)
    cell({ cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-nospec-local-Qwen3.8-27B-NVFP4-aaa1', n_passed: 27, run_role: 'control' }),
    cell({ cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-dspark-local-Qwen3.8-27B-NVFP4-aaa2', n_passed: 23, run_role: 'ab-leg' }),
    cell({ cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-dflash2-local-Qwen3.8-27B-NVFP4-aaa3', n_passed: 23, run_role: 'ab-leg', agentic_tok_s: 40 }),
    // TP axis: identical to the previous cell except -tp2-
    cell({ cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-dflash2-tp2-local-Qwen3.8-27B-NVFP4-aaa4', n_passed: 23, run_role: 'ab-leg', agentic_tok_s: 60 }),
    // publisher axis: same Q4_K_M quant, ggml-org vs unsloth
    cell({ cell: 'results-qwen3.8-27b-q4km-local-Qwen3.8-27B-Q4_K_M-bbb1', n_passed: 25 }),
    cell({ cell: 'results-qwen3.8-27b-q4km-unsloth-local-Qwen3.8-27B-Q4_K_M-unsloth-bbb2', n_passed: 22 }),
    // thinking stated on ONE side only (∅ vs on) — must NOT pair
    cell({ cell: 'results-qwen3.8-27b-q4km-thinkon-local-Qwen3.8-27B-Q4_K_M-bbb3', n_passed: 24 }),
    // different denominator — must NOT pair with anything
    cell({ cell: 'results-qwen3.8-27b-q4km-unsloth-local-Qwen3.8-27B-Q4_K_M-unsloth-bbb9', n_passed: 30, n_graded: 50, headline: 0.6 }),
    // alias contains MTP/NVFP4 tokens but the RUN is explicitly nospec
    cell({ cell: 'results-qwen3.8-27b-nvfp4-sksmile-vendor-nospec-local-sakamakismile-Qwen3.8-27B-MTP-NVFP4-ccc1', n_passed: 21 }),
  ]
  const rs = variantReceiptsForModel('qwen3.8-27b', cells, REG2)

  // slug-core fix: axis tokens in the ALIAS never leak into the run condition
  const sksmile = rs.find((r) => r.cell.cell.includes('sksmile'))
  assert.equal(sksmile.axes.spec, 'none') // NOT 'MTP' despite -MTP- in the alias
  // …and the alias-prefix collision is cut at the LAST occurrence
  const dspark = rs.find((r) => r.cell.cell.includes('-dspark-'))
  assert.equal(dspark.axes.engine, 'SGLang')
  assert.equal(dspark.axes.spec, 'DSpark')
  assert.ok(slugCoreOfCell(dspark.cell, dspark.registry).includes('sglang'))

  const pairs = matchedPairsForModel(rs)

  const drafter = pairs.filter((p) => p.axis === 'drafter')
  assert.equal(drafter.length, 3) // none↔DSpark, none↔DFlash2, DSpark↔DFlash2

  const tp = pairs.filter((p) => p.axis === 'tp')
  assert.equal(tp.length, 1)
  assert.deepEqual([tp[0].aValue, tp[0].bValue].sort(), ['TP1', 'TP2'])
  assert.equal(tp[0].withinNoise, true)
  assert.ok(Math.abs(tp[0].speedRatio - 40 / 60) < 1e-9)

  const publisher = pairs.filter((p) => p.axis === 'publisher')
  assert.equal(publisher.length, 1)
  assert.equal(publisher[0].aValue, 'ggml-org') // higher-scoring side first
  assert.equal(publisher[0].deltaPassed, 3)

  // ∅ (unstated) is never treated as a condition value
  assert.equal(pairs.filter((p) => p.axis === 'thinking').length, 0)
  // different n_graded never pairs
  assert.ok(pairs.every((p) => p.a.cell.n_graded === p.b.cell.n_graded))
  assert.equal(pairs.length, 5)
})

test('slug axes: tp / ctx / drafter-variant tokens parse from the run core', () => {
  const a = axesFromCellSlug('results-qwen38-27b-ablit-edp1096-nvfp4-dflash2-tp2-vendor-local-')
  assert.equal(a.spec, 'DFlash2')
  assert.equal(a.tp, 2)
  const b = axesFromCellSlug('results-qwen3.5-122b-a10b-mtp-udq4xl-64k-local-')
  assert.equal(b.spec, 'MTP')
  assert.equal(b.ctxK, 64)
  const c = axesFromCellSlug('results-qwen3.8-27b-nvfp4-sglang-dspark-miaai-local-')
  assert.equal(c.spec, 'DSpark-miaai')
  const d = axesFromCellSlug('results-qwen3.8-27b-nvfp4-sglang-vendor-nospec-dflash2img-local-')
  assert.equal(d.spec, 'none') // explicit nospec beats any drafter token
})

// --- Cell axes: producer tags are the source of truth, slug is fallback ----------------

test('cellAxesOf: tags win over slug guessing; n/a means absent; slug fills gaps', async () => {
  const { cellAxesOf } = await import('../src/lib/cellAxes.ts')

  // Tags present → engine/draft/thinking/temp come from tags, never the slug.
  const tagged = cellAxesOf(
    {
      cell: 'results-qwen3.8-27b-nvfp4-sglang-vendor-local-Qwen3.8-27B-NVFP4-1b42',
      tags: {
        engine: 'sglang', quant: 'NVFP4', draft: 'none',
        thinking: 'on', temp: '1.0', lineage: 'base', placement: 'local',
      },
    },
    REGISTRY[1],
  )
  assert.equal(tagged.fromTags, true)
  assert.equal(tagged.engine, 'SGLang')
  assert.equal(tagged.engineInferred, false)
  assert.equal(tagged.spec, 'none') // explicit draft:none, not ∅
  assert.equal(tagged.temp, '1.0')
  assert.equal(tagged.tempZero, false)
  assert.equal(tagged.thinking, 'on')
  assert.equal(tagged.quantTag, 'NVFP4')

  // variant carries TP and special flags; temp 0 sets tempZero.
  const tp2 = cellAxesOf(
    {
      cell: 'results-x-tp2-local-Qwen3.8-27B-NVFP4-9f',
      tags: { engine: 'sglang', quant: 'NVFP4', draft: 'dflash2', variant: 'tp2', temp: '0' },
    },
    REGISTRY[1],
  )
  assert.equal(tp2.tp, 2)
  assert.equal(tp2.variant, null) // tp part is not a residual variant flag
  assert.equal(tp2.spec, 'DFlash2')
  assert.equal(tp2.tempZero, true)

  const trim = cellAxesOf(
    {
      cell: 'results-x-trimfloor-local-Qwen3.8-27B-NVFP4-9e',
      tags: { engine: 'sglang', quant: 'NVFP4', draft: 'none', variant: 'trimfloor045' },
    },
    REGISTRY[1],
  )
  assert.equal(trim.variant, 'trimfloor045')

  // No tags → slug fallback still parses, GGUF registry infers llama.cpp.
  const untagged = cellAxesOf(
    { cell: 'results-qwen3.8-27b-q4km-dspark-local-Qwen3.8-27B-Q4_K_M-59e0' },
    REGISTRY[0],
  )
  assert.equal(untagged.fromTags, false)
  assert.equal(untagged.spec, 'DSpark')
  assert.equal(untagged.engine, 'llama.cpp')
  assert.equal(untagged.engineInferred, true)

  // 'n/a' tag values are absent, not conditions.
  const na = cellAxesOf(
    { cell: 'results-y-local-Qwen3.8-27B-NVFP4-11', tags: { engine: 'sglang', thinking: 'n/a', temp: 'n/a', quant: 'n/a' } },
    REGISTRY[1],
  )
  assert.equal(na.thinking, null)
  assert.equal(na.temp, null)
  assert.equal(na.quantTag, null)
})

test('matched pairs from tags: real temp values and variant flags become axes', async () => {
  const { matchedPairsForModel } = await import('../src/lib/matchedPairs.ts')
  const baseTags = {
    engine: 'sglang', quant: 'NVFP4', draft: 'none', thinking: 'on', temp: '1.0', placement: 'local',
  }
  const mk = (name, tags, n_passed, over = {}) =>
    cell({ cell: `results-qwen3.8-27b-nvfp4-sglang-${name}-local-Qwen3.8-27B-NVFP4-h${name}`, tags, n_passed, ...over })
  const cells = [
    mk('vendor', baseTags, 27),
    mk('t0', { ...baseTags, temp: '0' }, 29),
    mk('trimfloor', { ...baseTags, variant: 'trimfloor045' }, 24),
    // Same run condition, lineage tag differs — lineage is NOT an axis (identity,
    // not condition) so this must neither block nor create a pair by itself.
    mk('vendor', { ...baseTags, lineage: 'abliterated' }, 27),
  ]
  const rs = variantReceiptsForModel('qwen3.8-27b', cells, REGISTRY)
  const pairs = matchedPairsForModel(rs)

  const temp = pairs.filter((p) => p.axis === 'temp')
  assert.equal(temp.length, 2) // t0 vs vendor, t0 vs vendor-b
  assert.equal(temp[0].aValue, 'temp 0') // higher score (29) first
  assert.equal(temp[0].bValue, 'temp 1.0')

  const variant = pairs.filter((p) => p.axis === 'variant')
  assert.equal(variant.length, 2) // trimfloor vs vendor, trimfloor vs vendor-b
  assert.deepEqual([variant[0].aValue, variant[0].bValue].sort(), ['standard', 'trimfloor045'])
})

// --- Task matrix: per-task difficulty / domains / flip diff -----------------------------

test('taskMatrix: difficulty spectrum, saturation bands and discrimination', async () => {
  const { taskStats } = await import('../src/lib/taskMatrix.ts')
  const domains = { t1: 'backend', t2: 'cli-tool', t3: 'backend' }
  const strong = cell({ cell: 'a', headline: 0.9, task_verdicts: { t1: 'PASS', t2: 'PASS', t3: 'PASS' } })
  const weak = cell({ cell: 'b', headline: 0.3, task_verdicts: { t1: 'PASS', t2: 'FAIL', t3: 'ERROR' } })
  const stats = taskStats([strong, weak], domains)

  assert.equal(stats.length, 3)
  // sorted hardest first: t3/t2 (1/2) before t1 (2/2)
  assert.equal(stats[2].taskId, 't1')
  assert.equal(stats[2].band, 'all-pass')
  assert.equal(stats[2].discrimination, 0)
  const t2 = stats.find((s) => s.taskId === 't2')
  assert.equal(t2.band, 'discriminating')
  assert.equal(t2.discrimination, 1) // strong solves, weak does not
  assert.equal(t2.domain, 'cli-tool')

  // ineligible cells (partial n, no verdicts, not comparable) never count
  const partial = cell({ cell: 'c', n_graded: 10, task_verdicts: { t1: 'FAIL' } })
  const untracked = cell({ cell: 'd' })
  assert.equal(taskStats([strong, weak, partial, untracked], domains)[0].attempts, 2)
})

test('taskMatrix: per-cell domain scores and the flip diff between two cells', async () => {
  const { domainScoresFromVerdicts, flipDiff } = await import('../src/lib/taskMatrix.ts')
  const domains = { t1: 'backend', t2: 'backend', t3: 'cli-tool', t4: '_unknown' }

  const a = { task_verdicts: { t1: 'PASS', t2: 'PASS', t3: 'FAIL', t4: 'PASS' } }
  const scores = domainScoresFromVerdicts(a, domains)
  assert.deepEqual(scores.map((s) => [s.domainId, s.passed, s.total]), [
    ['backend', 2, 2],
    ['cli-tool', 0, 1],
  ]) // _unknown dropped, sorted by pass rate

  const b = { task_verdicts: { t1: 'PASS', t2: 'FAIL', t3: 'PASS' } }
  const diff = flipDiff(a, b, domains)
  assert.equal(diff.shared, 3) // t4 has no verdict on b
  assert.deepEqual(diff.aOnly.map((f) => f.taskId), ['t2'])
  assert.deepEqual(diff.bOnly.map((f) => f.taskId), ['t3'])
  assert.equal(diff.aOnly[0].domain, 'backend')
  assert.equal(diff.bothPass, 1)
  assert.equal(diff.neitherPass, 0)

  assert.equal(flipDiff(a, {}, domains), null) // missing verdicts → no diff, never invented

  const { failedTasksFromCell } = await import('../src/lib/taskMatrix.ts')
  const failed = failedTasksFromCell(a, domains)
  assert.deepEqual(failed.map((f) => [f.taskId, f.verdict]), [['t3', 'FAIL']])
  assert.equal(failedTasksFromCell({ task_verdicts: {} }, domains).length, 0)
})

test('usageQuadrant: buckets match COMP thresholds', async () => {
  const { classifyUsageBucket, usageQuadrantRows } = await import('../src/lib/usageQuadrant.ts')
  assert.equal(classifyUsageBucket(0.75, 200), 'allround')
  assert.equal(classifyUsageBucket(0.55, 200), 'pair')
  assert.equal(classifyUsageBucket(0.55, 400), 'background')
  assert.equal(classifyUsageBucket(0.3, 100), 'lowacc')
  const rows = usageQuadrantRows([
    cell({ cell: 'x', comparable: true, n_graded: 34, headline: 0.8, med_wall_pass: 180, solved_per_hour: 12 }),
    cell({ cell: 'y', comparable: true, n_graded: 34, headline: 0.4, med_wall_pass: 200 }),
    cell({ cell: 'z', comparable: true, n_graded: 10, headline: 0.9 }), // partial excluded
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].bucket, 'allround')
})

test('benchVsRealSummary: median ratio from joins', async () => {
  const { benchVsRealSummary } = await import('../src/lib/speedFrontier.ts')
  assert.equal(benchVsRealSummary([]), null)
  const summary = benchVsRealSummary([
    { alias: 'a', ratio: 0.2 },
    { alias: 'b', ratio: 0.4 },
    { alias: 'c', ratio: 0.6 },
  ])
  assert.equal(summary.nJoins, 3)
  assert.equal(summary.medianRatio, 0.4)
})

test('channelParity: spread attribution matches CLI thresholds', async () => {
  const { analyzeParity, channelParityForModel, DIVERGENCE_PP } = await import('../src/lib/channelParity.ts')
  const inputs = [
    { canonical_model: 'm1', access: 'direct-api', acc: 0.8, noop_pct: 5, cap_pct: 0, n: 34, cell: 'a', machine: 'x' },
    { canonical_model: 'm1', access: 'openrouter', acc: 0.5, noop_pct: 25, cap_pct: 0, n: 34, cell: 'b', machine: 'x' },
    { canonical_model: 'm2', access: 'local', acc: 0.6, noop_pct: 0, cap_pct: 0, n: 34, cell: 'c', machine: 'y' },
    { canonical_model: 'm2', access: 'cloud', acc: 0.62, noop_pct: 0, cap_pct: 0, n: 34, cell: 'd', machine: 'y' },
  ]
  const rows = analyzeParity(inputs, 20)
  assert.equal(rows.length, 2)
  const m1 = rows.find((r) => r.canonical_model === 'm1')
  assert.ok(m1)
  assert.ok(m1.spread >= DIVERGENCE_PP)
  assert.equal(m1.verdict, 'divergent-tools')
  const cells = [
    cell({ cell: 'a', model: 'm1', identity: { canonical_model: 'm1', access: 'direct-api' }, n_graded: 34, n_passed: 27, headline: 0.8, agency: { noop_pct: 5 } }),
    cell({ cell: 'b', model: 'm1', identity: { canonical_model: 'm1', access: 'openrouter' }, n_graded: 34, n_passed: 17, headline: 0.5, agency: { noop_pct: 25 } }),
  ]
  const one = channelParityForModel(cells, 'm1', 20)
  assert.equal(one?.verdict, 'divergent-tools')
})

// --- Speed anatomy + cloud frontier ------------------------------------------------------

test('benchVsReal: exact checkpoint identity only — publishers never share a bench row', async () => {
  const { benchVsRealRows } = await import('../src/lib/speedFrontier.ts')
  const REG3 = [
    ...REGISTRY,
    {
      alias: 'Qwen3.8-27B-Q4_K_M-unsloth',
      family: 'qwen3.8', hf_repo: 'unsloth/Qwen3.8-27B-GGUF', license: 'apache-2.0',
      quant: 'Q4_K_M', weights_gb: 17.7, params_total_b: 27, params_active_b: 27, context_max: 262144,
    },
  ]
  const records = [
    { model_alias: 'Qwen3.8-27B-Q4_K_M', profile: 'cookys-cuda-linux', engine: 'llamacpp', quant: 'Q4_K_M', tg128_tps: 60, pp512_tps: 2000 },
  ]
  const cells = [
    // two conditions of the SAME weights → one row with an agentic range
    cell({ cell: 'results-a-local-Qwen3.8-27B-Q4_K_M-x1', agentic_tok_s: 30 }),
    cell({ cell: 'results-b-local-Qwen3.8-27B-Q4_K_M-x2', agentic_tok_s: 40, n_passed: 28, headline: 28 / 34 }),
    // unsloth's file must NOT inherit ggml-org's bench number
    cell({ cell: 'results-c-local-Qwen3.8-27B-Q4_K_M-unsloth-x3', agentic_tok_s: 35 }),
    // cloud cells never join
    cell({ identity: { access: 'remote', canonical_model: 'opus-4.8' }, model: 'opus-4.8', cell: 'anthropic-opus-x', agentic_tok_s: 90 }),
  ]
  const rows = benchVsRealRows(cells, records, REG3)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].alias, 'Qwen3.8-27B-Q4_K_M')
  assert.equal(rows[0].nConditions, 2)
  assert.equal(rows[0].agenticMin, 30)
  assert.equal(rows[0].agenticMax, 40)
  assert.ok(Math.abs(rows[0].ratio - 40 / 60) < 1e-9)
  // provenance points at the better (rankable, higher-headline) receipt
  assert.ok(rows[0].bestCell.cell.includes('-b-'))
})

test('frontierComparison: champions, flip diff and fleet-wide solve-share gaps', async () => {
  const { frontierComparison, errorRateByAccess } = await import('../src/lib/speedFrontier.ts')
  const domains = { t1: 'backend', t2: 'data-pipeline', t3: 'cli-tool' }
  const cells = [
    cell({ cell: 'local-a', headline: 2 / 3, n_passed: 2, task_verdicts: { t1: 'PASS', t2: 'FAIL', t3: 'PASS' } }),
    cell({ cell: 'local-b', headline: 1 / 3, n_passed: 1, task_verdicts: { t1: 'PASS', t2: 'ERROR', t3: 'FAIL' } }),
    cell({
      model: 'opus-4.8', identity: { access: 'remote', canonical_model: 'opus-4.8' },
      cell: 'cloud-a', headline: 1, n_passed: 3, task_verdicts: { t1: 'PASS', t2: 'PASS', t3: 'PASS' },
    }),
  ]
  const f = frontierComparison(cells, domains)
  assert.equal(f.bestCloud.model, 'opus-4.8')
  assert.equal(f.bestLocal.cell, 'local-a')
  // cloud champion solves t2 which the local champion fails
  assert.deepEqual(f.flip.aOnly.map((x) => x.taskId), ['t2'])
  assert.equal(f.flip.bOnly.length, 0)
  // t2 has the widest fleet gap: local 0/2 vs cloud 1/1
  assert.equal(f.taskGaps[0].taskId, 't2')
  assert.equal(f.taskGaps[0].localShare, 0)
  assert.equal(f.taskGaps[0].cloudShare, 1)

  // ERROR share counts harness casualties per access route
  const err = errorRateByAccess(cells)
  const local = err.find((e) => e.access === 'local')
  const cloud = err.find((e) => e.access === 'cloud')
  assert.equal(local.nError, 1)
  assert.equal(local.nVerdicts, 6)
  assert.equal(cloud.nError, 0)
})

test('speed boards: per-machine ranking, fastest condition per model, cloud is one board', async () => {
  const { realSpeedBoards, benchBoards, machineExplorerBoards } = await import('../src/lib/speedFrontier.ts')
  const cells = [
    cell({ cell: 'a1', machine: 'cookys-cuda', agentic_tok_s: 50 }),
    cell({ cell: 'a2', machine: 'cookys-cuda', agentic_tok_s: 80, run_role: 'ab-leg' }), // faster experiment leg wins the row, flagged not-rankable
    cell({ cell: 'b1', machine: 'cookys-gentoo', agentic_tok_s: 30 }),
    cell({
      model: 'other-model', identity: { access: 'local', canonical_model: 'other-model' },
      cell: 'c1', machine: 'cookys-cuda', agentic_tok_s: 20,
    }),
    cell({
      model: 'opus-4.8', identity: { access: 'remote', canonical_model: 'opus-4.8' },
      cell: 'd1', machine: undefined, agentic_tok_s: 60,
    }),
    cell({ cell: 'e1', machine: 'cookys-cuda', agentic_tok_s: null }), // no measurement → excluded
  ]
  const boards = realSpeedBoards(cells)
  assert.deepEqual(boards.map((b) => b.machine), ['cookys-cuda', 'cookys-gentoo', 'cloud'])
  const cuda = boards[0]
  assert.equal(cuda.rows.length, 2) // one row per canonical model
  assert.equal(cuda.rows[0].agentic, 80) // fastest condition represents the model
  assert.equal(cuda.rows[0].rankable, false) // …but carries its experiment flag
  assert.equal(cuda.maxAgentic, 80)
  assert.equal(boards[2].isCloud, true)

  const bb = benchBoards([
    { profile: 'm1', model_alias: 'x', tg128_tps: 10, pp512_tps: 100 },
    { profile: 'm1', model_alias: 'y', tg128_tps: 30, pp512_tps: 300 },
    { profile: 'm2', model_alias: 'z', tg128_tps: 20, pp512_tps: 200 },
    { profile: 'm3', model_alias: 'w', tg128_tps: null }, // unmeasured decode → dropped
  ])
  assert.deepEqual(bb.map((b) => b.profile), ['m1', 'm2']) // sorted by top decode
  assert.deepEqual(bb[0].rows.map((r) => r.model_alias), ['y', 'x'])
})

test('machineExplorer: every run visible, grouped by canonical, pairs on same machine', async () => {
  const { machineExplorerBoards } = await import('../src/lib/speedFrontier.ts')
  const REG3 = [
    ...REGISTRY,
    {
      alias: 'Qwen3.8-27B-Q4_K_M', family: 'qwen3.8', hf_repo: 'ggml-org/Qwen3.8-27B-GGUF',
      license: 'apache-2.0', quant: 'Q4_K_M', weights_gb: 17.7, params_total_b: 27,
      params_active_b: 27, context_max: 262144,
    },
  ]
  const records = [
    { model_alias: 'Qwen3.8-27B-Q4_K_M', profile: 'cookys-cuda-linux', engine: 'llamacpp', quant: 'Q4_K_M', tg128_tps: 60, pp512_tps: 2000 },
  ]
  const cells = [
    cell({
      cell: 'results-a-local-Qwen3.8-27B-Q4_K_M-x1', machine: 'cookys-cuda-linux',
      agentic_tok_s: 30, identity: { access: 'local', canonical_model: 'qwen3.8-27b' },
    }),
    cell({
      cell: 'results-b-local-Qwen3.8-27B-Q4_K_M-x2', machine: 'cookys-cuda-linux',
      agentic_tok_s: 40, n_passed: 28, headline: 28 / 34,
      identity: { access: 'local', canonical_model: 'qwen3.8-27b' },
      tags: { engine: 'llamacpp', draft: 'none', thinking: 'off', temp: '0', quant: 'Q4_K_M' },
    }),
    cell({
      cell: 'results-c-local-Qwen3.8-27B-Q4_K_M-x3', machine: 'cookys-cuda-linux',
      agentic_tok_s: 35,
      identity: { access: 'local', canonical_model: 'qwen3.8-27b' },
      tags: { engine: 'llamacpp', draft: 'none', thinking: 'off', temp: '1', quant: 'Q4_K_M' },
    }),
    cell({
      model: 'opus-4.8', identity: { access: 'remote', canonical_model: 'opus-4.8' },
      cell: 'cloud-x', agentic_tok_s: 90,
    }),
  ]
  const boards = machineExplorerBoards(cells, records, REG3)
  const cuda = boards.find((b) => b.machine === 'cookys-cuda-linux')
  assert.ok(cuda)
  assert.equal(cuda.totalRuns, 3)
  assert.equal(cuda.groups.length, 1)
  assert.equal(cuda.groups[0].runs.length, 3)
  assert.ok(cuda.groups[0].runs[0].benchTg128 === 60)
  assert.ok(Math.abs(cuda.groups[0].runs[0].ratio - 40 / 60) < 1e-9)
  const cloud = boards.find((b) => b.isCloud)
  assert.ok(cloud)
  assert.equal(cloud.totalRuns, 1)
  assert.equal(cloud.groups[0].runs[0].benchTg128, null)
})

test('codingHarnessRows: local + cloud in one comparable pool', async () => {
  const { codingHarnessRows, sortHarnessRows } = await import('../src/lib/speedFrontier.ts')
  const cells = [
    cell({
      cell: 'local-fast', machine: 'cookys-cuda', agentic_tok_s: 120, n_passed: 25, headline: 25 / 34,
      solved_per_hour: 2.5, identity: { access: 'local', canonical_model: 'qwen3.8-27b' },
    }),
    cell({
      model: 'opus-4.8', cell: 'cloud-slow', agentic_tok_s: 80, n_passed: 30, headline: 30 / 34,
      solved_per_hour: 3.1, identity: { access: 'remote', canonical_model: 'opus-4.8' },
      access_label: 'anthropic-api',
    }),
    cell({ cell: 'partial', agentic_tok_s: 200, n_graded: 10, comparable: true }), // too few tasks
  ]
  const rows = codingHarnessRows(cells, [], REGISTRY)
  assert.equal(rows.length, 2)
  assert.equal(rows.filter((r) => r.isLocal).length, 1)
  assert.equal(rows.filter((r) => !r.isLocal).length, 1)
  assert.equal(rows.find((r) => !r.isLocal)?.routeLabel, 'anthropic-api')
  const bySpeed = sortHarnessRows(rows, 'speed')
  assert.equal(bySpeed[0].agentic, 120)
  const byScore = sortHarnessRows(rows, 'score')
  assert.equal(byScore[0].canonical, 'opus-4.8')
  const byEff = sortHarnessRows(rows, 'efficiency')
  assert.equal(byEff[0].solvedPerHour, 3.1)
  assert.equal(rows[0].examVersion, null)
})

test('examDisplay: SWE alias + semver from producer label', async () => {
  const { examAlias, examSemver } = await import('../src/lib/examDisplay.ts')
  assert.equal(examAlias(34, '34t-559c010f'), 'SWE34')
  assert.equal(examAlias(null, '40t-6604ff64'), 'SWE40')
  assert.equal(examAlias(null, null), null)
  assert.equal(examSemver('cookys-frontier v1.1.1'), 'v1.1.1')
  assert.equal(examSemver('cookys-frontier v1.1'), 'v1.1')
  assert.equal(examSemver('unlabeled'), null)
})

test('examCoverage: chip when receipt n_graded < exam n_exam', async () => {
  const { examCoverageState, showExamCoverageChip } = await import('../src/lib/examCoverage.ts')
  const full = examCoverageState(34, 34, 0, 31)
  assert.equal(full?.kind, 'full')
  assert.equal(showExamCoverageChip(full), false)
  const owed = examCoverageState(33, 34, 1, 31)
  assert.equal(owed?.kind, 'owed')
  assert.equal(owed?.owed, 1)
  assert.equal(showExamCoverageChip(owed), true)
  const thin = examCoverageState(10, 34, 24, 31)
  assert.equal(thin?.kind, 'thin')
  assert.equal(showExamCoverageChip(thin), true)
})

// --- Domain breakdown ------------------------------------------------------------------

test('domain scores come from real per-task verdicts; unknown model renders nothing', () => {
  const index = {
    domains: ['backend', 'frontend-web', '_unknown'],
    cells: [
      {
        cell: 'results-qwen38-small', model: 'qwen3.8-27b', backend: 'local', n: 10,
        by_domain: { backend: { passed: 3, n: 5, acc: 0.6 } },
      },
      {
        cell: 'results-qwen38-full', model: 'qwen3.8-27b', backend: 'local', n: 34,
        by_domain: {
          backend: { passed: 8, n: 10, acc: 0.8 },
          'frontend-web': { passed: 4, n: 6, acc: 4 / 6 },
          _unknown: { passed: 1, n: 2, acc: 0.5 },
        },
      },
    ],
  }
  const scores = domainScoresForModel('qwen3.8-27b', index)
  // widest-coverage cell wins; _unknown is dropped
  assert.deepEqual(scores.map((s) => s.domainId), ['backend', 'frontend-web'])
  assert.equal(scores[0].passed, 8)
  assert.equal(scores[0].total, 10)
  // bilingual labels exist for the real domain ids
  assert.notEqual(scores[1].label.zh, scores[1].domainId)

  assert.deepEqual(domainScoresForModel('never-benched-model', index), [])
  assert.deepEqual(domainScoresForModel('qwen3.8-27b', null), [])
})
