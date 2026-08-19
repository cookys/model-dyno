// Joins a benchmark row to the box that produced it and to the weights it ran.
//
// Both sides ride the published snapshot (`machines`, `model_registry`); this module owns
// the lookup and the one piece of arithmetic a reader would otherwise have to do in their
// head: does this model fit on that card.
import { computed } from 'vue'
import { machines, modelFootprints } from '@/lib/store'
import type { MachineHardware, ModelFootprint } from '@/lib/publicBundle'

/** profile name (or a historical bench alias) → machine. */
export const machineByProfile = computed(() => {
  const map = new Map<string, MachineHardware>()
  for (const m of machines.value) {
    map.set(m.profile, m)
    for (const alias of m.aliases) map.set(alias, m)
  }
  return map
})

export const footprintByAlias = computed(() => {
  const map = new Map<string, ModelFootprint>()
  for (const f of modelFootprints.value) map.set(f.alias, f)
  return map
})

/** "RTX 4090 · 24GB" — what a stranger can act on, instead of "cookys-gentoo". */
export function machineLabel(profile: string | null | undefined): string {
  const m = profile ? machineByProfile.value.get(profile) : undefined
  if (!m || !m.gpu_name) return profile || '—'
  const card = m.gpu_name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+#\d+$/, '').trim()
  const count = m.gpu_count && m.gpu_count > 1 ? `${m.gpu_count}× ` : ''
  const mem = m.vram_usable_gb ? ` · ${m.vram_usable_gb}GB` : ''
  return `${count}${card}${mem}`
}

export type FitVerdict = 'fits' | 'tight' | 'split' | 'no' | 'unknown'

/**
 * Whether `weightsGb` loads on a machine, as an ESTIMATE and never as a measurement.
 *
 * Two independent limits, and they answer different questions:
 *
 *   usableGb  — is there ROOM for the weights at all.
 *   allocCap  — can ONE allocation be that big. llama.cpp asks for the whole weight
 *               buffer in a single call, so on a machine whose driver caps a single
 *               allocation well below its pool (the Strix Halo boxes: ~100GB available,
 *               ~61GB per hipMalloc) a model that comfortably fits still fails to load
 *               unless it is split across devices or partly offloaded to system RAM.
 *
 * Collapsing them into one number reported "does not fit" for a machine that fits it
 * fine and merely needs `-ot` expert offload — a materially different answer, and for a
 * MoE model the cheap one.
 *
 * Weights are also only part of the working set: KV cache and compute buffers want the
 * same memory, which is why `tight` exists between fits and no. Everything here must be
 * labelled an estimate — the site's credibility rests on measured numbers and this is
 * not one.
 */
export function fitVerdict(
  weightsGb: number | null | undefined,
  usableGb: number | null | undefined,
  allocCapGb?: number | null,
): FitVerdict {
  if (!weightsGb || !usableGb) return 'unknown'
  const headroom = usableGb - weightsGb
  if (headroom < 0) return 'no'
  // Room exists, but no single buffer that large can be allocated.
  if (allocCapGb && weightsGb > allocCapGb) return 'split'
  // ~15% of the pool, floored at 2GB: below that there is no room for a usable context.
  if (headroom < Math.max(2, usableGb * 0.15)) return 'tight'
  return 'fits'
}
