/**
 * Domain capability breakdown — derived from the real per-task verdicts in the
 * snapshot (DomainIndex). No fallback profiles: a model without domain data
 * renders nothing rather than an invented radar.
 */

import type { DomainCell, DomainIndex } from './store'

export interface DomainScore {
  domainId: string
  label: { en: string; zh: string }
  passRate: number | null
  passed: number
  total: number
}

/** Bilingual labels for the real task-domain ids in the exam bank. */
const DOMAIN_LABELS: Record<string, { en: string; zh: string }> = {
  'backend': { en: 'Backend services', zh: '後端服務' },
  'frontend-web': { en: 'Frontend / Web UI', zh: '前端與網頁介面' },
  'cli-tool': { en: 'CLI tools', zh: 'CLI 工具' },
  'tui-display': { en: 'TUI / terminal display', zh: 'TUI 終端介面' },
  'app-logic': { en: 'Application logic', zh: '應用邏輯' },
  'data-pipeline': { en: 'Data pipelines', zh: '資料管線' },
  'devtools': { en: 'Developer tooling', zh: '開發者工具' },
  'infra-scripts': { en: 'Infra scripts', zh: '基礎設施腳本' },
}

export function domainLabel(domainId: string): { en: string; zh: string } {
  return DOMAIN_LABELS[domainId] ?? { en: domainId, zh: domainId }
}

/** The model's domain cell with the widest coverage (largest n). */
export function domainCellForModel(
  model: string | null | undefined,
  index: DomainIndex | null,
): DomainCell | null {
  if (!model || !index) return null
  const key = model.toLowerCase().trim()
  const mine = index.cells.filter((c) => (c.model ?? '').toLowerCase() === key)
  if (!mine.length) return null
  return mine.reduce((best, c) => (c.n > best.n ? c : best), mine[0])
}

export function domainScoresForModel(
  model: string | null | undefined,
  index: DomainIndex | null,
): DomainScore[] {
  const cell = domainCellForModel(model, index)
  if (!cell) return []
  return Object.entries(cell.by_domain)
    .filter(([domainId]) => domainId !== '_unknown')
    .map(([domainId, stat]): DomainScore => ({
      domainId,
      label: domainLabel(domainId),
      passRate: stat.acc,
      passed: stat.passed,
      total: stat.n,
    }))
    .sort((a, b) => a.domainId.localeCompare(b.domainId))
}
