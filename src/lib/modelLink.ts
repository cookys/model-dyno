// Turns a board row into a link to its `#/model/:alias` page — but only when that page
// has something to show.
//
// The model page fills itself from three independent sources (speed runs, scorecard SWE
// cells, registry footprints). A board row can name a model that is in none of them —
// a comp-only cell, say — and linking it would hand the reader an empty page. So the
// href is resolved against the union of aliases those three sources actually carry, and
// callers render plain text when it comes back null.
//
// Route identity: `ModelDetail` matches speed runs with `===` (case-sensitive) but SWE
// cells case-insensitively. The map is therefore keyed lowercase but stores the alias
// STRING as the speed feed spells it, first writer wins, speed records added first — so
// the routed alias is the one that also matches the strict comparison.
import { computed } from 'vue'
import { dashboardRecords, scorecardSweCells, modelFootprints } from '@/lib/store'
import { canonicalModelKey } from '@/lib/identity'

export const linkableModelAliases = computed(() => {
  const map = new Map<string, string>()
  const add = (value: string | null | undefined) => {
    const key = canonicalModelKey(value)
    if (!key || map.has(key)) return
    map.set(key, (value as string).trim())
  }
  for (const r of dashboardRecords.value) add(r.model_alias)
  for (const c of scorecardSweCells.value) {
    add((c as { identity?: { canonical_model?: string | null } }).identity?.canonical_model)
    add(c.model)
  }
  for (const f of modelFootprints.value) add(f.alias)
  return map
})

/** `#/model/<alias>` for a board row, or null when no model page would have content. */
export function modelPageHref(c: unknown): string | null {
  if (!c) return null
  const row = c as {
    identity?: { canonical_model?: string | null } | null
    model?: string | null
    display?: string | null
  }
  const candidates = [row.identity?.canonical_model, row.model, row.display]
  for (const candidate of candidates) {
    const key = canonicalModelKey(candidate)
    if (!key) continue
    const alias = linkableModelAliases.value.get(key)
    if (alias) return `#/model/${encodeURIComponent(alias)}`
  }
  return null
}
