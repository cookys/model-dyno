import { h, type VNode } from 'vue'
import { Ban, Bot, CircleCheck, GitMerge, Handshake, Route, TriangleAlert, Trophy } from 'lucide-vue-next'
import { useI18n } from '@/lib/i18n'

export const contributorOf = (r: any): string => r.owner || r.profile || 'unknown'
export const hwOf = (r: any): string => r.gpu_summary || r.cpu_model || '—'
export const num = (v: any): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
export const fmt = (v: any, d = 1): string => (num(v) === null ? '—' : v.toFixed(d))
export const shortDate = (ts: any): string => (ts ? String(ts).slice(0, 10) : '—')

export function ageDays(ts: any, nowMs: number): number | null {
  if (!ts) return null
  const t = Date.parse(ts)
  if (isNaN(t)) return null
  return Math.floor((nowMs - t) / 86400000)
}

// swe rate and CI helpers
export const sweRate = (c: any): number | null => (c && c.headline != null ? c.headline : (c ? c.effective : null))
export const sweCI = (c: any): [number, number] | null => (c && c.headline_ci ? c.headline_ci : (c ? c.ci : null))
export const overlaps = (a: any, b: any): boolean => Array.isArray(a) && Array.isArray(b) && a[0] <= b[1] && b[0] <= a[1]
export const pct = (x: any): string => (num(x) === null ? '—' : `${(x * 100).toFixed(0)}%`)

export function indicatorIconBadge(
  icon: any,
  title: string,
  cls: string,
  label = title,
  count: number | string | null = null,
): VNode {
  const countText = count === null || count === undefined ? '' : String(count)
  return h(
    'span',
    {
      class: `relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border align-middle ${cls}`,
      title,
      'aria-label': label,
    },
    [
      h(icon, { class: 'h-3.5 w-3.5', 'aria-hidden': 'true' }),
      countText
        ? h('span', {
            class: 'absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-current bg-background px-0.5 text-[9px] font-bold leading-none',
            'aria-hidden': 'true',
          }, countText)
        : null,
    ],
  )
}

export function foldedVariantsBadge(count: number, t: (key: string) => string): VNode {
  const title = t('fold.variants.badgeTip').replace('{n}', String(count))
  return indicatorIconBadge(
    GitMerge,
    title,
    'border-brand/30 bg-brand/10 text-brand dark:bg-brand/20',
    title,
    count,
  )
}

export function foldedRoutesBadge(count: number, t: (key: string) => string): VNode {
  const title = t('fold.routes.badgeTip').replace('{n}', String(count))
  return indicatorIconBadge(
    Route,
    title,
    'border-brand/30 bg-brand/10 text-brand dark:bg-brand/20',
    title,
    count,
  )
}

export function suspectErrorBadge(count: number, t: (key: string) => string): VNode {
  const label = t('error.suspect.label').replace('{n}', String(count))
  const title = `${t('error.suspect.tip')} ${label}`
  return indicatorIconBadge(
    TriangleAlert,
    title,
    'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:bg-rose-950/25 dark:text-rose-400',
    title,
    count,
  )
}

export function usageScenarioBadge(usage: UsageScenario): VNode {
  const icon = usage.rank === 0 ? Trophy
    : usage.rank === 1 ? Handshake
      : usage.rank === 2 ? Bot
        : TriangleAlert
  return indicatorIconBadge(
    icon,
    `${usage.label}: ${usage.tip}`,
    usage.cls,
    `${usage.label}: ${usage.tip}`,
  )
}

const TAG_LABEL: Record<string, Record<string, string>> = {
  placement: { cloud: '☁ cloud', remote: '🛰 remote', local: '💻 local' },
  thinking: { on: '🧠 think-on', off: 'think-off' },
  draft: { mtp: 'draft:mtp', dflash: 'draft:dflash', ngram: 'draft:ngram', classic: 'draft:classic' },
  lineage: { abliterated: 'abliterated', heretic: 'heretic', merged: 'merged', uncensored: 'uncensored' },
  role: { control: 'control' }
}
const TAG_ORDER = ['placement', 'thinking', 'draft', 'lineage', 'role', 'quant']
const TAG_HIDE = new Set(['none', 'n/a', 'base', 'candidate'])

