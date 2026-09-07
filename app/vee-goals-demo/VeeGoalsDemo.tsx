'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './veeGoalsDemo.module.css'

/**
 * Vee Goals — public no-auth preview of the Vee-housed Goals experience.
 *
 * Two tiers, a mix of both:
 *   1. YOUR GOALS — big personal aspirations you author ("hit 1,000 subs"),
 *      each with a deadline, a priority, and a per-goal choice of how hard Vee
 *      pushes you. Setting one is the flagship loop: it must feel effortless
 *      and rewarding so a user happily returns whenever they have a new goal.
 *   2. THIS WEEK — the cozy auto-tracked Vitality goals under your identity.
 *
 * The Vee gem is the REAL CoachGem 'echo' (iris dodecahedron + V), driven via
 * controlRef: 'concern' when noticing you slip, 'proud' when you set a goal.
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

type Push = 'silent' | 'gentle' | 'balanced' | 'push'
type Prio = 1 | 2 | 3
interface BigGoal { id: number; title: string; current?: number; target?: number; unit?: string; targetLabel: string; daysLeft: number; prio: Prio; push: Push }

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
const PRIO_LBL = ['Low', 'Medium', 'High'] as const

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

export default function VeeGoalsDemo() {
  const [view, setView] = useState<'weeks' | 'day1'>('weeks')
  const [resolved, setResolved] = useState<null | 'graced' | 'shrunk' | 'talk'>(null)
  const [filled, setFilled] = useState(false)
  const [meditateDone, setMeditateDone] = useState(false)
  const [peakPinned, setPeakPinned] = useState(false)
  const [added, setAdded] = useState<Record<number, boolean>>({})

  const [goals, setGoals] = useState<BigGoal[]>([
    { id: 1, title: 'Hit 1,000 subscribers on YouTube', current: 640, target: 1000, unit: 'subs', targetLabel: fmtDate(addDays(74)), daysLeft: 74, prio: 3, push: 'push' },
  ])
  const [justSetId, setJustSetId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTf, setDraftTf] = useState<TfKey>('3m')
  const [customDate, setCustomDate] = useState('')
  const [draftPrio, setDraftPrio] = useState<Prio>(2)
  const [draftPush, setDraftPush] = useState<Push>('balanced')

  const ctrl = useRef<((move: string) => void) | null>(null)
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved
  const sheetRef = useRef<HTMLFormElement | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const newGoalRef = useRef<HTMLDivElement | null>(null)

  function fireWhenReady(move: string) {
    if (ctrl.current) { ctrl.current(move); return () => {} }
    let n = 0
    const id = setInterval(() => { n++; if (ctrl.current) { ctrl.current(move); clearInterval(id) } else if (n >= 40) clearInterval(id) }, 60)
    return () => clearInterval(id)
  }

  // gem opening mood per view
  useEffect(() => {
    const cancel = fireWhenReady(view === 'weeks' ? (resolvedRef.current ? 'happyHello' : 'concern') : 'curious')
    return cancel
  }, [view])

  // animate bars in once (not on every toggle — avoids re-sweep glitch)
  useEffect(() => { const t = setTimeout(() => setFilled(true), 450); return () => clearTimeout(t) }, [])

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

  function resetDraft() { setDraftTitle(''); setDraftTf('3m'); setCustomDate(''); setDraftPrio(2); setDraftPush('balanced') }

  function createGoal() {
    if (!canSet) return
    const id = Date.now()
    setGoals(g => [{ id, title: draftTitle.trim(), targetLabel, daysLeft: days, prio: draftPrio, push: draftPush }, ...g])
    setJustSetId(id)
    setCreating(false); resetDraft()
    fireWhenReady('proud')
    setTimeout(() => newGoalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    setTimeout(() => setJustSetId(null), 950)
  }

  function resolve(kind: 'graced' | 'shrunk' | 'talk') {
    setResolved(kind)
    fireWhenReady(kind === 'talk' ? 'listening' : 'happyHello')
  }

  function toggleMeditate() {
    setMeditateDone(v => { const nv = !v; if (nv) fireWhenReady('nod'); return nv })
  }

  const RESOLVE_COPY: Record<'graced' | 'shrunk' | 'talk', [string, string]> = {
    graced: ['Graced. We’re good.', 'Your streak stays whole. Rest, then come back when you can. I’ll be here.'],
    shrunk: ['Eased to 2 this week.', 'Smaller, but still a vote for who you are. We can grow it back when life settles.'],
    talk: ['Okay. Let’s talk.', 'Opening our chat so we can figure out what’s really going on, no pressure.'],
  }

  const PrioPips = ({ p, big }: { p: Prio; big?: boolean }) => (
    <span className={styles.prioPips} aria-label={`priority ${PRIO_LBL[p - 1]}`}>
      {[1, 2, 3].map(i => <span key={i} className={`${styles.prioPip} ${i <= p ? styles.prioPipOn : ''}`} style={{ height: `${(big ? 7 : 5) + i * 4}px` }} />)}
    </span>
  )

  const CreateBlock = (
    creating ? (
      <form ref={sheetRef} className={styles.createSheet} onSubmit={e => { e.preventDefault(); createGoal() }}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Your goal</span>
          <input ref={titleRef} className={styles.titleInput} enterKeyHint="done" placeholder="Run a half marathon. Save 5k. Read 12 books." value={draftTitle} onChange={e => setDraftTitle(e.target.value)} />
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
                <PrioPips p={p} />
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
        <div className={styles.sheetActions}>
          <button type="submit" className={styles.setBtn} disabled={!canSet}>Set this goal</button>
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

        <div className={styles.demoBar}>
          <div className={styles.demoNote}>Preview · real Vee gem · set a goal, tap a Vee action</div>
          <div className={styles.toggle}>
            <button className={`${styles.toggleBtn} ${view === 'weeks' ? styles.toggleOn : ''}`} onClick={() => setView('weeks')}>A few weeks in</button>
            <button className={`${styles.toggleBtn} ${view === 'day1' ? styles.toggleOn : ''}`} onClick={() => setView('day1')}>Day one</button>
          </div>
        </div>

        {view === 'weeks' ? (
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
                <CoachGem preset="echo" size={216} controlRef={ctrl} signature={null} />
              </div>
            </div>

            {/* FLAGSHIP: Vee notices you slipping */}
            <div className={`${styles.nudge} ${resolved ? styles.nudgeResolved : ''}`}>
              <span className={styles.nudgeWho}>{resolved ? 'Vee' : 'Vee noticed'}</span>
              {resolved ? (
                <>
                  <p className={styles.nudgeLine}>{RESOLVE_COPY[resolved][0]}</p>
                  <p className={styles.nudgeP}>{RESOLVE_COPY[resolved][1]}</p>
                </>
              ) : (
                <>
                  <p className={styles.nudgeLine}>The last few days got quiet on training.</p>
                  <p className={styles.nudgeP}>Life gets heavy sometimes, and that&rsquo;s completely okay. I&rsquo;ve got you. What feels right?</p>
                  <div className={styles.sparkRow}>
                    <button className={`${styles.spark} ${styles.sparkWarm}`} onClick={() => resolve('graced')}>
                      <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-8 1 C-8 -7 0 -9 0 -3 C0 -9 8 -7 8 1 L0 9 Z" /></svg>
                      Give me grace
                    </button>
                    <button className={`${styles.spark} ${styles.sparkIris}`} onClick={() => resolve('shrunk')}>
                      <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 0 H9" /><path d="M-9 0 l5 -5 M-9 0 l5 5" /></svg>
                      Ease this week
                    </button>
                    <button className={styles.spark} onClick={() => resolve('talk')}>
                      <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -6 h18 v11 h-11 l-5 5 z" /></svg>
                      Talk to me
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·01</span><span className={styles.eyebrowLbl}>Your goals</span><span className={styles.eyebrowRule} /></div>
            <p className={styles.tierIntro}>The big things you&rsquo;re working toward. You set the deadline, the priority, and how hard I push.</p>
            {goals.map((g, i) => (
              <div ref={i === 0 ? newGoalRef : null} className={`${styles.bigGoal} ${g.id === justSetId ? styles.bigGoalJustSet : ''}`} key={g.id}>
                <div className={styles.bigGoalTop}>
                  <h3 className={styles.bigGoalTitle}>{g.title}</h3>
                  <PrioPips p={g.prio} big />
                </div>
                {g.target ? (
                  <div className={styles.bigGoalProg}>
                    <div className={styles.progHead}>
                      <span className={styles.progNum}>{g.current}<small>of {g.target} {g.unit}</small></span>
                      <span className={styles.metaChip}>{Math.round((g.current! / g.target) * 100)}%</span>
                    </div>
                    <div className={styles.progTrack}><div className={styles.progFill} style={{ width: filled ? `${(g.current! / g.target) * 100}%` : '0' }} /></div>
                  </div>
                ) : (
                  <p className={styles.tierIntro}>Fresh goal. I&rsquo;ll help you chip away at it, one week at a time.</p>
                )}
                <div className={styles.bigGoalMeta}>
                  <span className={styles.metaChip}>Done by {g.targetLabel} · {g.daysLeft} days left</span>
                  <span className={styles.prioWord}>{PRIO_LBL[g.prio - 1]} priority</span>
                  <span className={`${styles.metaChip} ${g.push === 'silent' ? styles.pushChipSilent : styles.pushChip}`}><VMark size={11} />{PUSH_CHIP[g.push]}</span>
                </div>
              </div>
            ))}
            {CreateBlock}

            <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·02</span><span className={styles.eyebrowLbl}>This week with Vitality</span><span className={styles.eyebrowRule} /></div>

            <div className={styles.identity}>
              <span className={styles.idVee}><VMark size={18} /></span>
              <div className={styles.idTop}>
                <span className={styles.idGlyph}>
                  <svg width="24" height="24" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -5 V5 M9 -5 V5 M-9 0 H9 M-6 -7 V7 M6 -7 V7" /></svg>
                </span>
                <div>
                  <div className={styles.idLabel}>Becoming</div>
                  <h2 className={styles.idName}>A <span className={styles.accent}>lifter</span></h2>
                </div>
              </div>
              <div className={styles.meterWrap}>
                <div className={styles.meterTop}><span className={styles.meterLbl}>Identity holding</span><span className={styles.holdChip}>Strong</span></div>
                <div className={styles.meterTrack}><div className={styles.meterFill} style={{ width: filled ? '78%' : '0' }} /></div>
              </div>
              <p className={styles.idFoot}>5 of 7 days this week voted for it. A rough day never breaks this. You&rsquo;re still a lifter.</p>
            </div>

            <div className={styles.habits}>
              <div className={`${styles.habit} ${styles.habitDone}`}>
                <span className={styles.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -4 V4 M9 -4 V4 M-9 0 H9 M-6 -6 V6 M6 -6 V6" /></svg></span>
                <div className={styles.hBody}>
                  <span className={styles.hName}>Train 4 times a week</span>
                  <span className={styles.hMeta}><b>3 of 4</b> this week · from your workouts</span>
                  <button className={styles.peakHint} onClick={() => setPeakPinned(true)}>
                    {peakPinned
                      ? <><CheckIcon size={11} />Pinned to 10am</>
                      : <><svg width="9" height="9" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="0" cy="0" r="8" /></svg>Best at 10am · your peak window</>}
                  </button>
                </div>
                <span className={styles.hState}><span className={styles.autoPill}><CheckIcon size={11} />auto</span></span>
              </div>

              <div className={`${styles.habit} ${styles.habitDone}`}>
                <span className={styles.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" /></svg></span>
                <div className={styles.hBody}>
                  <span className={styles.hName}>Hit your protein</span>
                  <span className={styles.hMeta}><b>done today</b> · from Fuel</span>
                </div>
                <span className={styles.hState}><VMark size={15} /><span className={styles.autoPill}><CheckIcon size={11} />auto</span></span>
              </div>

              <div className={styles.habit}>
                <span className={styles.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 -8 a9 9 0 1 0 6 13 a7 7 0 0 1 -6 -13Z" /></svg></span>
                <div className={styles.hBody}>
                  <span className={styles.hName}>Sleep 8 hours, 3 nights</span>
                  <span className={styles.hMeta}><b>2 of 3</b> nights · from your band</span>
                </div>
                <span className={styles.hState}><span className={styles.progPill}>2 / 3</span></span>
              </div>

              <div className={`${styles.habit} ${meditateDone ? styles.habitDone : ''}`}>
                <span className={styles.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="0" cy="-5" r="3" /><path d="M-7 8 C-7 0 7 0 7 8" /><path d="M-10 -2 L-7 1 M10 -2 L7 1" /></svg></span>
                <div className={styles.hBody}>
                  <span className={styles.hName}>Meditate 10 minutes</span>
                  <span className={styles.hMeta}>{meditateDone ? <><b>done today</b> · nice</> : 'tap when you have done it'}</span>
                </div>
                <span className={styles.hState}>
                  <button className={`${styles.tapDot} ${meditateDone ? styles.tapDotChecked : ''}`} aria-label="mark meditation done" onClick={toggleMeditate}>
                    <span className={styles.tapRing}><CheckIcon size={12} /></span>
                  </button>
                </span>
              </div>
            </div>

            <div className={styles.milestone}>
              <svg width="14" height="14" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M0 -9 L2.6 -2.6 L9 -2.6 L3.8 1.6 L5.8 8 L0 4 L-5.8 8 L-3.8 1.6 L-9 -2.6 L-2.6 -2.6 Z" /></svg>
              12 more votes and we celebrate together
            </div>

            <button className={styles.talkPill}><VMark size={16} />Talk to Vee about your goals</button>
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
                <CoachGem preset="echo" size={172} controlRef={ctrl} signature={null} />
              </div>
              <p className={styles.gemLine}>No setup, no forms. What&rsquo;s something you&rsquo;re <span>working toward</span>?</p>
            </div>

            {CreateBlock}

            <div className={styles.eyebrow}><span className={styles.eyebrowNum}>·01</span><span className={styles.eyebrowLbl}>Already in motion</span><span className={styles.eyebrowRule} /></div>
            <p className={styles.tierIntro}>The small Vitality wins I can already see in your week. Tap one and I&rsquo;ll keep tracking it for you.</p>

            <div className={styles.habits}>
              {[
                { name: 'Train 4 times a week', why: 'you have trained 4x most weeks', glyph: <path d="M-9 -4 V4 M9 -4 V4 M-9 0 H9 M-6 -6 V6 M6 -6 V6" /> },
                { name: 'Hit your protein daily', why: '5 days running in Fuel', glyph: <path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" /> },
                { name: 'Sleep 8 hours, 3 nights', why: 'your band says you are close', glyph: <path d="M4 -8 a9 9 0 1 0 6 13 a7 7 0 0 1 -6 -13Z" /> },
              ].map((s, i) => (
                <div className={styles.suggest} key={i}>
                  <span className={styles.sGlyph}><svg width="19" height="19" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">{s.glyph}</svg></span>
                  <div className={styles.sBody}><div className={styles.sName}>{s.name}</div><div className={styles.sWhy}>{s.why}</div></div>
                  <button className={styles.addBtn} onClick={() => setAdded(a => ({ ...a, [i]: true }))}>
                    {added[i] ? <><CheckIcon size={11} />Added</> : <><svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>Add</>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
