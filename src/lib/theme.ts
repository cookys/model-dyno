import { useColorMode, usePreferredDark } from '@vueuse/core'
import { computed } from 'vue'

// Create the color mode manager using VueUse
export const mode = useColorMode<'dark' | 'light' | 'auto'>({
  selector: 'html',
  attribute: 'class',
  storageKey: 'dash.theme',
  initialValue: 'auto',
  modes: {
    dark: 'dark',
    light: 'light',
  }
})

// Determine if the system prefers dark mode
const preferredDark = usePreferredDark()

// Export a resolved isDark boolean
export const isDark = computed(() => {
  if (mode.value === 'auto') {
    return preferredDark.value
  }
  return mode.value === 'dark'
})

// Shared chart theme generator for Vega
export function chartTheme(isDarkVal: boolean) {
  const labelColor = isDarkVal ? '#94a3b8' : '#475569'
  const titleColor = isDarkVal ? '#94a3b8' : '#475569'
  const domainColor = isDarkVal ? '#334155' : '#cbd5e1'
  const tickColor = isDarkVal ? '#334155' : '#cbd5e1'
  const gridColor = isDarkVal ? '#1e293b' : '#e2e8f0'
  const legendLabelColor = isDarkVal ? '#e2e8f0' : '#475569'

  return {
    view: { stroke: 'transparent' },
    axis: {
      labelColor,
      titleColor,
      domainColor,
      tickColor,
      gridColor,
      labelFontSize: 11,
      labelFont: 'Geist, system-ui, sans-serif',
      titleFont: 'Geist, system-ui, sans-serif'
    },
    legend: {
      labelColor: legendLabelColor,
      titleColor,
      labelFont: 'Geist, system-ui, sans-serif',
      titleFont: 'Geist, system-ui, sans-serif'
    }
  }
}

export function chartBlueScheme(isDarkVal: boolean) {
  // Reverse via `extent: [1, 0]` — a real Vega-Lite SchemeParams prop. `reverse` INSIDE the scheme
  // object is silently ignored (it's a top-level scale prop, not a scheme prop), so dark mode never
  // actually reversed. extent flips the scheme so high=bright/high-contrast on charcoal, low=dim.
  return isDarkVal ? { name: 'blues', extent: [1, 0] } : 'blues'
}
