'use client'

import { useCallback, useEffect, useState } from 'react'
import { getLocalDateKey } from '@/lib/dates'
import { ARCHETYPE_DEFAULTS } from './archetypes'
import { loadBrandFromSupabase, mirrorBrandToSupabase } from './sync'
import type {
  Archetype,
  Brand,
  BrandAccount,
  BrandFinance,
  BrandGoal,
  BrandKpi,
  BrandLink,
  BrandMoneyEntry,
  BrandMoneyKind,
  BrandMoneyPeriod,
  BrandState,
  BrandUpload,
  KpiSnapshot,
  CadencePeriod,
  CadenceTarget,
  CadenceUnit,
  Platform,
  ProductionLinks,
  Schedule,
  ScheduleDeadline,
  UploadRating,
} from './types'

const LS_KEY = 'vitality_brand_v1'

/**
 * Upper bound on per-account follower history. ~200 entries lets us
 * cover daily refreshes for ~6 months without bloating localStorage.
 */
const MAX_HISTORY = 200

const DEFAULT_STATE: BrandState = { version: 1, brands: [] }

function normalize(parsed: unknown): BrandState {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE
  const p = parsed as Partial<BrandState>
  return {
    version: 1,
    brands: Array.isArray(p.brands) ? p.brands.map(normalizeBrand) : [],
  }
}

function normalizeBrand(b: unknown): Brand {
  const raw = (b ?? {}) as Partial<Brand> & { cadence?: unknown; log?: unknown }

  // --- Schedules: use saved list, else migrate the old single cadence ---
  let schedules: Schedule[]
  if (Array.isArray(raw.schedules)) {
    schedules = raw.schedules
      .map(normalizeSchedule)
      .filter((s): s is Schedule => s !== null)
    if (schedules.length === 0) schedules = [scheduleFromCadence(raw.cadence)]
  } else {
    schedules = [scheduleFromCadence(raw.cadence)]
  }

  // --- Log: nested (scheduleId → dateKey → count) is current shape.
  // A legacy flat log (dateKey → count) is migrated under the first
  // schedule's id. Idempotent: once saved it's nested forever after. ---
  const log = migrateLog(raw.log, schedules[0].id)

  const uploads = Array.isArray(raw.uploads)
    ? raw.uploads.map(normalizeUpload).filter((u): u is BrandUpload => u !== null)
    : []
  const production = normalizeProduction(raw.production)
  const packReads = normalizePackReads((raw as { packReads?: unknown }).packReads)
  const finance = normalizeFinance((raw as { finance?: unknown }).finance)

  // Post links are per-account now (each social keeps its own ordered set).
  // Legacy brand-wide links predate accountId, so they fall out of the
  // per-account view; each account seeds its own platform destination on first
  // focus instead. New links carry the focused account's id.
  const accounts: BrandAccount[] = Array.isArray(raw.accounts) ? (raw.accounts as BrandAccount[]) : []
  const links: BrandLink[] = Array.isArray(raw.links) ? (raw.links as BrandLink[]) : []

  return {
    id: typeof raw.id === 'string' ? raw.id : newId('b'),
    name: typeof raw.name === 'string' ? raw.name : 'Untitled brand',
    archetype: isArchetype(raw.archetype) ? raw.archetype : 'other',
    blurb: typeof raw.blurb === 'string' ? raw.blurb : '',
    emoji: typeof raw.emoji === 'string' ? raw.emoji : '✦',
    ...(typeof raw.heroAvatarAccountId === 'string' ? { heroAvatarAccountId: raw.heroAvatarAccountId } : {}),
    ...(raw.heroGraph === true ? { heroGraph: true } : {}),
    accounts,
    // New fields default to []/undefined for forward-compat with pre-v2
    // brands that don't have them yet. Migration is implicit.
    links,
    kpis: Array.isArray(raw.kpis)
      ? raw.kpis.map(normalizeKpi).filter((k): k is BrandKpi => k !== null)
      : [],
    goals: Array.isArray((raw as { goals?: unknown }).goals)
      ? ((raw as { goals: unknown[] }).goals).map(normalizeGoal).filter((g): g is BrandGoal => g !== null)
      : [],
    dailyActionLabel: typeof raw.dailyActionLabel === 'string' ? raw.dailyActionLabel : undefined,
    uploads,
    ...(production ? { production } : {}),
    ...(packReads ? { packReads } : {}),
    ...(finance ? { finance } : {}),
    schedules,
    log,
    lastReflection: typeof raw.lastReflection === 'string' ? raw.lastReflection : '',
    lastReflectionAt: typeof raw.lastReflectionAt === 'string' ? raw.lastReflectionAt : null,
    ...(typeof raw.lastInsight === 'string' ? { lastInsight: raw.lastInsight } : {}),
    ...(typeof raw.lastInsightAt === 'string' ? { lastInsightAt: raw.lastInsightAt } : {}),
    archived: !!raw.archived,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  }
}

function normalizeDeadline(raw: unknown): ScheduleDeadline | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const d = raw as Partial<ScheduleDeadline>
  if (typeof d.minutes !== 'number' || !Number.isFinite(d.minutes)) return undefined
  const minutes = Math.max(0, Math.min(1439, Math.round(d.minutes)))
  return typeof d.weekday === 'number'
    ? { minutes, weekday: ((Math.round(d.weekday) % 7) + 7) % 7 }
    : { minutes }
}

function normalizeSchedule(raw: unknown): Schedule | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<Schedule>
  if (typeof s.unit !== 'string') return null
  if (s.period !== 'daily' && s.period !== 'weekly') return null
  const deadline = normalizeDeadline(s.deadline)
  return {
    id: typeof s.id === 'string' ? s.id : newId('sch'),
    label: typeof s.label === 'string' && s.label.trim()
      ? s.label
      : defaultScheduleLabel(s.period, s.unit as CadenceUnit),
    unit: s.unit as CadenceUnit,
    target: typeof s.target === 'number' && s.target > 0 ? Math.round(s.target) : 1,
    period: s.period,
    ...(typeof s.platform === 'string' ? { platform: s.platform as Platform } : {}),
    ...(deadline ? { deadline } : {}),
    ...(typeof s.actionLabel === 'string' ? { actionLabel: s.actionLabel } : {}),
    ...(typeof s.goals === 'string' ? { goals: s.goals } : {}),
    ...(typeof s.script === 'string' ? { script: s.script } : {}),
  }
}

function defaultScheduleLabel(period: CadencePeriod, unit: CadenceUnit): string {
  return `${period === 'daily' ? 'Daily' : 'Weekly'} ${unit}`
}

