// "Show me hardware like mine."
//
// Every speed number on this board came from one of a handful of very different boxes —
// a 24GB 4090, a 192GB dual-Blackwell workstation, an Apple laptop sharing 18GB with the
// OS. Ranked together, the workstation wins everything, and a reader with a 24GB card
// reads its number as what the model does. Filtering by the memory a reader actually has
// is what turns someone else's fleet into their own answer.
//
// The buckets are what people own, not an even split.
import { computed, ref } from 'vue'
import { machineByProfile } from '@/lib/hardware'

export const VRAM_BUCKETS = [0, 12, 16, 24, 32, 48, 96] as const

const selectedVram = ref<number>(0)   // 0 = no filter

export function useVramFilter() {
  const setVram = (gb: number) => { selectedVram.value = gb }

  /** Does this profile's usable memory clear the reader's bar? */
  const machineFits = (profile: string | null | undefined): boolean => {
    if (!selectedVram.value) return true
    const m = profile ? machineByProfile.value.get(profile) : undefined
    // Unknown memory is NOT filtered out. A row we cannot classify is a gap in our own
    // data, and silently hiding it would present a filtered board as complete.
    if (!m || m.vram_usable_gb === null) return true
    return m.vram_usable_gb <= selectedVram.value
  }

  return {
    selectedVram,
    setVram,
    machineFits,
    active: computed(() => selectedVram.value > 0),
  }
}
