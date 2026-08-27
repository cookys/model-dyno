/**
 * UI Version State Manager (v0 Classic Matrix ↔ v1 Recipe Workbench)
 */
import { ref, computed } from 'vue'

export type UiVersion = 'v1' | 'v0'

const STORAGE_KEY = 'model_dyno_ui_version'

// Default to v1 (the modern recipe workbench), allow fallback to v0
function getInitialUiVersion(): UiVersion {
  if (typeof window === 'undefined') return 'v1'
  const params = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search)
  const queryVersion = params.get('ui')
  if (queryVersion === 'v0' || queryVersion === 'v1') {
    return queryVersion
  }
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'v0' || saved === 'v1') {
    return saved
  }
  return 'v1'
}

export const activeUiVersion = ref<UiVersion>(getInitialUiVersion())

export function setUiVersion(v: UiVersion) {
  activeUiVersion.value = v
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, v)
  }
}

export const isV1 = computed(() => activeUiVersion.value === 'v1')