/** Build a single schedule from a legacy `cadence` object (or defaults). */
function scheduleFromCadence(raw: unknown): Schedule {
  const c: CadenceTarget = isCadence(raw)
    ? raw
    : { target: 1, unit: 'posts', period: 'daily' }
  return {
    id: newId('sch'),
    label: defaultScheduleLabel(c.period, c.unit),
    unit: c.unit,
    target: c.target,
    period: c.period,
  }
}

/**
 * Demo accounts seeded into a fresh CREATOR brand so the dashboard lands fully
 * populated (a working example) instead of blank. Placeholder handles signal
 * "replace me"; the sample growth gives the cards/ticker/graph real-looking
 * trends. Only used when a creator brand is made with no accounts of its own.
 */
function demoCreatorAccounts(): BrandAccount[] {
  const now = Date.now()
  const at = (weeksAgo: number) => new Date(now - weeksAgo * 7 * 86_400_000).toISOString()
  const mk = (platform: Platform, handle: string, counts: number[]): BrandAccount => ({
    id: newId('a'),
    platform,
    handle,
    followers: counts[counts.length - 1],
    lastUpdated: new Date(now).toISOString(),
    history: counts.map((count, i) => ({ at: at(counts.length - 1 - i), count })),
  })
  return [
    mk('tiktok', '@your_tiktok', [9800, 11200, 12400]),
    mk('instagram', '@your_instagram', [7600, 8100, 8600]),
    mk('youtube', 'Your Channel', [4200, 4800, 5300]),
  ]
}

/** Migrate any saved `log` shape to the nested scheduleId → dateKey form. */
function migrateLog(raw: unknown, firstScheduleId: string): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== 'object') return {}
  const values = Object.values(raw as Record<string, unknown>)
  if (values.length === 0) return {}
  const isNested = values.every(v => v !== null && typeof v === 'object')
  if (isNested) return raw as Record<string, Record<string, number>>
  // Legacy flat log (dateKey → number): bucket under the first schedule.
  return { [firstScheduleId]: raw as Record<string, number> }
}

/**
 * Coerce a stored KPI into a valid shape. New fields (`target`,
 * `history`) default to absent for back-compat with pre-history metrics;
 * a malformed history is filtered to valid snapshots and bounded so a bad
 * localStorage blob can't break the chart.
 */
function normalizeKpi(raw: unknown): BrandKpi | null {
  if (!raw || typeof raw !== 'object') return null
  const k = raw as Partial<BrandKpi>
  if (typeof k.label !== 'string') return null
  const history = Array.isArray(k.history)
    ? k.history
        .filter((s): s is KpiSnapshot =>
          !!s && typeof s === 'object'
          && typeof (s as KpiSnapshot).at === 'string'
          && typeof (s as KpiSnapshot).value === 'number'
          && Number.isFinite((s as KpiSnapshot).value))
        .slice(-MAX_HISTORY)
    : undefined
  return {
    id: typeof k.id === 'string' ? k.id : newId('k'),
    label: k.label,
    value: typeof k.value === 'number' && Number.isFinite(k.value) ? k.value : 0,
    unit: typeof k.unit === 'string' ? k.unit : '',
    ...(typeof k.target === 'number' && Number.isFinite(k.target) ? { target: k.target } : {}),
    ...(history && history.length ? { history } : {}),
  }
}

/** Coerce a stored goal into a valid shape (drops untitled goals). */
function normalizeGoal(raw: unknown): BrandGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Partial<BrandGoal>
  if (typeof g.title !== 'string' || !g.title.trim()) return null
  return {
    id: typeof g.id === 'string' ? g.id : newId('g'),
    title: g.title,
    ...(typeof g.note === 'string' && g.note.trim() ? { note: g.note } : {}),
    ...(typeof g.due === 'string' && g.due.trim() ? { due: g.due } : {}),
    done: !!g.done,
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
    ...(typeof g.completedAt === 'string' ? { completedAt: g.completedAt } : {}),
  }
}

/** Coerce a stored upload into a valid shape (drops entries with no date). */
function normalizeUpload(raw: unknown): BrandUpload | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Partial<BrandUpload>
  if (typeof u.postedAt !== 'string' || !u.postedAt.trim()) return null
  const rating: UploadRating | undefined =
    u.rating === 'green' || u.rating === 'yellow' || u.rating === 'red' ? u.rating : undefined
  return {
    id: typeof u.id === 'string' ? u.id : newId('up'),
    platform: typeof u.platform === 'string' ? (u.platform as Platform) : 'youtube',
    title: typeof u.title === 'string' ? u.title : '',
    ...(typeof u.url === 'string' && u.url.trim() ? { url: u.url.trim() } : {}),
    postedAt: u.postedAt,
    ...(rating ? { rating } : {}),
    ...(typeof u.note === 'string' && u.note.trim() ? { note: u.note } : {}),
  }
}

/** Coerce stored pipeline links; returns undefined when all three are empty. */
function normalizeProduction(raw: unknown): ProductionLinks | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Partial<ProductionLinks>
  const out: ProductionLinks = {}
  if (typeof p.scriptUrl === 'string' && p.scriptUrl.trim()) out.scriptUrl = p.scriptUrl.trim()
  if (typeof p.editUrl === 'string' && p.editUrl.trim()) out.editUrl = p.editUrl.trim()
  if (typeof p.uploadUrl === 'string' && p.uploadUrl.trim()) out.uploadUrl = p.uploadUrl.trim()
  return Object.keys(out).length ? out : undefined
}

/** Coerce stored per-pack reads; drops empties. */
function normalizePackReads(raw: unknown): Record<string, { text: string; at: string }> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, { text: string; at: string }> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const text = (v as { text?: unknown }).text
      const at = (v as { at?: unknown }).at
      if (typeof text === 'string' && text.trim()) {
        out[k] = { text, at: typeof at === 'string' ? at : new Date().toISOString() }
      }
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** Coerce stored per-brand money; drops malformed entries. */
function normalizeFinance(raw: unknown): BrandFinance | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const f = raw as Partial<BrandFinance>
  const entries: BrandMoneyEntry[] = Array.isArray(f.entries)
    ? f.entries
        .map((e): BrandMoneyEntry | null => {
          if (!e || typeof e !== 'object') return null
          const r = e as Partial<BrandMoneyEntry>
          if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) return null
          const kind: BrandMoneyKind = r.kind === 'in' ? 'in' : 'out'
          const period: BrandMoneyPeriod =
            r.period === 'monthly' || r.period === 'yearly' ? r.period : 'once'
          return {
            id: typeof r.id === 'string' ? r.id : newId('mny'),
            name: typeof r.name === 'string' ? r.name : '',
            amount: Math.abs(r.amount),
            kind,
            period,
            at: typeof r.at === 'string' && r.at.trim() ? r.at : getLocalDateKey(),
            ...(typeof r.financeId === 'string' && r.financeId ? { financeId: r.financeId } : {}),
          }
        })
        .filter((e): e is BrandMoneyEntry => e !== null)
    : []
  if (!entries.length) return undefined
  return {
    currency: typeof f.currency === 'string' && f.currency.trim() ? f.currency.trim() : '$',
    entries,
  }
}

