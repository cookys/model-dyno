/**
 * Hardware tiers — VRAM buckets whose MEMBERSHIP and NUMBERS are derived from
 * the snapshot `machines` + `speed_records` sections. The bucket boundaries
 * and labels are editorial; every displayed number traces to a real record.
 */

import type { FleetMachine } from './publicBundle'
import type { SpeedRecord } from './store'

export interface HardwareTier {
  id: string
  label: { en: string; zh: string }
  shortName: string
  /** Inclusive VRAM-pool bounds in GB used to classify machines. */
  minGb: number
  maxGb: number
}

export const HARDWARE_TIERS: HardwareTier[] = [
  {
    id: 'tier-le16',
    shortName: '≤16 GB',
    label: { en: '≤16 GB VRAM / small unified', zh: '≤16 GB 顯存／小統一記憶體' },
    minGb: 0,
    maxGb: 16,
  },
  {
    id: 'tier-24-32',
    shortName: '17–32 GB',
    label: { en: '17–32 GB VRAM (consumer sweetspot)', zh: '17–32 GB 顯存（消費級甜點檔）' },
    minGb: 17,
    maxGb: 32,
  },
  {
    id: 'tier-33-64',
    shortName: '33–64 GB',
    label: { en: '33–64 GB VRAM / unified', zh: '33–64 GB 顯存／統一記憶體' },
    minGb: 33,
    maxGb: 64,
  },
  {
    id: 'tier-gt64',
    shortName: '>64 GB',
    label: { en: '>64 GB VRAM / workstation & big unified', zh: '>64 GB 工作站級／大統一記憶體' },
    minGb: 65,
    maxGb: Infinity,
  },
]

export function machineVramGb(m: FleetMachine): number | null {
  return m.vram_pool_gb ?? m.vram_total_gb ?? m.vram_per_gpu_gb ?? null
}

export function tierOfMachine(m: FleetMachine): HardwareTier | null {
  const gb = machineVramGb(m)
  if (gb == null) return null
  return HARDWARE_TIERS.find((t) => gb >= t.minGb && gb <= t.maxGb) ?? null
}

export function machinesForTier(tier: HardwareTier, machines: FleetMachine[]): FleetMachine[] {
  return machines.filter((m) => tierOfMachine(m)?.id === tier.id)
}

export function getHardwareTierById(id: string): HardwareTier | undefined {
  return HARDWARE_TIERS.find((t) => t.id === id)
}

/** Speed records attributed to a tier's machines (profile match, alias aware). */
export function speedRecordsForTier(
  tier: HardwareTier,
  machines: FleetMachine[],
  records: SpeedRecord[],
): SpeedRecord[] {
  const members = machinesForTier(tier, machines)
  const names = new Set<string>()
  for (const m of members) {
    names.add(m.profile.toLowerCase())
    for (const a of m.aliases) names.add(a.toLowerCase())
  }
  return records.filter((r) => {
    const p = (r.profile ?? '').toLowerCase()
    return p && names.has(p)
  })
}

export interface TierSpeedSummary {
  nRecords: number
  nMachines: number
  medianTg: number | null
  maxTg: number | null
}

export function tierSpeedSummary(
  tier: HardwareTier,
  machines: FleetMachine[],
  records: SpeedRecord[],
): TierSpeedSummary {
  const rows = speedRecordsForTier(tier, machines, records)
  const tg = rows
    .map((r) => r.tg128_tps)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b)
  return {
    nRecords: rows.length,
    nMachines: machinesForTier(tier, machines).length,
    medianTg: tg.length ? tg[Math.floor(tg.length / 2)] : null,
    maxTg: tg.length ? tg[tg.length - 1] : null,
  }
}