export function sweTagBadges(tags: Record<string, string>): VNode | null {
  if (!tags || typeof tags !== 'object') return null
  const spans: VNode[] = []
  for (const dim of TAG_ORDER) {
    const v = tags[dim]
    if (!v || TAG_HIDE.has(v)) continue
    const label = (TAG_LABEL[dim] && TAG_LABEL[dim][v]) || (dim === 'quant' ? v : `${dim}:${v}`)

    let colorClass = 'text-muted-foreground border-border bg-muted'
    if (dim === 'placement') colorClass = 'text-brand border-brand/20 dark:border-brand/30 bg-brand/10 dark:bg-brand/20'
    else if (dim === 'thinking') colorClass = 'text-amber-700 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20'
    else if (dim === 'lineage') colorClass = 'text-pink-700 dark:text-pink-400 border-pink-500/20 dark:border-pink-500/30 bg-pink-500/10 dark:bg-pink-950/20'
    else if (dim === 'role') colorClass = 'text-orange-700 dark:text-orange-400 border-orange-500/20 dark:border-orange-500/30 bg-orange-500/10 dark:bg-orange-950/20'

    spans.push(h('span', { class: `tagbadge tag-${dim} text-[10px] font-sans px-2 py-0.5 rounded-full border ${colorClass} font-medium tracking-wide`, title: `${dim}: ${v}` }, label))
  }
  return spans.length ? h('span', { class: 'tagbadges inline-flex flex-wrap gap-1.5 ml-1.5' }, spans) : null
}

// Agency / no-op verdict — folds the 3 score-credibility dims (infra / no-op / budget-cap)
// into one attribution chip so a LOW score is read correctly. CLEAN stays low-key (a green
// dot); INFRA/TOOL-USE/CAPPED get a colored pill because they mean the number is NOT capability.
const AGENCY_MAP: Record<string, [any, string, string]> = {
  'TOOL-USE': [Ban, 'tool-use', 'text-orange-700 dark:text-orange-400 border-orange-500/30 bg-orange-500/10 dark:bg-orange-950/20'],
  'INFRA':    [TriangleAlert, 'infra', 'text-rose-700 dark:text-rose-400 border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20'],
  'CAPPED':   [TriangleAlert, 'capped', 'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20'],
}

function pctOrNull(v: any): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null
}

function credibilityDims(agency: any, source: any) {
  const statusCounts = source?.status_counts || {}
  const statusDenom = pctOrNull(source?.status_denominator)
  // verify_error is deliberately NOT infra — must match the canonical producer-side
  // footing.infra_casualty predicate or the board speaks a different dialect than
  // the SOP three-gate tools.
  const infraFromStatus = statusDenom && statusDenom > 0
    ? Math.round(100 * (statusCounts.infra_error || 0) / statusDenom)
    : null
  const trunc = pctOrNull(source?.trunc_pct)
  const maxstep = pctOrNull(source?.maxstep_pct)
  const capFromSource = trunc === null && maxstep === null ? null : Math.max(trunc || 0, maxstep || 0)
  return {
    noop: pctOrNull(agency?.noop_pct),
    infra: pctOrNull(agency?.infra_pct) ?? infraFromStatus,
    cap: pctOrNull(agency?.budget_pct) ?? pctOrNull(agency?.cap_pct) ?? capFromSource,
  }
}

export function agencyBadge(agency: any, source: any = null): VNode {
  const { t } = useI18n()
  if (!agency || agency.noop_pct == null) return h('span', { class: 'text-muted-foreground/40' }, '—')
  const dims = credibilityDims(agency, source)
  const noop = dims.noop ?? agency.noop_pct
  const pctText = (v: number | null) => v === null ? t('agency.pctUnknown') : t('agency.pctValue').replace('{pct}', String(v))
  // 結構性缺源的維度直接省略(SweCell 沒有 trunc/maxstep → cap 不渲染),
  // 只有「有源但值缺」才顯示 unknown — 避免 scorecard 每列都掛一個 cap unknown。
  const segs = ([['noop', dims.noop], ['infra', dims.infra], ['cap', dims.cap]] as const)
    .filter(([k, v]) => !(k === 'cap' && v === null && pctOrNull(source?.trunc_pct) === null && pctOrNull(source?.maxstep_pct) === null))
    .map(([k, v]) => t(`agency.dim.${k}`).replace('{pct}', pctText(v)))
  const dimText = segs.join(' · ')
  const v = agency.verdict
  const hit = AGENCY_MAP[v]
  if (!hit) {
    // CLEAN — agent engaged the tools; a low score here IS capability. Low-key dot + tooltip.
    const title = t('agency.clean.tip').replace('{dims}', dimText)
    return indicatorIconBadge(
      CircleCheck,
      title,
      'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      `${t('agency.label.clean')}: ${dimText}`,
    )
  }
  const [icon, , cls] = hit
  // `flags` lists ALL tripped dims; the verdict shows only the most-upstream one. Surface the
  // co-occurring secondary signals the single label hides (footing.agency_flags / wave-4 #14).
  const flags: string[] = Array.isArray(agency.flags) ? agency.flags : []
  const secondary = flags.filter((f) => f !== v)
  const localizedLabel = t('agency.label.' + v.toLowerCase())
  const secondaryLabels = secondary.map((f) => t('agency.label.' + f.toLowerCase()))
  const alsoTxt = secondaryLabels.length ? t('agency.alsoTripped').replace('{list}', secondaryLabels.join(', ')) : ''
  const mismatch = v === 'TOOL-USE' ? t('agency.tool-use-mismatch') : t('agency.label.' + v.toLowerCase())
  const tip = t('agency.bad.tip')
    .replace('{label}', localizedLabel)
    .replace('{noopCount}', String(agency.noop_count))
    .replace('{eligible}', String(agency.n_eligible))
    .replace('{noop}', String(noop))
    .replace('{dims}', dimText)
    .replace('{mismatch}', mismatch)
    .replace('{alsoTxt}', alsoTxt)
  return h('span', {
    class: `relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border align-middle ${cls}`,
    title: tip,
    'aria-label': `${localizedLabel}: ${dimText}`,
  }, [
    h(icon, { class: 'h-3.5 w-3.5', 'aria-hidden': 'true' }),
    h('span', {
      class: 'absolute -right-1.5 -top-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-current bg-background px-0.5 text-[9px] font-bold leading-none',
      'aria-hidden': 'true',
    }, String(noop)),
  ])
}