function isArchetype(v: unknown): v is Archetype {
  return v === 'creator'
    || v === 'shop'
    || v === 'service'
    || v === 'channel'
    || v === 'product'
    || v === 'construction'
    || v === 'restaurant'
    || v === 'other'
}

function isCadence(v: unknown): v is CadenceTarget {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<CadenceTarget>
  return typeof c.target === 'number'
    && typeof c.unit === 'string'
    && (c.period === 'daily' || c.period === 'weekly')
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function load(): BrandState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    return normalize(JSON.parse(raw))
  } catch {
    return DEFAULT_STATE
  }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface NewBrandInput {
  name: string
  archetype: Archetype
  blurb: string
  emoji?: string
  /** One or more posting schedules; defaults to the archetype's. */
  schedules?: Array<Omit<Schedule, 'id'>>
  dailyActionLabel?: string
  /**
   * One or more pre-filled accounts (e.g. from the AI intake or
   * template chips). Each entry's handle is optional — empty handles
   * are dropped before save, so unused slots don't pollute the brand.
   */
  accounts?: Array<{ platform: Platform; handle?: string }>
  /** Labeled links pre-filled by the template; user can edit later. */
  links?: Array<{ label: string; url?: string }>
  /** KPI placeholders from the template; user edits values. */
  kpis?: Array<{ label: string; unit: string; value?: number }>
}

export interface BrandActions {
  createBrand: (input: NewBrandInput) => string  // returns new id
  copySocialFrom: (targetId: string, sourceId: string) => void
  updateBrand: (id: string, patch: Partial<Pick<Brand, 'name' | 'blurb' | 'offer' | 'customer' | 'emoji' | 'archetype' | 'dailyActionLabel'>>) => void
  archiveBrand: (id: string) => void
  unarchiveBrand: (id: string) => void
  deleteBrand: (id: string) => void

  // Schedules
  addSchedule: (brandId: string, schedule?: Partial<Omit<Schedule, 'id'>>) => void
  updateSchedule: (brandId: string, scheduleId: string, patch: Partial<Omit<Schedule, 'id'>>) => void
  removeSchedule: (brandId: string, scheduleId: string) => void

  // Daily logging
  logScheduled: (brandId: string, scheduleId: string, delta?: number) => void
  /** Logs the brand's primary (first) schedule — used by the list card. */
  logShipped: (id: string, delta?: number) => void

  // Accounts
  addAccount: (brandId: string, platform: Platform, handle: string, followers?: number | null) => void
  updateAccount: (brandId: string, accountId: string, patch: Partial<Pick<BrandAccount, 'platform' | 'handle' | 'followers' | 'avatarUrl' | 'lifetimeViews' | 'videoCount'>>) => void
  /** Merge freshly-read post dates into an account (union + dedupe + cap),
   *  updating its "last posted" stamp. Drives the content calendar. */
  setAccountPosts: (brandId: string, accountId: string, dates: string[], lastPostedAt?: string | null) => void
  removeAccount: (brandId: string, accountId: string) => void

  // Links
  addLink: (brandId: string, label: string, url: string, accountId?: string) => void
  updateLink: (brandId: string, linkId: string, patch: Partial<Pick<BrandLink, 'label' | 'url'>>) => void
  removeLink: (brandId: string, linkId: string) => void
  moveLink: (brandId: string, linkId: string, dir: -1 | 1) => void
  reorderLink: (brandId: string, linkId: string, toIndex: number) => void
  setHeroAvatar: (brandId: string, accountId: string | null) => void
  setHeroGraph: (brandId: string, on: boolean) => void

  // KPIs
  addKpi: (brandId: string, label: string, unit?: string) => void
  updateKpi: (brandId: string, kpiId: string, patch: Partial<Pick<BrandKpi, 'label' | 'value' | 'unit' | 'target'>>) => void
  removeKpi: (brandId: string, kpiId: string) => void
  importKpis: (brandId: string, metrics: Array<{ label: string; value: number; unit?: string }>) => void

  // Goals (business milestones with optional due-date timers)
  addGoal: (brandId: string, title: string, due?: string, note?: string) => void
  updateGoal: (brandId: string, goalId: string, patch: Partial<Pick<BrandGoal, 'title' | 'due' | 'note'>>) => void
  toggleGoal: (brandId: string, goalId: string) => void
  removeGoal: (brandId: string, goalId: string) => void

  // Uploads (shipped content, overlaid on the social chart by timing)
  addUpload: (brandId: string, input: { platform: Platform; title: string; url?: string; postedAt?: string; rating?: UploadRating }) => void
  updateUpload: (brandId: string, uploadId: string, patch: Partial<Pick<BrandUpload, 'platform' | 'title' | 'url' | 'postedAt' | 'rating' | 'note'>>) => void
  removeUpload: (brandId: string, uploadId: string) => void

  // Production pipeline quick-links (script · edit · upload)
  setProductionLink: (brandId: string, step: keyof ProductionLinks, url: string) => void

  // Per-pack saved AI reads (the qualitative Claude Chrome data)
  setPackRead: (brandId: string, packId: string, text: string) => void

  // Money in/out (the per-brand P&L behind the Money button)
  addMoneyEntry: (brandId: string, input: { name: string; amount: number; kind: BrandMoneyKind; period: BrandMoneyPeriod; at?: string; financeId?: string }) => void
  updateMoneyEntry: (brandId: string, entryId: string, patch: Partial<Pick<BrandMoneyEntry, 'name' | 'amount' | 'kind' | 'period' | 'at' | 'financeId'>>) => void
  removeMoneyEntry: (brandId: string, entryId: string) => void
  /** Set the brand's money display currency symbol (matched to Finance on sync). */
  setMoneyCurrency: (brandId: string, currency: string) => void

  // Reflection
  setReflection: (id: string, text: string) => void

  // AI business read (cached from /api/brand/insight)
  setInsight: (id: string, text: string) => void
}

