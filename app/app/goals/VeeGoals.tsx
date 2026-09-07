'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import styles from './goalsVee.module.css'
import type { BigGoal, HabitGoal, HabitTracking, Prio, Push, VeeGoalsState } from './veeTypes'
import { createBigGoal, addHabitGoal, setHabitGoalDone, deleteBigGoal, categorizeAndCleanGoal, updateBigGoalPush } from './goalActions'
import { appendGoalToLocalStorage } from './state'
import CategoryIcon from './CategoryIcon'
import { CATEGORY_WORD } from '@/lib/goals/categories'

/**
 * Vee Goals — the real, auth'd Goals surface (Phase 1).
 *
 * Ported from the approved vee-goals-demo. Two tiers, a mix of both:
 *   1. YOUR GOALS — big personal aspirations you author ("hit 1,000 subs"),
 *      each with a deadline, a priority, and a per-goal choice of how hard Vee
 *      pushes. Authoring one is the flagship loop and persists to Supabase.
 *   2. THIS WEEK — the small Vitality goals. Manual ones you tap; auto ones name
 *      what they'll track (live counts arrive in Phase 5). Add from suggestions.
 *
 * The Vee gem is the REAL CoachGem 'echo' (iris dodecahedron + V), driven via
 * controlRef: 'curious' on a blank slate, 'happyHello' when you have goals,
 * 'proud' when you set one, 'nod' when you tick a habit.
 *
 * Drift ("Vee notices you slipping"), the streak/identity meter, and live auto
 * counts are deferred to their own phases; this surface never shows fake data.
 */
