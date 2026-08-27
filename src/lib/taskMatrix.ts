/**
 * Task matrix — the per-task derivation layer over the 166×34 verdict grid.
 *
 * Every cell in the snapshot carries `task_verdicts` (task id → PASS/FAIL/
 * ERROR), and the feed carries `task_domains` (task id → domain). Joining the
 * two unlocks derivations no aggregate can give:
 *   - task difficulty across the fleet (what share of runs solve each task);
 *   - discrimination (does the task separate strong from weak models, or is
 *     it saturated all-pass / all-fail carrying no signal);
 *   - per-cell domain strengths derived straight from verdicts;
 *   - the FLIP DIFF between two cells — which exact tasks changed verdict
 *     when one condition changed (the content behind a "±N tasks" delta).
 */

import type { SweCell } from './store'
import { domainLabel } from './domainBreakdown.ts'

// ---------------------------------------------------------------------------
// Fleet-wide task difficulty & discrimination
// ---------------------------------------------------------------------------

export interface TaskStat {
  taskId: string
  domain: string | null
  /** Eligible runs that graded this task. */
  attempts: number
  passes: number
  passRate: number
  /**
   * Pass-rate gap between the stronger half and weaker half of runs (split by
   * cell headline). ~0 on saturated items; high = the task separates models.
   */
  discrimination: number | null
  band: 'all-pass' | 'all-fail' | 'discriminating'
}

function eligibleCells(cells: SweCell[]): SweCell[] {
  return cells.filter((c) => c.comparable === true && c.task_verdicts && (c.n_graded ?? 0) >= 30)
}

export function taskStats(
  cells: SweCell[],
  taskDomains: Record<string, string>,
): TaskStat[] {
  const pool = eligibleCells(cells)
  if (!pool.length) return []
  const sorted = [...pool].sort((a, b) => (b.headline ?? 0) - (a.headline ?? 0))
  const half = Math.floor(sorted.length / 2)
  const strong = new Set(sorted.slice(0, half))

  const byTask = new Map<string, { attempts: number; passes: number; strongAttempts: number; strongPasses: number }>()
  for (const cell of pool) {
    const isStrong = strong.has(cell)
    for (const [taskId, verdict] of Object.entries(cell.task_verdicts!)) {
      const stat = byTask.get(taskId) ?? { attempts: 0, passes: 0, strongAttempts: 0, strongPasses: 0 }
      stat.attempts += 1
      if (verdict === 'PASS') stat.passes += 1
      if (isStrong) {
        stat.strongAttempts += 1
        if (verdict === 'PASS') stat.strongPasses += 1
      }
      byTask.set(taskId, stat)
    }
  }

  return Array.from(byTask.entries())
    .map(([taskId, s]): TaskStat => {
      const weakAttempts = s.attempts - s.strongAttempts
      const weakPasses = s.passes - s.strongPasses
      const discrimination =
        s.strongAttempts > 0 && weakAttempts > 0
          ? s.strongPasses / s.strongAttempts - weakPasses / weakAttempts
          : null
      return {
        taskId,
        domain: taskDomains[taskId] ?? null,
        attempts: s.attempts,
        passes: s.passes,
        passRate: s.attempts ? s.passes / s.attempts : 0,
        discrimination,
        band: s.passes === s.attempts ? 'all-pass' : s.passes === 0 ? 'all-fail' : 'discriminating',
      }
    })
    .sort((a, b) => a.passRate - b.passRate)
}

// ---------------------------------------------------------------------------
// Per-cell domain strengths (derived straight from this cell's verdicts)
// ---------------------------------------------------------------------------

export interface CellDomainScore {
  domainId: string
  label: { en: string; zh: string }
  passed: number
  total: number
  passRate: number
}

export function domainScoresFromVerdicts(
  cell: Pick<SweCell, 'task_verdicts'>,
  taskDomains: Record<string, string>,
): CellDomainScore[] {
  const verdicts = cell.task_verdicts
  if (!verdicts) return []
  const byDomain = new Map<string, { passed: number; total: number }>()
  for (const [taskId, verdict] of Object.entries(verdicts)) {
    const domain = taskDomains[taskId]
    if (!domain || domain === '_unknown') continue
    const stat = byDomain.get(domain) ?? { passed: 0, total: 0 }
    stat.total += 1
    if (verdict === 'PASS') stat.passed += 1
    byDomain.set(domain, stat)
  }
  return Array.from(byDomain.entries())
    .map(([domainId, s]): CellDomainScore => ({
      domainId,
      label: domainLabel(domainId),
      passed: s.passed,
      total: s.total,
      passRate: s.total ? s.passed / s.total : 0,
    }))
    .sort((a, b) => b.passRate - a.passRate || a.domainId.localeCompare(b.domainId))
}

// ---------------------------------------------------------------------------
// Flip diff between two cells — the content behind a "±N tasks" delta
// ---------------------------------------------------------------------------

export interface TaskFlip {
  taskId: string
  domain: string | null
  aVerdict: string
  bVerdict: string
}

export interface FlipDiff {
  /** Tasks A solves that B does not. */
  aOnly: TaskFlip[]
  /** Tasks B solves that A does not. */
  bOnly: TaskFlip[]
  bothPass: number
  neitherPass: number
  /** Tasks graded in both cells. */
  shared: number
}

export function flipDiff(
  a: Pick<SweCell, 'task_verdicts'>,
  b: Pick<SweCell, 'task_verdicts'>,
  taskDomains: Record<string, string>,
): FlipDiff | null {
  const va = a.task_verdicts
  const vb = b.task_verdicts
  if (!va || !vb) return null
  const out: FlipDiff = { aOnly: [], bOnly: [], bothPass: 0, neitherPass: 0, shared: 0 }
  for (const [taskId, verdictA] of Object.entries(va)) {
    const verdictB = vb[taskId]
    if (!verdictB) continue
    out.shared += 1
    const passA = verdictA === 'PASS'
    const passB = verdictB === 'PASS'
    const flip: TaskFlip = {
      taskId,
      domain: taskDomains[taskId] ?? null,
      aVerdict: verdictA,
      bVerdict: verdictB,
    }
    if (passA && !passB) out.aOnly.push(flip)
    else if (!passA && passB) out.bOnly.push(flip)
    else if (passA) out.bothPass += 1
    else out.neitherPass += 1
  }
  return out
}

export interface FailedTaskRow {
  taskId: string
  verdict: string
  domain: string | null
}

/** FAIL/ERROR tasks from one cell's verdict map — for ModelDetail receipts. */
export function failedTasksFromCell(
  cell: Pick<SweCell, 'task_verdicts'>,
  taskDomains: Record<string, string>,
): FailedTaskRow[] {
  const verdicts = cell.task_verdicts
  if (!verdicts) return []
  return Object.entries(verdicts)
    .filter(([, v]) => v === 'FAIL' || v === 'ERROR')
    .map(([taskId, verdict]) => ({
      taskId,
      verdict,
      domain: taskDomains[taskId] ?? null,
    }))
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
}