export function useBrandState() {
  const [state, setState] = useState<BrandState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  // True once we've ATTEMPTED the Supabase load-back. The mirror is gated on
  // this so we never push the local copy up before pulling the authoritative
  // server copy down (which would clobber another device's newer edits).
  const [hydrated, setHydrated] = useState(false)
  // Re-derives the active date key on a 1 min tick so the daily log
  // bucket flips at midnight without needing a refresh.
  const [dateKey, setDateKey] = useState(() => getLocalDateKey())

  useEffect(() => {
    // 1) localStorage first — instant render, no blank flash, offline-safe.
    setState(load())
    setReady(true)
    // 2) Then pull the durable Supabase copy. It's the source of truth across
    //    devices, so a non-empty server state wins. An empty/missing row never
    //    wipes good local data (the mirror below seeds it from local instead).
    let cancelled = false
    void (async () => {
      const raw = await loadBrandFromSupabase()
      if (cancelled) return
      const server = raw ? normalize(raw) : null
      if (server && server.brands.length > 0) setState(server)
      setHydrated(true)
    })()
    const id = setInterval(() => setDateKey(getLocalDateKey()), 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      // localStorage full or disabled — fail quiet
    }
  }, [state, ready])

  // Mirror to Supabase (durable + MCP-readable + cross-device source of truth).
  // Debounced + best-effort; localStorage above stays the primary client store.
  // Gated on `hydrated` so the first write happens AFTER the load-back, seeding
  // the server from local only when there was nothing to pull. See ./sync.ts.
  useEffect(() => {
    if (!ready || !hydrated) return
    const t = setTimeout(() => { void mirrorBrandToSupabase(state) }, 1200)
    return () => clearTimeout(t)
  }, [state, ready, hydrated])

  const createBrand = useCallback((input: NewBrandInput): string => {
    const defaults = ARCHETYPE_DEFAULTS[input.archetype]
    const id = newId('b')
    setState(prev => {
      // Accounts: trim handles, drop entries with empty handles so the
      // brand doesn't show ghost rows with no value.
      const provided: BrandAccount[] = (input.accounts ?? [])
        .map(a => ({ platform: a.platform, handle: (a.handle ?? '').trim() }))
        .filter(a => a.handle.length > 0)
        .map(a => ({
          id: newId('a'),
          platform: a.platform,
          handle: a.handle,
          followers: null,
          lastUpdated: null,
        }))

      // A fresh creator brand with no accounts lands as a populated demo.
      const accounts: BrandAccount[] =
        provided.length === 0 && input.archetype === 'creator'
          ? demoCreatorAccounts()
          : provided

      // Links: keep all labeled slots (user filled them or not) so they
      // appear as placeholders on the detail page, ready to receive a URL.
      const links: BrandLink[] = (input.links ?? []).map(l => ({
        id: newId('l'),
        label: l.label.trim(),
        url: (l.url ?? '').trim(),
        ...(accounts[0]?.id ? { accountId: accounts[0].id } : {}),
      }))

      const kpis: BrandKpi[] = (input.kpis ?? []).map(k => ({
        id: newId('k'),
        label: k.label.trim(),
        unit: k.unit ?? '',
        value: typeof k.value === 'number' ? k.value : 0,
      }))

      // Schedules: take the input list (AI/template) or the archetype
      // defaults, and stamp each with a fresh id.
      const schedules: Schedule[] = (input.schedules ?? defaults.schedules)
        .map(s => ({ ...s, id: newId('sch') }))

      const brand: Brand = {
        id,
        name: input.name.trim() || 'Untitled brand',
        archetype: input.archetype,
        blurb: input.blurb.trim(),
        emoji: input.emoji?.trim() || defaults.emoji,
        accounts,
        links,
        kpis,
        goals: [],
        uploads: [],
        schedules,
        dailyActionLabel: input.dailyActionLabel ?? defaults.dailyActionLabel,
        log: {},
        lastReflection: '',
        lastReflectionAt: null,
        archived: false,
        createdAt: new Date().toISOString(),
      }
      return { ...prev, brands: [...prev.brands, brand] }
    })
    return id
  }, [])

  /** Copy another brand's social setup (accounts + post links) into this one.
   *  Appends, dedupes accounts by platform+handle, and remaps each copied
   *  link to its new account. Generic: works for any source/target brand. */
  const copySocialFrom = useCallback((targetId: string, sourceId: string) => {
    if (!targetId || !sourceId || targetId === sourceId) return
    setState(prev => {
      const source = prev.brands.find(b => b.id === sourceId)
      if (!source) return prev
      return {
        ...prev,
        brands: prev.brands.map(b => {
          if (b.id !== targetId) return b
          const existing = new Set(b.accounts.map(a => accountKey(a.platform, a.handle)))
          const idMap = new Map<string, string>()
          const newAccounts: BrandAccount[] = []
          for (const a of source.accounts) {
            if (existing.has(accountKey(a.platform, a.handle))) continue
            const nid = newId('a')
            idMap.set(a.id, nid)
            newAccounts.push({ ...a, id: nid })
          }
          const fallbackAcct = newAccounts[0]?.id ?? b.accounts[0]?.id
          const newLinks: BrandLink[] = source.links.map(l => ({
            ...l,
            id: newId('l'),
            ...((l.accountId && idMap.get(l.accountId)) || fallbackAcct
              ? { accountId: (l.accountId && idMap.get(l.accountId)) || fallbackAcct }
              : {}),
          }))
          return { ...b, accounts: [...b.accounts, ...newAccounts], links: [...b.links, ...newLinks] }
        }),
      }
    })
  }, [])

  const updateBrand = useCallback((id: string, patch: Partial<Pick<Brand, 'name' | 'blurb' | 'offer' | 'customer' | 'emoji' | 'archetype' | 'dailyActionLabel'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id === id ? { ...b, ...patch } : b),
    }))
  }, [])

  const addSchedule = useCallback((brandId: string, schedule: Partial<Omit<Schedule, 'id'>> = {}) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const period: CadencePeriod = schedule.period === 'weekly' ? 'weekly' : 'daily'
        const unit: CadenceUnit = (schedule.unit as CadenceUnit) ?? 'posts'
        const next: Schedule = {
          id: newId('sch'),
          label: schedule.label?.trim() || `${period === 'daily' ? 'Daily' : 'Weekly'} ${unit}`,
          unit,
          target: Math.max(1, Math.round(schedule.target ?? 1)),
          period,
          ...(schedule.platform ? { platform: schedule.platform } : {}),
          ...(schedule.deadline ? { deadline: schedule.deadline } : {}),
          ...(schedule.actionLabel ? { actionLabel: schedule.actionLabel } : {}),
        }
        return { ...b, schedules: [...b.schedules, next] }
      }),
    }))
  }, [])

  const updateSchedule = useCallback((brandId: string, scheduleId: string, patch: Partial<Omit<Schedule, 'id'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          schedules: b.schedules.map(s => s.id === scheduleId ? { ...s, ...patch } : s),
        }
      }),
    }))
  }, [])

  const removeSchedule = useCallback((brandId: string, scheduleId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        // Keep at least one schedule — the list card + logShipped assume
        // a primary schedule exists.
        if (b.schedules.length <= 1) return b
        const log = { ...b.log }
        delete log[scheduleId]
        return { ...b, schedules: b.schedules.filter(s => s.id !== scheduleId), log }
      }),
    }))
  }, [])

  const archiveBrand = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id === id ? { ...b, archived: true } : b),
    }))
  }, [])

  const unarchiveBrand = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id === id ? { ...b, archived: false } : b),
    }))
  }, [])

  const deleteBrand = useCallback((id: string) => {
    setState(prev => ({ ...prev, brands: prev.brands.filter(b => b.id !== id) }))
  }, [])

  const logScheduled = useCallback((brandId: string, scheduleId: string, delta: number = 1) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        if (!b.schedules.some(s => s.id === scheduleId)) return b
        const key = getLocalDateKey()
        const bucket = { ...(b.log[scheduleId] || {}) }
        const next = Math.max(0, (bucket[key] || 0) + delta)
        if (next === 0) delete bucket[key]
        else bucket[key] = next
        return { ...b, log: { ...b.log, [scheduleId]: bucket } }
      }),
    }))
  }, [])

  // Thin wrapper used by the list card, which has a single +button:
  // logs the brand's primary (first) schedule.
  const logShipped = useCallback((id: string, delta: number = 1) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== id) return b
        const sid = b.schedules[0]?.id
        if (!sid) return b
        const key = getLocalDateKey()
        const bucket = { ...(b.log[sid] || {}) }
        const next = Math.max(0, (bucket[key] || 0) + delta)
        if (next === 0) delete bucket[key]
        else bucket[key] = next
        return { ...b, log: { ...b.log, [sid]: bucket } }
      }),
    }))
  }, [])

  const addAccount = useCallback((brandId: string, platform: Platform, handle: string, followers: number | null = null) => {
    const trimmed = handle.trim()
    if (!trimmed) return
    const key = accountKey(platform, trimmed)
    const hasCount = typeof followers === 'number' && Number.isFinite(followers)
    const now = new Date().toISOString()
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        // Don't add the same channel twice to one brand (dedupe by
        // normalised platform + handle).
        if (b.accounts.some(a => accountKey(a.platform, a.handle) === key)) return b
        return {
          ...b,
          accounts: [
            ...b.accounts,
            {
              id: newId('a'),
              platform,
              handle: trimmed,
              followers: hasCount ? followers : null,
              lastUpdated: hasCount ? now : null,
              // Seed a first history point so the trend can start building.
              ...(hasCount ? { history: [{ at: now, count: followers }] } : {}),
            },
          ],
        }
      }),
    }))
  }, [])

  const updateAccount = useCallback((brandId: string, accountId: string, patch: Partial<Pick<BrandAccount, 'platform' | 'handle' | 'followers' | 'avatarUrl' | 'lifetimeViews' | 'videoCount'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          accounts: b.accounts.map(a => {
            if (a.id !== accountId) return a
            const next: BrandAccount = { ...a, ...patch }
            // Any change to follower count is a fresh data point: stamp
            // lastUpdated and append a snapshot. The snapshot now carries
            // followers + lifetime views + video count together, so a
            // single history array drives every sparkline + delta on the
            // brand detail page.
            //
            // Dedupe: if every metric matches the last snapshot, skip
            // (a redundant refresh that returned the same numbers
            // shouldn't bloat the series).
            if (patch.followers !== undefined && patch.followers !== null) {
              next.lastUpdated = new Date().toISOString()
              const history = Array.isArray(a.history) ? [...a.history] : []
              const last = history[history.length - 1]
              const views = patch.lifetimeViews !== undefined
                ? patch.lifetimeViews
                : a.lifetimeViews
              const videos = patch.videoCount !== undefined
                ? patch.videoCount
                : a.videoCount
              const same = last
                && last.count === patch.followers
                && last.views === views
                && last.videos === videos
              if (!same) {
                history.push({
                  at: next.lastUpdated,
                  count: patch.followers,
                  ...(typeof views === 'number' ? { views } : {}),
                  ...(typeof videos === 'number' ? { videos } : {}),
                })
                // Keep the series bounded so localStorage stays small.
                if (history.length > MAX_HISTORY) {
                  history.splice(0, history.length - MAX_HISTORY)
                }
                next.history = history
              }
            }
            return next
          }),
        }
      }),
    }))
  }, [])

  const setAccountPosts = useCallback((brandId: string, accountId: string, dates: string[], lastPostedAt?: string | null) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          accounts: b.accounts.map(a => {
            if (a.id !== accountId) return a
            // Union new dates with what we already have, normalize to
            // YYYY-MM-DD, drop anything malformed, sort newest-first, and cap
            // so localStorage stays small (~1yr+ of daily posting).
            const merged = Array.from(new Set(
              [...(a.postDates ?? []), ...dates]
                .map(d => (d ?? '').slice(0, 10))
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)),
            )).sort((x, y) => (x < y ? 1 : -1)).slice(0, 400)
            const newest = merged[0]
            // Prefer an explicit ISO stamp; else derive midday-local from the
            // newest date; else keep whatever we had.
            const last = lastPostedAt ?? (newest ? `${newest}T12:00:00` : (a.lastPostedAt ?? null))
            return { ...a, postDates: merged, lastPostedAt: last }
          }),
        }
      }),
    }))
  }, [])

  const removeAccount = useCallback((brandId: string, accountId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return { ...b, accounts: b.accounts.filter(a => a.id !== accountId) }
      }),
    }))
  }, [])

  // --- Links ----------------------------------------------------------------

  const addLink = useCallback((brandId: string, label: string, url: string, accountId?: string) => {
    const trimmedLabel = label.trim()
    const trimmedUrl = url.trim()
    if (!trimmedLabel && !trimmedUrl) return
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          links: [
            ...b.links,
            { id: newId('l'), label: trimmedLabel || 'Untitled link', url: trimmedUrl, ...(accountId ? { accountId } : {}) },
          ],
        }
      }),
    }))
  }, [])

  const updateLink = useCallback((brandId: string, linkId: string, patch: Partial<Pick<BrandLink, 'label' | 'url'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          links: b.links.map(l => l.id === linkId ? { ...l, ...patch } : l),
        }
      }),
    }))
  }, [])

  const removeLink = useCallback((brandId: string, linkId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return { ...b, links: b.links.filter(l => l.id !== linkId) }
      }),
    }))
  }, [])

  /** Reorder a link by swapping it with its neighbour (dir: -1 up, +1 down),
   *  scoped to the same account so each social's post links reorder on their
   *  own without disturbing other accounts' links. */
  const moveLink = useCallback((brandId: string, linkId: string, dir: -1 | 1) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const link = b.links.find(l => l.id === linkId)
        if (!link) return b
        const scope = b.links.filter(l => l.accountId === link.accountId)
        const si = scope.findIndex(l => l.id === linkId)
        const sj = si + dir
        if (sj < 0 || sj >= scope.length) return b
        ;[scope[si], scope[sj]] = [scope[sj], scope[si]]
        let k = 0
        const links = b.links.map(l => (l.accountId === link.accountId ? scope[k++] : l))
        return { ...b, links }
      }),
    }))
  }, [])

  /** Choose which account's avatar fades behind the hero (null → back to emoji).
   *  Mutually exclusive with the animated graph. */
  const setHeroAvatar = useCallback((brandId: string, accountId: string | null) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b =>
        b.id === brandId ? { ...b, heroAvatarAccountId: accountId ?? undefined, heroGraph: accountId ? false : b.heroGraph } : b,
      ),
    }))
  }, [])

  /** Toggle the animated combined-growth graph behind the hero. Clears the
   *  avatar backdrop when turned on (mutually exclusive). */
  const setHeroGraph = useCallback((brandId: string, on: boolean) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b =>
        b.id === brandId ? { ...b, heroGraph: on, heroAvatarAccountId: on ? undefined : b.heroAvatarAccountId } : b,
      ),
    }))
  }, [])

  /** Move a link to an arbitrary slot (drag-and-drop reorder). `toIndex` is the
   *  target position WITHIN the link's own account scope, so dragging only
   *  reorders that social's post links. */
  const reorderLink = useCallback((brandId: string, linkId: string, toIndex: number) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const link = b.links.find(l => l.id === linkId)
        if (!link) return b
        const scope = b.links.filter(l => l.accountId === link.accountId)
        const from = scope.findIndex(l => l.id === linkId)
        if (from < 0) return b
        const [moved] = scope.splice(from, 1)
        const clamped = Math.max(0, Math.min(toIndex, scope.length))
        scope.splice(clamped, 0, moved)
        let k = 0
        const links = b.links.map(l => (l.accountId === link.accountId ? scope[k++] : l))
        return { ...b, links }
      }),
    }))
  }, [])

  // --- KPIs -----------------------------------------------------------------

  const addKpi = useCallback((brandId: string, label: string, unit: string = '') => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) return
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          kpis: [
            ...b.kpis,
            { id: newId('k'), label: trimmedLabel, value: 0, unit },
          ],
        }
      }),
    }))
  }, [])

  const updateKpi = useCallback((brandId: string, kpiId: string, patch: Partial<Pick<BrandKpi, 'label' | 'value' | 'unit' | 'target'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          kpis: b.kpis.map(k => {
            if (k.id !== kpiId) return k
            const next: BrandKpi = { ...k, ...patch }
            // A committed value change is a fresh datapoint — append a
            // snapshot (deduped vs the last one) so the metric charts over
            // time. The value input commits on blur (KpiEditRow), not per
            // keystroke, so this doesn't bloat the series with intermediate
            // digits. Mirrors the follower-history append in updateAccount.
            if (patch.value !== undefined && typeof patch.value === 'number') {
              const history = Array.isArray(k.history) ? [...k.history] : []
              const last = history[history.length - 1]
              if (!last || last.value !== patch.value) {
                history.push({ at: new Date().toISOString(), value: patch.value })
                if (history.length > MAX_HISTORY) {
                  history.splice(0, history.length - MAX_HISTORY)
                }
                next.history = history
              }
            }
            return next
          }),
        }
      }),
    }))
  }, [])

  const removeKpi = useCallback((brandId: string, kpiId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return { ...b, kpis: b.kpis.filter(k => k.id !== kpiId) }
      }),
    }))
  }, [])

  // Ingest metrics auto-pulled from a public URL (/api/brand/pull-metrics).
  // Matches each by case-insensitive label: existing metric → update its value
  // (appending a history snapshot, same as updateKpi) and backfill a missing
  // unit; new label → create it seeded with one snapshot. Idempotent re-pulls
  // of an unchanged number are no-ops.
  const importKpis = useCallback((brandId: string, metrics: Array<{ label: string; value: number; unit?: string }>) => {
    if (!metrics.length) return
    const stamp = new Date().toISOString()
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const kpis = [...b.kpis]
        for (const m of metrics) {
          const label = m.label.trim()
          if (!label || !Number.isFinite(m.value)) continue
          const unit = (m.unit ?? '').trim()
          const idx = kpis.findIndex(k => k.label.trim().toLowerCase() === label.toLowerCase())
          if (idx >= 0) {
            const k = kpis[idx]
            const nextUnit = k.unit || unit
            if (k.value === m.value && nextUnit === k.unit) continue
            const history = Array.isArray(k.history) ? [...k.history] : []
            const last = history[history.length - 1]
            if (!last || last.value !== m.value) {
              history.push({ at: stamp, value: m.value })
              if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
            }
            kpis[idx] = { ...k, value: m.value, unit: nextUnit, history }
          } else {
            kpis.push({ id: newId('k'), label, value: m.value, unit, history: [{ at: stamp, value: m.value }] })
          }
        }
        return { ...b, kpis }
      }),
    }))
  }, [])

  // --- Goals ----------------------------------------------------------------

  const addGoal = useCallback((brandId: string, title: string, due?: string, note?: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const goal: BrandGoal = {
          id: newId('g'),
          title: trimmed,
          ...(note && note.trim() ? { note: note.trim() } : {}),
          ...(due && due.trim() ? { due: due.trim() } : {}),
          done: false,
          createdAt: new Date().toISOString(),
        }
        return { ...b, goals: [...(b.goals ?? []), goal] }
      }),
    }))
  }, [])

  const updateGoal = useCallback((brandId: string, goalId: string, patch: Partial<Pick<BrandGoal, 'title' | 'due' | 'note'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          goals: (b.goals ?? []).map(g => g.id === goalId ? { ...g, ...patch } : g),
        }
      }),
    }))
  }, [])

  const toggleGoal = useCallback((brandId: string, goalId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return {
          ...b,
          goals: (b.goals ?? []).map(g => {
            if (g.id !== goalId) return g
            const done = !g.done
            return { ...g, done, completedAt: done ? new Date().toISOString() : null }
          }),
        }
      }),
    }))
  }, [])

  const removeGoal = useCallback((brandId: string, goalId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        return { ...b, goals: (b.goals ?? []).filter(g => g.id !== goalId) }
      }),
    }))
  }, [])

  // --- Uploads --------------------------------------------------------------

  const addUpload = useCallback((brandId: string, input: { platform: Platform; title: string; url?: string; postedAt?: string; rating?: UploadRating }) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const upload: BrandUpload = {
          id: newId('up'),
          platform: input.platform,
          title: input.title.trim(),
          ...(input.url && input.url.trim() ? { url: input.url.trim() } : {}),
          postedAt: input.postedAt && input.postedAt.trim() ? input.postedAt : new Date().toISOString(),
          ...(input.rating ? { rating: input.rating } : {}),
        }
        return { ...b, uploads: [...(b.uploads ?? []), upload] }
      }),
    }))
  }, [])

  const updateUpload = useCallback((brandId: string, uploadId: string, patch: Partial<Pick<BrandUpload, 'platform' | 'title' | 'url' | 'postedAt' | 'rating' | 'note'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id !== brandId
        ? b
        : { ...b, uploads: (b.uploads ?? []).map(u => u.id === uploadId ? { ...u, ...patch } : u) }),
    }))
  }, [])

  const removeUpload = useCallback((brandId: string, uploadId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id !== brandId
        ? b
        : { ...b, uploads: (b.uploads ?? []).filter(u => u.id !== uploadId) }),
    }))
  }, [])

  const setProductionLink = useCallback((brandId: string, step: keyof ProductionLinks, url: string) => {
    const v = url.trim()
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const production: ProductionLinks = { ...(b.production ?? {}) }
        if (v) production[step] = v
        else delete production[step]
        return { ...b, production: Object.keys(production).length ? production : undefined }
      }),
    }))
  }, [])

  const setPackRead = useCallback((brandId: string, packId: string, text: string) => {
    const t = text.trim()
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const packReads = { ...(b.packReads ?? {}) }
        if (t) packReads[packId] = { text: t, at: new Date().toISOString() }
        else delete packReads[packId]
        return { ...b, packReads: Object.keys(packReads).length ? packReads : undefined }
      }),
    }))
  }, [])

  // --- Money in/out ---------------------------------------------------------

  const addMoneyEntry = useCallback((brandId: string, input: { name: string; amount: number; kind: BrandMoneyKind; period: BrandMoneyPeriod; at?: string; financeId?: string }) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const entry: BrandMoneyEntry = {
          id: newId('mny'),
          name: input.name.trim(),
          amount: Math.abs(input.amount),
          kind: input.kind,
          period: input.period,
          at: input.at && input.at.trim() ? input.at : getLocalDateKey(),
          ...(input.financeId ? { financeId: input.financeId } : {}),
        }
        const finance: BrandFinance = b.finance ?? { currency: '$', entries: [] }
        return { ...b, finance: { ...finance, entries: [...finance.entries, entry] } }
      }),
    }))
  }, [])

  const setMoneyCurrency = useCallback((brandId: string, currency: string) => {
    const c = currency.trim()
    if (!c) return
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId) return b
        const finance: BrandFinance = b.finance ?? { currency: c, entries: [] }
        return { ...b, finance: { ...finance, currency: c } }
      }),
    }))
  }, [])

  const updateMoneyEntry = useCallback((brandId: string, entryId: string, patch: Partial<Pick<BrandMoneyEntry, 'name' | 'amount' | 'kind' | 'period' | 'at'>>) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId || !b.finance) return b
        const clean = { ...patch }
        if (typeof clean.amount === 'number') clean.amount = Math.abs(clean.amount)
        if (typeof clean.name === 'string') clean.name = clean.name.trim()
        return {
          ...b,
          finance: {
            ...b.finance,
            entries: b.finance.entries.map(e => e.id === entryId ? { ...e, ...clean } : e),
          },
        }
      }),
    }))
  }, [])

  const removeMoneyEntry = useCallback((brandId: string, entryId: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => {
        if (b.id !== brandId || !b.finance) return b
        const entries = b.finance.entries.filter(e => e.id !== entryId)
        return { ...b, finance: entries.length ? { ...b.finance, entries } : undefined }
      }),
    }))
  }, [])

  const setReflection = useCallback((id: string, text: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id === id ? {
        ...b,
        lastReflection: text,
        lastReflectionAt: new Date().toISOString(),
      } : b),
    }))
  }, [])

  const setInsight = useCallback((id: string, text: string) => {
    setState(prev => ({
      ...prev,
      brands: prev.brands.map(b => b.id === id ? {
        ...b,
        lastInsight: text,
        lastInsightAt: new Date().toISOString(),
      } : b),
    }))
  }, [])

  const actions: BrandActions = {
    createBrand, copySocialFrom, updateBrand, archiveBrand, unarchiveBrand, deleteBrand,
    addSchedule, updateSchedule, removeSchedule,
    logScheduled, logShipped,
    addAccount, updateAccount, setAccountPosts, removeAccount,
    addLink, updateLink, removeLink, moveLink, reorderLink, setHeroAvatar, setHeroGraph,
    addKpi, updateKpi, removeKpi, importKpis,
    addGoal, updateGoal, toggleGoal, removeGoal,
    addUpload, updateUpload, removeUpload, setProductionLink,
    setPackRead,
    addMoneyEntry, updateMoneyEntry, removeMoneyEntry, setMoneyCurrency,
    setReflection,
    setInsight,
  }

  return { ready, state, dateKey, actions }
}