export function modelName(c: any): string {
  if (!c) return '?'
  const id = c.identity
  if (id && id.access === 'local') return c.display || c.model || c.cell || c.profile || '?'
  return (id && id.canonical_model) || c.display || c.model || c.cell || c.profile || '?'
}

export function modelBadges(c: any): VNode | null {
  if (!c || !c.tags) return null
  const t = { ...c.tags }
  delete t.placement // local/cloud already shown by source/machine columns
  return Object.keys(t).length ? sweTagBadges(t) : null
}

export function modelCell(c: any): VNode {
  const { t } = useI18n()
  const nameText = modelName(c)
  const nameKids: VNode[] = [
    h('span', { class: 'profname min-w-0 max-w-full break-words font-mono font-medium leading-snug', title: (c && (c.cell || c.profile || c.model)) || '' }, nameText)
  ]
  if (c && c.source === 'survey-p4c') {
    nameKids.push(
      h('span', {
        class: 'text-[10px] leading-none font-sans px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground font-medium align-middle shrink-0',
        title: t('tip.survey')
      }, t('badge.survey'))
    )
  }
  const name = h('span', { class: 'inline-flex items-center gap-1' }, nameKids)
  const b = modelBadges(c)
  return b ? h('span', { class: 'profcell inline-flex items-center flex-wrap gap-1' }, [name, b]) : name
}

// Org logo helper
const ORG_LOGO: Record<string, string> = {
  'Anthropic': 'anthropic', 'Google': 'google', 'Moonshot': 'moonshot', 'DeepSeek': 'deepseek',
  'MiniMax': 'minimax', 'Xiaomi': 'xiaomi', 'Alibaba': 'alibaba', 'Mistral': 'mistral',
  'Weibo': 'weibo', 'OpenRouter': 'openrouter', 'OpenCode': 'opencode',
  'OpenAI': 'openai', 'xAI': 'xai', 'Z.AI': 'zai'
}

export function logoGlyph(slug: string, title: string, cls = 'w-4.5 h-4.5'): VNode {
  return h('img', {
    // the bundled brand logos are WHITE monochrome SVGs (built for the dark theme).
    // On the light theme they vanish on white → invert them (white→black) for light,
    // keep white for dark.
    class: `orglogo ${cls} object-contain inline-block align-middle opacity-90 invert dark:invert-0`,
    src: `./assets/logos/${slug}.svg`,
    alt: title,
    title,
    loading: 'lazy'
  })
}

export function orgCell(name: string): VNode | string {
  if (!name) return '—'
  const slug = ORG_LOGO[name]
  return slug ? logoGlyph(slug, name) : name
}

type HarnessKind = 'local' | 'thirdPartyCli' | 'directApi'
type HarnessMeta = {
  label: string
  fullName: string
  kind: HarnessKind
  logo?: string
  glyph?: string
}
const HARNESS_META: Record<string, HarnessMeta> = {
  'SWE-personal': { fullName: 'SWE-personal', label: 'SWE local', kind: 'local', glyph: '🖥' },
  'Claude Code': { fullName: 'Claude Code', label: 'Claude', kind: 'thirdPartyCli', logo: 'claude' },
  'OpenCode': { fullName: 'OpenCode', label: 'OpenCode', kind: 'thirdPartyCli', logo: 'opencode' },
  'Antigravity': { fullName: 'Antigravity', label: 'Antigravity', kind: 'thirdPartyCli', logo: 'google' },
  'Gemini CLI': { fullName: 'Gemini CLI', label: 'Gemini', kind: 'thirdPartyCli', logo: 'google' },
  'Codex CLI': { fullName: 'Codex CLI', label: 'Codex', kind: 'thirdPartyCli', logo: 'openai' },
  'Grok CLI': { fullName: 'Grok CLI', label: 'Grok', kind: 'thirdPartyCli', logo: 'xai' },
  'Direct': { fullName: 'Direct', label: 'Direct', kind: 'directApi', glyph: '🔌' },
}