const CoachGem = dynamic(() => import('@/components/CoachGem'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M-8 0 L-2 7 L9 -7" /></svg>
)
function VMark({ size = 16 }: { size?: number }) {
  return (
    <span className={styles.vMark} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7l7 11 7-11" /></svg>
    </span>
  )
}

const TIMEFRAMES = [
  { key: '2w', num: '2', unit: 'weeks', days: 14 },
  { key: '1m', num: '1', unit: 'month', days: 30 },
  { key: '3m', num: '3', unit: 'months', days: 91 },
  { key: '6m', num: '6', unit: 'months', days: 182 },
  { key: '1y', num: '1', unit: 'year', days: 365 },
] as const
type TfKey = typeof TIMEFRAMES[number]['key'] | 'custom'

const PUSH_OPTS: { key: Push; title: string; desc: string }[] = [
  { key: 'gentle', title: 'Keep it gentle', desc: 'I cheer quietly and stay out of your way.' },
  { key: 'balanced', title: 'Nudge me when I drift', desc: 'I only speak up if you start slipping.' },
  { key: 'push', title: 'Push me to show up', desc: 'I check in often and keep you honest.' },
  { key: 'silent', title: 'Keep it silent', desc: 'I won’t say a word. This one is just for you.' },
]
const PUSH_CHIP: Record<Push, string> = { silent: 'Vee · silent', gentle: 'Vee · gentle', balanced: 'Vee · nudges', push: 'Vee · pushes' }
const PUSH_SHORT: Record<Push, string> = { silent: 'Silent', gentle: 'Gentle', balanced: 'Nudges', push: 'Pushes' }
const PRIO_LBL = ['Low', 'Medium', 'High'] as const

// suggestion seeds for the blank slate / "this week" adder
type SuggestionMetric = 'train' | 'protein' | 'sleep'
type Suggestion = { title: string; sub: string; source: HabitGoal['source']; tracking: HabitTracking; metric: SuggestionMetric }
const SUGGESTIONS: Suggestion[] = [
  { title: 'Train 4 times a week', sub: 'from your workouts', source: 'auto', tracking: { metric: 'train', target: 4, window: 'week' }, metric: 'train' },
  { title: 'Hit your protein daily', sub: 'from Fuel', source: 'auto', tracking: { metric: 'protein', window: 'day' }, metric: 'protein' },
  { title: 'Sleep 8 hours, 3 nights', sub: 'from your band', source: 'auto', tracking: { metric: 'sleep', target: 3, window: 'week', hours: 8 }, metric: 'sleep' },
]

const GLYPH: Record<string, ReactNode> = {
  train: <path d="M-9 -4 V4 M9 -4 V4 M-9 0 H9 M-6 -6 V6 M6 -6 V6" />,
  protein: <path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" />,
  sleep: <path d="M4 -8 a9 9 0 1 0 6 13 a7 7 0 0 1 -6 -13Z" />,
  water: <path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" />,
  default: <><circle cx="0" cy="0" r="7" /><path d="M-3 0 L-1 3 L4 -4" /></>,
}

function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d }
function fmtDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function getLocalDateKey(d = new Date()) { const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${day}` }
function daysFromToday(key: string) { const t = new Date(`${key}T00:00:00`); const now = new Date(); now.setHours(0, 0, 0, 0); return Math.max(0, Math.round((t.getTime() - now.getTime()) / 86400000)) }
function friendlyDistance(days: number) {
  if (days <= 1) return 'by tomorrow'
  if (days < 14) return `${days} days out`
  if (days < 45) return `${Math.round(days / 7)} weeks out`
  if (days < 335) return `about ${Math.round(days / 30)} months out`
  return 'about a year out'
}
/** Time elapsed from goal creation toward its deadline, as a % (min 4 so the
 *  marker is always visible at the start of the journey). */
function horizonPct(createdAt: string, targetDate: string): number {
  const start = Date.parse(createdAt)
  const end = Date.parse(`${targetDate}T00:00:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 4
  return Math.max(4, Math.min(100, ((Date.now() - start) / (end - start)) * 100))
}
function describeTracking(t: HabitTracking): string {
  switch (t.metric) {
    case 'train': return `${t.target ?? 4} times a week`
    case 'protein': return 'every day'
    case 'sleep': return `${t.hours ?? 8} hours, ${t.target ?? 3} nights`
    case 'water': return 'every day'
    default: return t.window === 'week' ? 'each week' : 'each day'
  }
}
function sourceLabel(source: HabitGoal['source']): string {
  switch (source) {
    case 'auto': return 'tracked for you'
    case 'fitness': return 'from your workouts'
    case 'supplements': return 'from supplements'
    case 'finance': return 'from finance'
    case 'mentor': return 'from a note to Vee'
    default: return 'you tap when done'
  }
}
function friendlyError(code: string): string {
  if (code === 'goals_tables_missing') return 'Saving is not on just yet. Your goal is safe here for now.'
  if (code === 'unauthorized') return 'I lost your sign in. Pop back in and I will save this.'
  if (code === 'bad_date') return 'That date is already behind us. Pick one ahead of today.'
  if (code === 'too_long') return 'That is a whole story. Keep it under 200 characters and I can save it.'
  if (code === 'gibberish') return 'Help me out, say it plainly and I can steer it.'
  return 'That did not save. Give it one more tap and I will catch it.'
}