// -----------------------------------------------------------------------------
// Derived helpers — pure, exported for both list + detail views.
// -----------------------------------------------------------------------------

/** Schedules that recur every day — the ones the daily streak is built on. */
function dailySchedules(brand: Brand): Schedule[] {
  return brand.schedules.filter(s => s.period === 'daily')
}

function scheduleCount(brand: Brand, scheduleId: string, dateKey: string): number {
  return brand.log[scheduleId]?.[dateKey] || 0
}

/** Total logged today across the brand's daily schedules. */
export function countToday(brand: Brand): number {
  const key = getLocalDateKey()
  return dailySchedules(brand).reduce((sum, s) => sum + scheduleCount(brand, s.id, key), 0)
}

/** Combined daily target across the brand's daily schedules. */
export function dailyTarget(brand: Brand): number {
  return dailySchedules(brand).reduce((sum, s) => sum + s.target, 0)
}

/** Local date keys from the Monday of `now`'s week through `now`. */
function weekDateKeys(now: Date): string[] {
  const mondayOffset = (now.getDay() + 6) % 7 // days since Monday (Mon=0)
  const keys: string[] = []
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  for (let i = 0; i <= mondayOffset; i++) {
    keys.push(getLocalDateKey(d))
    d.setDate(d.getDate() + 1)
  }
  return keys
}