const HARNESS_ALIASES: Record<string, string> = {
  'claude-harness': 'Claude Code',
  'opencode': 'OpenCode',
}

const HARNESS_KIND_TEXT: Record<HarnessKind, string> = {
  local: 'harness.kind.local',
  thirdPartyCli: 'harness.kind.thirdPartyCli',
  directApi: 'harness.kind.directApi'
}

const HARNESS_KIND_BORDER: Record<HarnessKind, string> = {
  local: 'border-sky-500/35 dark:border-sky-400/35',
  thirdPartyCli: 'border-border',
  directApi: 'border-amber-500/40 dark:border-amber-400/40'
}

type Translate = (key: string) => string
export function harnessCell(harness: string, t: Translate = (key: string) => key): VNode | string {
  if (!harness) return '—'
  const normalized = HARNESS_ALIASES[harness] || harness
  const meta = HARNESS_META[normalized]
  if (!meta) {
    return h('span', {
      class: 'inline-flex items-center gap-1.5 h-6 max-w-[8.5rem] rounded-md border border-border bg-background px-2 text-xs font-medium leading-none text-foreground',
      title: harness,
    }, [h('span', { class: 'truncate min-w-0' }, harness)])
  }

  const base = 'inline-flex items-center gap-1.5 h-6 max-w-[8.5rem] rounded-md border bg-background px-2 text-xs font-medium leading-none text-foreground'
  const kindLabel = t(HARNESS_KIND_TEXT[meta.kind])
  const borderClass = HARNESS_KIND_BORDER[meta.kind]
  const glyph = meta.logo
    ? logoGlyph(meta.logo, meta.fullName, 'h-3.5 w-3.5 shrink-0')
    : h('span', { class: 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] leading-none text-muted-foreground/80' }, meta.glyph || '')

  return h(
    'span',
    { class: `${base} ${borderClass}`, title: `${meta.fullName} · ${kindLabel}` },
    [glyph, h('span', { class: 'truncate min-w-0' }, meta.label)]
  )
}

const MACHINE_SHORT: Record<string, string> = {
  'cookys-aimax395': 'z13', 'cookys-gentoo': 'gentoo', 'cookys-cuda': 'cuda',
  'cachyos-max395': 'max395', 'cookys-7840hs': '7840hs', 'mac165s-macbook-pro.local': 'mac'
}
export function machineCell(m: string): VNode | string {
  if (!m) return '—'
  const display = MACHINE_SHORT[m] || m
  return h('span', { class: 'inline-block whitespace-nowrap text-xs border border-border px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono', title: m }, display)
}

export interface UsageScenario {
  label: string
  cls: string
  icon: string
  rank: number
  tip: string
}

const USE_THRESH = { good: 0.50, top: 0.70, fastSec: 300 }
export function usageOf(acc: number | null, sec: number | null): UsageScenario | null {
  const { t } = useI18n()
  if (acc === null) return null
  const good = acc >= USE_THRESH.good
  const fast = sec !== null && sec < USE_THRESH.fastSec
  // Theme-aware, muted badge palette (soft tint + readable saturated text), light + dark.
  // The old classes were dark-only (bg-*-950/20 + text-*-400) → murky + low-contrast on the
  // light theme. These read like calm GitHub labels on both.
  if (!good) return { label: t('usage.lowacc'), cls: 'border-border text-muted-foreground bg-muted/50 dark:bg-muted/20', icon: '⚠', rank: 3, tip: t('usage.tip.lowacc') }
  if (fast && acc >= USE_THRESH.top) return { label: t('usage.allround'), cls: 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:bg-emerald-950/30', icon: '🏆', rank: 0, tip: t('usage.tip.allround') }
  if (fast) return { label: t('usage.pair'), cls: 'border-brand/40 text-brand bg-brand/10 dark:border-brand/40 dark:text-brand dark:bg-brand/20', icon: '🤝', rank: 1, tip: t('usage.tip.pair') }
  return { label: t('usage.background'), cls: 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:bg-amber-950/30', icon: '🤖', rank: 2, tip: t('usage.tip.background') }
}
