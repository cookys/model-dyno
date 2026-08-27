<script setup lang="ts">
/**
 * Compact hardware receipt for one machine profile. Specs come from two real
 * snapshot sections: the fleet machine registry (GPU / VRAM pools / memory
 * kind) and that machine's own speed records (CPU, RAM, OS). Unknown → "—".
 */
import { computed } from 'vue'
import { useI18n } from '@/lib/i18n'
import { fleetMachines, dashboardRecords } from '@/lib/store'
import { Cpu, MemoryStick, MonitorCog, Microchip } from 'lucide-vue-next'

const props = defineProps<{ profile: string }>()

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const GENERIC = new Set(['cookys', 'linux', 'windows', 'macos', 'mac'])
const tokens = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !GENERIC.has(t))

/** Exact profile/alias match first; fall back to best token overlap. */
function bestMatch<T>(candidates: T[], namesOf: (c: T) => (string | null | undefined)[]): T | null {
  const want = props.profile.toLowerCase()
  const exact = candidates.find((c) => namesOf(c).some((n) => (n ?? '').toLowerCase() === want))
  if (exact) return exact
  const mine = new Set(tokens(props.profile))
  if (!mine.size) return null
  let best: T | null = null
  let bestScore = 0
  for (const c of candidates) {
    const score = namesOf(c).reduce(
      (acc, n) => Math.max(acc, tokens(n).filter((t) => mine.has(t)).length),
      0,
    )
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

const machine = computed(() =>
  bestMatch(fleetMachines.value, (fm) => [fm.profile, ...fm.aliases]),
)

/** A speed record from the same box carries CPU / RAM / OS attribution. */
const record = computed(() => bestMatch(dashboardRecords.value, (r) => [r.profile]))

const gpuLine = computed(() => {
  const m = machine.value
  if (m?.gpu_name) return `${m.gpu_name}${(m.gpu_count ?? 1) > 1 ? ` ×${m.gpu_count}` : ''}`
  return record.value?.gpu_summary ?? null
})

const vramLine = computed(() => {
  const m = machine.value
  if (!m) return null
  const pool = m.vram_pool_gb ?? m.vram_total_gb ?? m.vram_per_gpu_gb
  const usable = m.vram_usable_gb ?? m.vram_practical_gb
  if (pool == null) return null
  return usable != null && Math.round(usable) !== Math.round(pool)
    ? `${Math.round(pool)} GB（${zh.value ? '實際可用' : 'usable'} ~${Math.round(usable)} GB）`
    : `${Math.round(pool)} GB`
})

const memKind = computed(() => {
  const k = machine.value?.memory_kind
  if (!k) return null
  if (k === 'unified') return zh.value ? '統一記憶體' : 'Unified memory'
  if (k === 'discrete') return zh.value ? '獨立顯存' : 'Discrete VRAM'
  return k
})

const osLine = computed(() => {
  const r = record.value
  if (!r?.os_family) return null
  return r.os_version ? `${r.os_family} ${r.os_version}` : r.os_family
})

const rows = computed(() =>
  [
    { icon: Microchip, label: 'GPU', value: gpuLine.value },
    { icon: MemoryStick, label: zh.value ? '顯存 / 可分配' : 'VRAM', value: vramLine.value, suffix: memKind.value },
    { icon: Cpu, label: 'CPU', value: record.value?.cpu_model ?? null, suffix: record.value?.ram_gb != null ? `RAM ${Math.round(record.value.ram_gb)} GB` : null },
    { icon: MonitorCog, label: 'OS', value: osLine.value },
  ].filter((r) => r.value),
)
</script>

<template>
  <div v-if="rows.length" class="rounded-lg bg-muted/30 border border-border/50 p-2.5 space-y-1">
    <div v-for="r in rows" :key="r.label" class="flex items-center gap-2 text-[11px]">
      <component :is="r.icon" class="h-3 w-3 text-muted-foreground shrink-0" />
      <span class="w-20 text-muted-foreground shrink-0">{{ r.label }}</span>
      <span class="font-mono">{{ r.value }}</span>
      <span v-if="r.suffix" class="text-muted-foreground font-mono text-[10px]">· {{ r.suffix }}</span>
    </div>
  </div>
  <div v-else class="text-[11px] text-muted-foreground">
    {{ zh ? '這台機器不在機隊清單裡，沒有配備收據。' : 'This machine is not in the fleet registry — no hardware receipt.' }}
  </div>
</template>