/**
 * Progress for one schedule within its current period bucket:
 *   - daily  → today's count
 *   - weekly → sum from this week's Monday through today
 */
export function scheduleProgress(
  brand: Brand,
  schedule: Schedule,
  now: Date = new Date(),
): { done: number; target: number } {
  if (schedule.period === 'weekly') {
    const done = weekDateKeys(now).reduce((sum, key) => sum + scheduleCount(brand, schedule.id, key), 0)
    return { done, target: schedule.target }
  }
  return { done: scheduleCount(brand, schedule.id, getLocalDateKey(now)), target: schedule.target }
}

/**
 * Trailing-day streak — consecutive days (ending yesterday) where EVERY
 * daily schedule hit its target. Today doesn't count yet (incentive to
 * keep going). Brands with no daily schedules have no daily streak.
 */
export function trailingStreak(brand: Brand, asOf: Date = new Date()): number {
  const daily = dailySchedules(brand)
  if (daily.length === 0) return 0
  let streak = 0
  const d = new Date(asOf)
  d.setDate(d.getDate() - 1)
  // Cap at 365 to bound the loop in degenerate cases.
  for (let i = 0; i < 365; i++) {
    const key = getLocalDateKey(d)
    const allHit = daily.every(s => scheduleCount(brand, s.id, key) >= s.target)
    if (allHit) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

export function totalFollowers(brand: Brand): number {
  return brand.accounts.reduce((sum, a) => sum + (a.followers || 0), 0)
}

/**
 * Normalised identity for an account — used to dedupe the same channel,
 * whether it's added twice to one brand or linked across brands (so the
 * Socials grid never shows the same YouTube channel twice). Lowercases,
 * strips a leading @, any URL/domain prefix, and trailing slashes/query.
 * `youtube_long` collapses to `youtube` — it's the same channel.
 */
export function accountKey(platform: Platform, handle: string): string {
  const canon = platform === 'youtube_long' ? 'youtube' : platform
  const h = handle
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?[^/]+\//, '') // strip protocol + domain
    .replace(/^@/, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '')
  return `${canon}:${h}`
}

// -----------------------------------------------------------------------------
// History-derived stats helpers — power the Stats card on the brand detail.
// -----------------------------------------------------------------------------

type SnapshotField = 'count' | 'views' | 'videos'

/**
 * Last snapshot value for a given metric. Walks the history in reverse
 * so a partial recent snapshot (e.g. one that's missing `views`) doesn't
 * hide an earlier snapshot that had the data.
 */
export function latestSnapshot(
  history: BrandAccount['history'],
  field: SnapshotField,
): number | undefined {
  if (!Array.isArray(history) || history.length === 0) return undefined
  for (let i = history.length - 1; i >= 0; i--) {
    const v = history[i][field]
    if (typeof v === 'number') return v
  }
  return undefined
}

/**
 * Change in a metric over the last `days`. Returns null when we don't
 * have enough history to compute one (you can't show "+12 this week"
 * if you only have one datapoint). Always uses the oldest available
 * snapshot within the window so that the first refresh after install
 * still produces a meaningful weekly delta over time.
 */
export function deltaSinceDays(
  history: BrandAccount['history'],
  field: SnapshotField,
  days: number,
): number | null {
  if (!Array.isArray(history) || history.length < 2) return null
  const cutoff = Date.now() - days * 86400_000
  // Walk forwards to find the first snapshot at or after the cutoff
  // that has the field set. Anything earlier is our baseline.
  let baseline: number | undefined
  let current: number | undefined
  for (const s of history) {
    const v = s[field]
    if (typeof v !== 'number') continue
    const t = new Date(s.at).getTime()
    if (t < cutoff) {
      baseline = v
    } else {
      if (baseline === undefined) baseline = v
      current = v
    }
  }
  if (baseline === undefined || current === undefined) return null
  return current - baseline
}

/**
 * Next "satisfying" round number above the current value. Drives the
 * "71 to 3,500" milestone text on the stats hero.
 */
export function nextMilestone(value: number): number {
  if (value < 100) return 100
  if (value < 500) return 500
  if (value < 1_000) return 1_000
  if (value < 5_000) {
    return Math.ceil(value / 500) * 500
  }
  if (value < 10_000) {
    return Math.ceil(value / 1_000) * 1_000
  }
  if (value < 100_000) {
    return Math.ceil(value / 5_000) * 5_000
  }
  if (value < 1_000_000) {
    return Math.ceil(value / 50_000) * 50_000
  }
  return Math.ceil(value / 500_000) * 500_000
}

// -----------------------------------------------------------------------------
// KPI history helpers — power the per-metric chart + delta on the Business tab.
// -----------------------------------------------------------------------------

/** Ordered numeric series from a KPI's history (empty if none). */
export function kpiSeries(kpi: BrandKpi): number[] {
  if (!Array.isArray(kpi.history)) return []
  return kpi.history
    .map(s => s.value)
    .filter((v): v is number => typeof v === 'number')
}

/**
 * Change in a KPI's value over the last `days`. Returns null when there
 * aren't ≥2 datapoints to compare. Uses the oldest snapshot within the
 * window as the baseline so the first update after install still produces
 * a meaningful delta over time. Mirrors `deltaSinceDays` for accounts.
 */
export function kpiDeltaSince(kpi: BrandKpi, days: number): number | null {
  const history = kpi.history
  if (!Array.isArray(history) || history.length < 2) return null
  const cutoff = Date.now() - days * 86400_000
  let baseline: number | undefined
  let current: number | undefined
  for (const s of history) {
    if (typeof s.value !== 'number') continue
    const t = new Date(s.at).getTime()
    if (t < cutoff) {
      baseline = s.value
    } else {
      if (baseline === undefined) baseline = s.value
      current = s.value
    }
  }
  if (baseline === undefined || current === undefined) return null
  return current - baseline
}