export default function VeeGoals({ initial, suggestionEvidence }: {
  initial: VeeGoalsState
  /** Which auto-track suggestions have real data behind them (server-checked).
   *  Absent/false = the row never renders — no evidence, no pitch. */
  suggestionEvidence?: Partial<Record<SuggestionMetric, boolean>>
}) {
  const initialMode: 'day1' | 'main' = initial.bigGoals.length === 0 && initial.habitGoals.length === 0 ? 'day1' : 'main'

  const [mode, setMode] = useState<'day1' | 'main'>(initialMode)
  const [bigGoals, setBigGoals] = useState<BigGoal[]>(initial.bigGoals)
  const [habits, setHabits] = useState<HabitGoal[]>(initial.habitGoals)
  const [filled, setFilled] = useState(false)
  const [added, setAdded] = useState<Record<number, boolean>>({})
  const [busyHabit, setBusyHabit] = useState<string | null>(null)

  const [justSetId, setJustSetId] = useState<string | null>(null)
  const [celebrateId, setCelebrateId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTf, setDraftTf] = useState<TfKey>('3m')
  const [customDate, setCustomDate] = useState('')
  const [draftPrio, setDraftPrio] = useState<Prio>(2)
  const [draftPush, setDraftPush] = useState<Push>('balanced')
  const [editPushId, setEditPushId] = useState<string | null>(null)
  const [gemReady, setGemReady] = useState(false)

  const ctrl = useRef<((move: string) => void) | null>(null)
  const sheetRef = useRef<HTMLFormElement | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const newGoalRef = useRef<HTMLDivElement | null>(null)

  function fireWhenReady(move: string) {
    if (ctrl.current) { ctrl.current(move); return () => {} }
    let n = 0
    const id = setInterval(() => { n++; if (ctrl.current) { ctrl.current(move); clearInterval(id) } else if (n >= 40) clearInterval(id) }, 60)
    return () => clearInterval(id)
  }

  // opening mood (once); subsequent moods are driven explicitly by actions
  useEffect(() => {
    const cancel = fireWhenReady(initialMode === 'day1' ? 'curious' : 'happyHello')
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // animate bars in once
  useEffect(() => { const t = setTimeout(() => setFilled(true), 450); return () => clearTimeout(t) }, [])

  // Mount the heavy WebGL gem only AFTER the cozy entrance cascade has finished
  // painting. The cascade is compositor-driven (so it runs even while JS is
  // busy), but the gem's one-time WebGL init is a long main-thread task that, if
  // it lands mid-cascade, stalls frame delivery and makes the intro stutter.
  // Until then we show the soft gemFallback radial, then fade the real gem in.
  useEffect(() => {
    const t = setTimeout(() => setGemReady(true), 900) // ~last cascade item (0.39s delay + 0.5s) + slack
    return () => clearTimeout(t)
  }, [])

  // backfill: triage any pre-existing goals that never got a category (capped)
  useEffect(() => {
    initial.bigGoals.filter(g => !g.category).slice(0, 5).forEach(g => { void runCategorize(g.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // when the create sheet opens, bring it into view; focus after the scroll
  useEffect(() => {
    if (!creating) return
    const a = setTimeout(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    const b = setTimeout(() => titleRef.current?.focus(), 400)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [creating])

  const tf = TIMEFRAMES.find(t => t.key === draftTf)
  const isCustom = draftTf === 'custom'
  const days = isCustom ? (customDate ? daysFromToday(customDate) : 0) : (tf?.days ?? 91)
  const targetObj = isCustom ? (customDate ? new Date(`${customDate}T00:00:00`) : null) : addDays(days)
  const targetLabel = targetObj ? fmtDate(targetObj) : ''
  const durPct = Math.min(100, (days / 365) * 100)
  const canSet = !!draftTitle.trim() && (!isCustom || !!customDate)

  function resetDraft() { setDraftTitle(''); setDraftTf('3m'); setCustomDate(''); setDraftPrio(2); setDraftPush('balanced'); setSaveError(null) }
  function graduate() { setMode('main') }

  async function createGoal() {
    if (!canSet || saving) return
    setSaving(true); setSaveError(null)
    const targetDate = isCustom ? (customDate || null) : getLocalDateKey(addDays(days))
    const res = await createBigGoal({ title: draftTitle.trim(), targetDate, priority: draftPrio, push: draftPush })
    setSaving(false)
    if (!res.ok) { setSaveError(friendlyError(res.error)); return }
    // Note: big goals are NOT mirrored to the legacy localStorage store (they
    // have no legacy Goal shape and would pollute it). Vee learns about them
    // through user_facts, written server-side in createBigGoal. Habits, which
    // DO map to the legacy shape, still dual-write below in addSuggestion.
    setBigGoals(g => [res.goal, ...g])
    void runCategorize(res.goal.id, true)
    setJustSetId(res.goal.id)
    setCreating(false); resetDraft()
    graduate()
    fireWhenReady('proud')
    setTimeout(() => newGoalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    setTimeout(() => setJustSetId(null), 950)
  }

  async function toggleHabit(h: HabitGoal) {
    if (busyHabit === h.id) return
    const done = h.status !== 'completed'
    setBusyHabit(h.id)
    setHabits(list => list.map(x => (x.id === h.id ? { ...x, status: done ? 'completed' : 'open' } : x)))
    if (done) fireWhenReady('nod')
    const res = await setHabitGoalDone(h.id, done)
    setBusyHabit(null)
    if (!res.ok) {
      setHabits(list => list.map(x => (x.id === h.id ? { ...x, status: done ? 'open' : 'completed' } : x)))
    } else {
      setHabits(list => list.map(x => (x.id === h.id ? res.habit : x)))
    }
  }

  async function addSuggestion(i: number, s: Suggestion) {
    if (added[i]) return
    setAdded(a => ({ ...a, [i]: true }))
    const res = await addHabitGoal({ title: s.title, kind: 'habit', source: s.source, tracking: s.tracking })
    if (!res.ok) { setAdded(a => ({ ...a, [i]: false })); return }
    setHabits(list => [res.habit, ...list])
    try { appendGoalToLocalStorage(s.title) } catch {}
    graduate()
    fireWhenReady('proud')
  }

  async function removeBigGoal(id: string) {
    const prev = bigGoals
    setBigGoals(g => g.filter(x => x.id !== id))
    const res = await deleteBigGoal(id)
    if (!res.ok) setBigGoals(prev)
  }

  // Change how much Vee shows up about a goal (and, server-side, keep its memory
  // in sync). Optimistic — revert if the write fails.
  async function changePush(g: BigGoal, push: Push) {
    setEditPushId(null)
    if (g.push === push) return
    setBigGoals(gs => gs.map(x => (x.id === g.id ? { ...x, push } : x)))
    fireWhenReady('nod')
    const res = await updateBigGoalPush(g.id, push)
    // Revert just this goal's push on failure (a functional update, so a clean
    // title / category that landed mid-write is preserved).
    if (!res.ok) setBigGoals(gs => gs.map(x => (x.id === g.id ? { ...x, push: g.push } : x)))
    else setBigGoals(gs => gs.map(x => (x.id === res.goal.id ? res.goal : x)))
  }

  // Triage a goal in the background (AI tag + clean title). Non-blocking: the
  // goal is already on screen with its raw title; this swaps in the tidy one.
  // `celebrate` plays a one-time glow on freshly-created goals (the reward beat),
  // but not on the quiet backfill of pre-existing goals.
  async function runCategorize(id: string, celebrate = false) {
    const r = await categorizeAndCleanGoal(id)
    if (!r.ok) return
    setBigGoals(gs => gs.map(x => (x.id === r.goal.id ? r.goal : x)))
    if (celebrate) {
      setCelebrateId(r.goal.id)
      setTimeout(() => setCelebrateId(c => (c === r.goal.id ? null : c)), 1600)
    }
  }

  const PrioPips = ({ p, big }: { p: Prio; big?: boolean }) => (
    <span className={styles.prioPips} aria-label={`priority ${PRIO_LBL[p - 1]}`}>
      {[1, 2, 3].map(i => <span key={i} className={`${styles.prioPip} ${i <= p ? styles.prioPipOn : ''}`} style={{ height: `${(big ? 7 : 5) + i * 4}px` }} />)}
    </span>
  )

  // titles already tracked → don't re-suggest them. Evidence-gated first: a
  // suggestion only renders when the server saw real rows behind its claim
  // ("from Fuel" needs meals, "from your band" needs sleep readings).
  const habitTitles = new Set(habits.map(h => h.title.toLowerCase()))
  const evidencedSuggestions = SUGGESTIONS.map((s, i) => ({ s, i })).filter(({ s }) => suggestionEvidence?.[s.metric] === true)
  const openSuggestions = evidencedSuggestions.filter(({ s, i }) => !added[i] && !habitTitles.has(s.title.toLowerCase()))

  const SuggestionRow = ({ s, i }: { s: Suggestion; i: number }) => (
    <div className={styles.suggest}>
      <span className={styles.sGlyph}><svg width="19" height="19" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">{GLYPH[s.metric] ?? GLYPH.default}</svg></span>
      <div className={styles.sBody}><div className={styles.sName}>{s.title}</div><div className={styles.sWhy}>{s.sub}</div></div>
      <button className={styles.addBtn} disabled={!!added[i]} onClick={() => addSuggestion(i, s)}>
        {added[i] ? <><CheckIcon size={11} />Added</> : <><svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>Add</>}
      </button>
    </div>
  )

  const CreateBlock = (
    creating ? (
      <form ref={sheetRef} className={styles.createSheet} onSubmit={e => { e.preventDefault(); createGoal() }}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Your goal</span>
          <input ref={titleRef} className={styles.titleInput} enterKeyHint="done" maxLength={200} placeholder="Run a half marathon. Save 5k. Read 12 books." value={draftTitle} onChange={e => setDraftTitle(e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Deadline</span>
          <div className={styles.durRow}>
            {TIMEFRAMES.map(t => (
              <button type="button" key={t.key} className={`${styles.durChip} ${draftTf === t.key ? styles.durChipOn : ''}`} onClick={() => setDraftTf(t.key)}>{t.num} {t.unit}</button>
            ))}
            <button type="button" className={`${styles.durChip} ${isCustom ? styles.durChipOn : ''}`} onClick={() => setDraftTf('custom')}>Pick a date</button>
          </div>
          {isCustom && (
            <input type="date" className={styles.dateInput} min={getLocalDateKey()} value={customDate} onChange={e => setCustomDate(e.target.value)} />
          )}
          {days > 0 && (
            <div className={styles.horizon}>
              <div className={styles.horizonTrack}>
                <div className={styles.horizonFill} style={{ width: `${durPct}%` }} />
                <span className={styles.horizonMarker} style={{ left: `${durPct}%` }} />
              </div>
              <div className={styles.horizonLabels}>
                <span className={styles.horizonToday}>Today</span>
                <span className={styles.horizonTarget}>
                  <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-7 9 V-9 L8 -5 L-7 -1" /></svg>
                  <b>{targetLabel}</b> · {friendlyDistance(days)}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Priority</span>
          <div className={styles.prioRow}>
            {([1, 2, 3] as Prio[]).map(p => (
              <button type="button" key={p} className={`${styles.prioOpt} ${draftPrio === p ? styles.prioOptOn : ''}`} onClick={() => setDraftPrio(p)}>
                <PrioPips p={p} big />
                <span className={styles.prioOptLbl}>{PRIO_LBL[p - 1]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>How much should Vee push you?</span>
          <div className={styles.pushRow}>
            {PUSH_OPTS.map(o => (
              <button type="button" key={o.key} className={`${styles.pushOpt} ${draftPush === o.key ? styles.pushOptOn : ''}`} onClick={() => setDraftPush(o.key)}>
                <span className={styles.pushDot} />
                <span className={styles.pushTexts}><span className={styles.pushTitle}>{o.title}</span><span className={styles.pushDesc}>{o.desc}</span></span>
              </button>
            ))}
          </div>
          <p className={styles.pushHelper}>You can change how much I show up anytime. Nothing here is locked in.</p>
        </div>
        {saveError && (
          <p className={styles.saveError}>
            <svg width="13" height="13" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="0" cy="0" r="9" /><path d="M0 -4 V1 M0 5 v.01" /></svg>
            {saveError}
          </p>
        )}
        <div className={styles.sheetActions}>
          <button type="submit" className={styles.setBtn} disabled={!canSet || saving}>{saving ? 'Saving…' : 'Set this goal'}</button>
          <button type="button" className={styles.cancelBtn} onClick={() => { setCreating(false); resetDraft() }}>cancel</button>
        </div>
      </form>
    ) : (
      <button className={styles.createBtn} onClick={() => setCreating(true)}>
        <svg width="18" height="18" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>
        Add a goal
      </button>
    )
  )

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} />
      <div className={styles.shell}>

        {mode === 'main' ? (
          <div className={styles.view}>
            <header className={styles.header}>
              <div className={styles.eyebrowTop}>Vitality · Vee</div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>Your <span className={styles.accent}>goals</span></h1>
                <span className={styles.watchPill}><span className={styles.dot} />Vee&rsquo;s with you</span>
              </div>
            </header>

            <div className={styles.gemHero}>
              <div className={styles.gemWrap}>
                {gemReady
                  ? <div className={styles.gemMount}><CoachGem preset="echo" size={216} controlRef={ctrl} signature={null} /></div>
                  : <div className={styles.gemFallback} aria-hidden />}
              </div>
            </div>

            <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·01</span><span className={styles.eyebrowLbl}>Your goals</span><span className={styles.eyebrowRule} /></div>
            <p className={styles.tierIntro}>The big things you&rsquo;re working toward. You set the deadline, the priority, and how hard I push.</p>

            {bigGoals.map((g, i) => {
              const dleft = g.targetDate ? daysFromToday(g.targetDate) : null
              const tlabel = g.targetDate ? fmtDate(new Date(`${g.targetDate}T00:00:00`)) : null
              const hpct = g.targetDate ? horizonPct(g.createdAt, g.targetDate) : 0
              const hasBar = g.progressTarget != null && g.progressTarget > 0
              return (
                <div ref={i === 0 ? newGoalRef : null} className={`${styles.bigGoal} ${g.id === justSetId ? styles.bigGoalJustSet : ''} ${g.id === celebrateId ? styles.bigGoalCelebrate : ''} ${g.status === 'achieved' ? styles.bigGoalAchieved : ''}`} key={g.id}>
                  <div className={styles.bigGoalTop}>
                    {g.category ? (
                      <span className={styles.catBadge}>
                        <span className={styles.catSeal}><CategoryIcon category={g.category} size={22} /></span>
                        <span className={styles.catWord}>{CATEGORY_WORD[g.category]}</span>
                      </span>
                    ) : <span className={styles.catBadgePlaceholder} aria-hidden />}
                    <PrioPips p={g.priority} big />
                  </div>
                  <h3 key={g.cleanTitle ?? g.title} className={styles.bigGoalTitle}>{g.cleanTitle ?? g.title}</h3>
                  {hasBar && (
                    <div className={styles.bigGoalProg}>
                      <div className={styles.progHead}>
                        <span className={styles.progNum}>{g.progressCurrent ?? 0}<small>of {g.progressTarget} {g.progressUnit ?? ''}</small></span>
                        <span className={styles.metaChip}>{Math.round(((g.progressCurrent ?? 0) / g.progressTarget!) * 100)}%</span>
                      </div>
                      <div className={styles.progTrack}><div className={styles.progFill} style={{ width: filled ? `${Math.min(100, ((g.progressCurrent ?? 0) / g.progressTarget!) * 100)}%` : '0' }} /></div>
                    </div>
                  )}
                  {g.targetDate && (
                    <div className={styles.horizon}>
                      <div className={styles.horizonTrack}>
                        <div className={styles.horizonFill} style={{ width: filled ? `${hpct}%` : '0' }} />
                        <span className={styles.horizonMarker} style={{ left: filled ? `${hpct}%` : '0' }} />
                      </div>
                      <div className={styles.horizonLabels}>
                        <span className={styles.horizonToday}>Today</span>
                        <span className={styles.horizonTarget}>
                          <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-7 9 V-9 L8 -5 L-7 -1" /></svg>
                          <b>{tlabel}</b>{dleft != null ? ` · ${dleft} days left` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className={styles.bigGoalMeta}>
                    <button
                      type="button"
                      className={`${styles.metaChip} ${styles.pushChipBtn} ${g.push === 'silent' ? styles.pushChipSilent : styles.pushChip}`}
                      onClick={() => setEditPushId(cur => (cur === g.id ? null : g.id))}
                      aria-expanded={editPushId === g.id}
                      aria-controls={`push-edit-${g.id}`}
                      aria-label={`change how much Vee shows up about ${g.cleanTitle ?? g.title}`}
                    ><VMark size={11} />{PUSH_CHIP[g.push]}</button>
                    <button className={styles.miniDelete} onClick={() => removeBigGoal(g.id)} aria-label={`remove ${g.cleanTitle ?? g.title}`}>remove</button>
                  </div>
                  {editPushId === g.id && (
                    <div className={styles.pushEdit} id={`push-edit-${g.id}`} role="group" aria-label="How much should Vee show up">
                      {PUSH_OPTS.map(o => (
                        <button
                          type="button"
                          key={o.key}
                          className={`${styles.pushEditOpt} ${g.push === o.key ? styles.pushEditOptOn : ''}`}
                          onClick={() => changePush(g, o.key)}
                        ><VMark size={10} />{PUSH_SHORT[o.key]}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {CreateBlock}

            <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·02</span><span className={styles.eyebrowLbl}>This week with Vitality</span><span className={styles.eyebrowRule} /></div>
            <p className={styles.tierIntro}>The small wins that keep you moving. I track what I can see. You tap the rest.</p>

            <div className={styles.habits}>
              {habits.map(h => {
                const done = h.status === 'completed'
                const auto = h.tracking != null
                const glyphKey = h.tracking?.metric ?? 'default'
                return (
                  <div className={`${styles.habit} ${done ? styles.habitDone : ''}`} key={h.id}>
                    <span className={styles.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{GLYPH[glyphKey] ?? GLYPH.default}</svg></span>
                    <div className={styles.hBody}>
                      <span className={styles.hName}>{h.title}</span>
                      <span className={styles.hMeta}>
                        {auto
                          ? <><b>{describeTracking(h.tracking!)}</b> · {sourceLabel(h.source)}</>
                          : (done ? <><b>done today</b> · nice</> : 'tap when you have done it')}
                      </span>
                    </div>
                    <span className={styles.hState}>
                      {auto ? (
                        <span className={styles.autoPill}><CheckIcon size={11} />auto</span>
                      ) : (
                        <button className={`${styles.tapDot} ${done ? styles.tapDotChecked : ''}`} aria-label={`mark ${h.title} done`} disabled={busyHabit === h.id} onClick={() => toggleHabit(h)}>
                          <span className={styles.tapRing}><CheckIcon size={12} /></span>
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
              {openSuggestions.map(({ s, i }) => <SuggestionRow key={s.title} s={s} i={i} />)}
            </div>

            <Link href="/app/mentor" className={styles.talkPill}><VMark size={16} />Talk to Vee about your goals</Link>
          </div>
        ) : (
          <div className={styles.view}>
            <header className={styles.header}>
              <div className={styles.eyebrowTop}>Vitality · Vee</div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>Your <span className={styles.accent}>goals</span></h1>
              </div>
            </header>

            <div className={styles.gemHero}>
              <div className={`${styles.gemWrap} ${styles.gemWrapSmall}`}>
                {gemReady
                  ? <div className={styles.gemMount}><CoachGem preset="echo" size={172} controlRef={ctrl} signature={null} /></div>
                  : <div className={styles.gemFallback} aria-hidden />}
              </div>
              <p className={styles.gemLine}>No setup, no forms. What&rsquo;s something you&rsquo;re <span>working toward</span>?</p>
            </div>

            {CreateBlock}

            {evidencedSuggestions.length > 0 && (
              <>
                <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·01</span><span className={styles.eyebrowLbl}>Already in motion</span><span className={styles.eyebrowRule} /></div>
                <p className={styles.tierIntro}>The small Vitality wins I can keep an eye on for you. Tap one and I&rsquo;ll start tracking it.</p>

                <div className={styles.habits}>
                  {openSuggestions.length > 0
                    ? openSuggestions.map(({ s, i }) => <SuggestionRow key={s.title} s={s} i={i} />)
                    : evidencedSuggestions.map(({ s, i }) => <SuggestionRow key={s.title} s={s} i={i} />)}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
