'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import CoachGem from '@/components/CoachGem'
import { logNoticedShown } from '@/app/app/mentor/noticedActions'
import { logDriftShown } from '@/app/app/goals/driftActions'
import type { DriftKind } from '@/lib/goals/drift'
import type { MoodPoint, RawMoodFact } from '@/app/app/mentor/moodData'
import type { Note } from '@/app/app/mentor/types'
import { rarityForNotice, type Rarity } from '@/lib/vee/rarity'
import type { FeedNotice } from '@/lib/insights/feed'
import type { SuggestionEvidence, VeeRunStats } from '@/lib/vee/loadNoticed'
import type { BigGoal, HabitGoal } from '@/app/app/goals/veeTypes'
import type { TickerRow } from '@/lib/insights/ticker'
import type { GuideItem, GuideModule } from '@/lib/insights/goalGuide'
import type { LifeChip } from '@/lib/insights/lifeChips'
import type { ClaudeHandoffContext } from '@/lib/vee/claudeHandoff'
import VeeGoalsSection, { type BindingStream } from './vee/VeeGoalsSection'
import { VeeAsk, VeeKeep } from './vee/VeeBottomStrip'
import styles from './veeNoticed.module.css'

/* VeeNoticed - the launch Vee. Three things: the Echo gem (Vee's face), the ONE
 * gamified "Vitality Noticed" card (the WATCHED mono chip carries what Vee
 * connected), and the slim "feed Vee" strip (mood + a note) that gives Vee more
 * of your life to connect. Standard backdrop + glass. Conversation lives in
 * Claude. Rarity = depth; the card explains itself and stays near-empty. */

interface Props {
  firstName: string | null
  feed: FeedNotice[]
  /** Current user id, used client-side to read tile renames from localStorage. */
  userId: string
  /** The run-stats proof strip (days logged, modules feeding in, ...). */
  stats: VeeRunStats
  /** The fused goals engine: authoring data + per-goal steering rows + guides. */
  goals: BigGoal[]
  habits: HabitGoal[]
  rows: TickerRow[]
  guides: Record<string, GuideItem[]>
  lifeChips: LifeChip[]
  /** Real-evidence gates for the auto-track suggestions (loadNoticed). */
  suggestionEvidence?: SuggestionEvidence
  /** The user's own tile streams, for the "what steers this" binding picker. */
  tileStreams?: BindingStream[]
  /** Modules with real data (loadNoticed.activeModules), for the strongest-binding resolver. */
  activeModules?: GuideModule[]
  /** The user's saved "void" thoughts, newest first (bottom strip). */
  notes: Note[]
  /** Last 7 day-slots of mood, oldest first (bottom strip, SSR initial). */
  moodHistory: MoodPoint[]
  /** Raw mood facts (newest first): the strip is rebuilt client-side from these
   *  so day boundaries use the USER'S timezone, not the server's. */
  moodFacts?: RawMoodFact[]
  /** Server-assembled Claude handoff context: every ask arrives in Claude with
   *  the user's real goals, states and stats attached (no new DB reads). */
  claudeContext?: ClaudeHandoffContext | null
  /** Design-harness mode (/vee-live-preview): everything renders, nothing writes. */
  readOnly?: boolean
  /** Harness-only: force the first-ever-click Climb intro overlay open. */
  forceClimbIntro?: boolean
  /** loadNoticed.degraded: some batched read failed, so the data is INCOMPLETE.
   *  Shows one calm "could not read" line instead of cold-start copy, so a DB
   *  hiccup never tells a daily logger they have not logged. */
  degraded?: boolean
}

const RARITY_CLASS: Record<Rarity, string> = {
  common: styles.rCommon, uncommon: styles.rUncommon, rare: styles.rRare,
  epic: styles.rEpic, legendary: styles.rLegendary, mythic: styles.rMythic,
}

/* Rarity, made meaningful: seam length is the story (one signal -> a whole
 * convergence). Revealed on a tap of the tier badge, never cluttering the card. */
const RARITY_MEANING: Record<Rarity, string> = {
  common: 'One signal. A small, true nudge.',
  uncommon: 'Two signals linked. A solid connection.',
  rare: 'Two areas connected. A link you would miss.',
  epic: 'Three areas, one story forming.',
  legendary: 'Three of your tiles, converging on a goal.',
  mythic: 'The rarest convergence in your whole record.',
}

function claudeHref(notice: FeedNotice): string {
  const q = `Vee noticed this in my Vitality data: "${notice.lead}" Help me understand what is driving it and what to do next.`
  return `https://claude.ai/new?q=${encodeURIComponent(q)}`
}

/* ---- the statement's color-coded spans (showcase language, real data only) ----
 * iris = the goal words (the notice's own goalTitle, verbatim in the lead);
 * mint = the pattern / amber = the cost (the watched domain terms, verbatim in
 * the lead, colored by which way the notice moves things). Nothing is invented:
 * every span is a substring the engine already wrote. */
function watchedTerms(watched: string): string[] {
  return watched
    .split('+')
    .map(seg => (seg.split(/[·-]/)[0] ?? '').trim())
    .filter(t => t.length >= 3 && !/^your\b/i.test(t))
}

function renderStatement(notice: FeedNotice): ReactNode {
  const lead = notice.lead
  const lower = lead.toLowerCase()
  const spans: { start: number; end: number; cls: 'ki' | 'km' | 'ka' | 'kk' }[] = []

  // The mint-underlined lever beat: an ENGINE-written verbatim phrase, never
  // invented here. Highest precedence, so nothing else colors inside it.
  if (notice.lever) {
    const i = lower.indexOf(notice.lever.toLowerCase())
    if (i >= 0) spans.push({ start: i, end: i + notice.lever.length, cls: 'kk' })
  }
  if (notice.goalTitle) {
    const i = lower.indexOf(notice.goalTitle.toLowerCase())
    if (i >= 0 && !spans.some(sp => i < sp.end && i + notice.goalTitle!.length > sp.start)) {
      spans.push({ start: i, end: i + notice.goalTitle.length, cls: 'ki' })
    }
  }
  const domainCls = notice.impact === 'dn' ? 'ka' : 'km'
  for (const term of watchedTerms(notice.watched)) {
    const i = lower.indexOf(term.toLowerCase())
    if (i < 0) continue
    if (spans.some(sp => i < sp.end && i + term.length > sp.start)) continue
    spans.push({ start: i, end: i + term.length, cls: domainCls })
  }
  if (spans.length === 0) return lead
  spans.sort((a, b) => a.start - b.start)

  const out: ReactNode[] = []
  let cursor = 0
  spans.forEach((sp, k) => {
    if (sp.start > cursor) out.push(lead.slice(cursor, sp.start))
    const cls = sp.cls === 'kk' ? styles.kk : sp.cls === 'ki' ? styles.ki : sp.cls === 'ka' ? styles.ka : styles.km
    out.push(<strong key={k} className={cls}>{lead.slice(sp.start, sp.end)}</strong>)
    cursor = sp.end
  })
  if (cursor < lead.length) out.push(lead.slice(cursor))
  return out
}

const ClockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
)
const SparkleIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /><path d="M18.7 13.6l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8z" /></svg>
)
const ArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
const TriUp = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5l8 13H4z" /></svg>
const TriDn = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 19L4 6h16z" /></svg>

/* Vee's chevron badge that opens the card. A small identity mark (the real gem is
 * the hero above), not a hand-rolled gem. */
function VMark() {
  return (
    <span className={styles.vMark} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7l7 11 7-11" />
      </svg>
    </span>
  )
}

function NoticedCard({ feed, readOnly = false }: { feed: FeedNotice[]; readOnly?: boolean }) {
  const [idx, setIdx] = useState(0)
  const [tierOpen, setTierOpen] = useState(false)
  const notice = feed[idx] ?? feed[0]

  useEffect(() => {
    if (readOnly) return
    if (notice?.patternKey) void logNoticedShown(notice.patternKey)
    // A drift notice shown here counts as shown: write its goal_nudges cooldown
    // (2-12 days by push level) so it rests instead of repeating on every load.
    if (notice?.source === 'drift' && notice.driftKind) void logDriftShown(notice.driftKind as DriftKind)
  }, [notice?.patternKey, notice?.source, notice?.driftKind, readOnly])

  if (!notice) return null

  const rarity = rarityForNotice(notice)
  const dotTone = notice.impact === 'dn' ? styles.warn : styles.good
  const badgeDelay = 0.35

  function another() {
    setTierOpen(false)
    setIdx(v => (v + 1) % feed.length)
  }

  return (
    <section className={`${styles.noticed} ${RARITY_CLASS[rarity]}`} aria-label="Vitality noticed" key={`card-${idx}`}>
      <span className={styles.rarityEdge} aria-hidden />
      <div className={styles.bloom} key={`bloom-${idx}`} aria-hidden />

      {/* showcase head: V badge + label + rarity pill left, the watched chip right */}
      <div className={styles.noticedHead}>
        <VMark />
        <span className={styles.noticedLabel}>VITALITY NOTICED</span>
        <button
          type="button"
          className={styles.rbadge}
          style={{ animationDelay: `${badgeDelay}s` }}
          onClick={() => setTierOpen(o => !o)}
          aria-expanded={tierOpen}
        >
          <span className={styles.rgem} />{rarity}
        </button>
        <span className={styles.headSpacer} />
        <span className={styles.watchedChip}>{ClockIcon}watched · {notice.watched}</span>
      </div>

      {tierOpen && <p className={styles.tierMeaning}>{RARITY_MEANING[rarity]}</p>}

      {/* the big statement, showcase spans: mint pattern / amber cost / iris goal,
          plus the mint-underlined lever beat when the engine wrote one */}
      <p className={styles.statement} key={`statement-${idx}`}>{renderStatement(notice)}</p>

      {notice.goalTitle && (
        <a className={styles.impactRow} href="#vee-goals" key={`impact-${idx}`}>
          <span className={styles.il}>moves your goals</span>
          <span className={`${styles.gimp} ${notice.impact === 'dn' ? styles.gimpDn : styles.gimpUp}`}>
            {notice.impact === 'dn' ? TriDn : TriUp}
            {notice.goalTitle}
          </span>
        </a>
      )}

      {notice.receipts.length > 0 && (
        <div className={styles.receipts} key={`receipts-${idx}`}>
          {notice.receipts.map((r, i) => (
            <span key={i} className={styles.receipt} style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
              <span className={`${styles.dot} ${dotTone}`} />{r}
            </span>
          ))}
        </div>
      )}

      <div className={styles.acts}>
        {notice.action && (
          <Link className={styles.actMint} href={notice.action.href}>
            {ArrowIcon}
            {notice.action.label}
          </Link>
        )}
        <a className={styles.clB} href={claudeHref(notice)} target="_blank" rel="noreferrer">
          {SparkleIcon}
          talk deeper in Claude
        </a>
        {feed.length > 1 && (
          <button type="button" className={styles.nextBtn} onClick={another} aria-label="Show me another">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        )}
      </div>
    </section>
  )
}

/* The Rarity Climb - the intro animation. The six tiers stack (mythic at the top,
 * common at the base) and light up from the bottom up, bars filling, mythic
 * flaring last. Explains the whole game in one moment: rarer = deeper. Used both
 * as the zero-data hero and inside the "how Vee works" info overlay. */
const CLIMB_TIERS = [
  { k: 'common', c: 'var(--r-common)', l: 'Common' },
  { k: 'uncommon', c: 'var(--r-uncommon)', l: 'Uncommon' },
  { k: 'rare', c: 'var(--r-rare)', l: 'Rare' },
  { k: 'epic', c: 'var(--r-epic)', l: 'Epic' },
  { k: 'legendary', c: 'var(--r-legendary)', l: 'Legendary' },
  { k: 'mythic', c: 'var(--r-mythic)', l: 'Mythic' },
] as const

function RarityClimb({ line }: { line?: ReactNode }) {
  const topDown = [...CLIMB_TIERS].reverse() // mythic first (top) -> common (bottom)
  return (
    <div className={styles.climbWrap}>
      <div className={styles.climb}>
        {/* the swipe: one light streak crosses, the rows reveal in its wake */}
        <span className={styles.climbSweep} aria-hidden />
        {topDown.map((t, i) => {
          const d = 0.2 + i * 0.045 // tight top-to-bottom cascade, reads as one motion behind the swipe
          const pulse = t.k === 'mythic' || t.k === 'legendary'
          return (
            <div
              key={t.k}
              className={`${styles.climbRung} ${RARITY_CLASS[t.k]} ${pulse ? styles.climbPulse : ''}`}
              style={{ animationDelay: `${d}s` }}
            >
              <span className={styles.climbDiamond} />
              <span className={styles.climbLabel}>{t.l}</span>
              <span className={styles.climbBar} style={{ animationDelay: `${d + 0.12}s` }} />
            </div>
          )
        })}
      </div>
      {line && <p className={styles.climbLine}>{line}</p>}
    </div>
  )
}

const CLIMB_LINE = <>Every tile you log feeds Vee. <b>The more of your life it connects, the rarer the find.</b></>

/* The one honest cold-start line inside the card: plain words, no promises the
   engine has not earned. Alex tweaks the wording live. */
const COLD_LINE = 'use Vitality a little each day. your first find comes from what you log.'

/* The one calm degraded line (loadNoticed.degraded): a failed read must never
   impersonate a cold start, so a daily logger is never told they have not logged. */
const DEGRADED_LINE = 'some of your data could not be read just now. everything you logged is safe, it will be back on the next open.'

/* The one-sentence explainer that fully tells a confused user what Vee is for.
   Tops the Climb in the intro overlay and the "how Vee works" tab (Alex tweaks live). */
const VEE_EXPLAINER = 'Vee reads everything you log across Vitality and shows you the one pattern that is quietly helping or hurting your goals. The rarer the find, the deeper the connection.'

/* localStorage flag: the Climb intro plays once, on the FIRST-EVER click on Vee. */
function climbSeenKey(userId: string): string {
  return `vee:climb-intro-seen:${userId}`
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
}

/* Numbered section chrome (the showcase language): serif italic ·NN + mono label. */
function SecHead({ num, label }: { num: string; label: string }) {
  return (
    <div className={styles.secHead}>
      <span className={styles.secNum}>{num}</span>
      <span className={styles.secLbl}>{label}</span>
      <span className={styles.secRule} aria-hidden />
    </div>
  )
}

/* The run-stats proof strip under the hero: honest counts only. A stat renders
   only when it is real (> 0 / non-null); a brand-new account shows nothing. */
function StatsStrip({ stats }: { stats: VeeRunStats }) {
  const items: { key: string; icon: ReactNode; value: string; label: string }[] = []
  if (stats.daysLogged > 0) items.push({
    key: 'days',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>,
    value: String(stats.daysLogged), label: stats.daysLogged === 1 ? 'day logged' : 'days logged',
  })
  if (stats.modulesFeeding > 0) items.push({
    key: 'modules',
    icon: <path d="M4 19V5M4 19h16M9 15l3-4 3 2 4-6" />,
    value: String(stats.modulesFeeding), label: stats.modulesFeeding === 1 ? 'module feeding in' : 'modules feeding in',
  })
  if (stats.insightsFound > 0) items.push({
    key: 'insights',
    icon: <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />,
    value: String(stats.insightsFound), label: stats.insightsFound === 1 ? 'insight found' : 'insights found',
  })
  if (stats.rarestTier) items.push({
    key: 'rarest',
    icon: <path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" />,
    value: stats.rarestTier, label: 'rarest find',
  })
  if (items.length === 0) return null
  return (
    <div className={styles.stats}>
      {items.map(it => (
        <span key={it.key} className={styles.stat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{it.icon}</svg>
          <b>{it.value}</b> {it.label}
        </span>
      ))}
    </div>
  )
}

interface Mote { left: number; top: number; size: number; dur: number; delay: number; dx: number; dy: number }

export default function VeeNoticed({ firstName, feed, userId, stats, goals, habits, rows, guides, lifeChips, suggestionEvidence, tileStreams, activeModules, notes, moodHistory, moodFacts, claudeContext = null, readOnly = false, forceClimbIntro = false, degraded = false }: Props) {
  const [greeting, setGreeting] = useState('Hello')
  const [motes, setMotes] = useState<Mote[]>([])
  const [infoOpen, setInfoOpen] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const seeded = useRef(false)

  // The Climb intro: every new user's FIRST-EVER click on Vee plays it once
  // (decided after mount so SSR and client never disagree; skippable by tap).
  useEffect(() => {
    if (forceClimbIntro) { setIntroOpen(true); return }
    if (readOnly) return
    try {
      if (!localStorage.getItem(climbSeenKey(userId))) setIntroOpen(true)
    } catch { /* storage blocked: skip the intro, never break the page */ }
  }, [forceClimbIntro, readOnly, userId])

  function dismissIntro() {
    if (!readOnly) {
      try { localStorage.setItem(climbSeenKey(userId), '1') } catch { /* fail quiet */ }
    }
    setIntroOpen(false)
  }

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening')

    if (seeded.current) return
    seeded.current = true
    setMotes(Array.from({ length: 14 }, () => ({
      left: Math.random() * 100,
      top: 55 + Math.random() * 40,
      size: 1.5 + Math.random() * 2.5,
      dur: 16 + Math.random() * 16,
      delay: -Math.random() * 20,
      dx: (Math.random() - 0.5) * 40,
      dy: 60 + Math.random() * 45,
    })))
  }, [])

  const hasFeed = feed.length > 0

  return (
    <div className={styles.root}>
      {/* the world / atmosphere - aurora, mountains, drifting motes, grain */}
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="veeMtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="veeMtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#veeMtFar)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#veeMtNear)" />
        </svg>
      </div>
      <div className={styles.particles} aria-hidden>
        {motes.map((p, i) => (
          <span key={i} style={{
            left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size,
            animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
            '--dx': `${p.dx}px`, '--dy': `-${p.dy}vh`,
          } as CSSProperties} />
        ))}
      </div>
      <div className={styles.grain} aria-hidden />

      <main className={styles.page}>
        {/* slim header */}
        <header className={styles.head}>
          <Link className={styles.back} href="/app" aria-label="Back to dashboard">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            DASHBOARD
          </Link>
          <span style={{ flex: 1 }} />
          <button type="button" className={styles.infoBtn} onClick={() => setInfoOpen(true)} aria-label="How Vee works">
            <InfoIcon />how vee works
          </button>
        </header>

        {/* THE HERO ROW (v1.2): the gem + greeting LEFT, the ·01 card RIGHT,
            vertically centered and balanced. Stacks to gem-then-card on mobile.
            Kills the old full-screen empty scroll before the first card. */}
        <div className={styles.heroRow}>
          {/* the Echo gem - Vee's face */}
          <section className={styles.hero} aria-label="Vee">
            <div className={styles.gemStage}><CoachGem preset="echo" /></div>
            <span className={styles.label}>VITALITY · VEE</span>
            <h1 className={styles.greet} suppressHydrationWarning>
              {greeting}{firstName ? <>, <em>{firstName}</em></> : ''}.
            </h1>
            <p className={styles.presence}>
              {hasFeed ? 'here is the one thing worth your attention.' : 'watching quietly. the first thing worth telling you lands here.'}
            </p>
            <span className={styles.status}><span className={styles.sd} />{hasFeed ? 'one thing noticed' : 'listening'}</span>
            <StatsStrip stats={stats} />
            {degraded && hasFeed && <p className={styles.degradedLine} role="status">{DEGRADED_LINE}</p>}
          </section>

          {/* ·01 the one gamified "Vitality noticed" card, or the calm cold start */}
          <section className={`${styles.pageSection} ${styles.heroCard}`} aria-label="Vitality noticed">
            <SecHead num="·01" label="Vitality noticed" />
            <p className={styles.secLede}>the rarer the find, the deeper it reached into your life.</p>
            {hasFeed ? (
              <NoticedCard feed={feed} readOnly={readOnly} />
            ) : degraded ? (
              /* A failed read is NOT a cold start: one calm line, no "log your
                 first" pitch to someone whose data simply could not be read. */
              <div className={styles.coldCard} aria-label="Some of your data could not be read">
                <span className={styles.introEyebrow}>a quiet hiccup</span>
                <p className={styles.coldSub} role="status">{DEGRADED_LINE}</p>
              </div>
            ) : (
              /* the cold start, funneled into ONE cozy card: same frame language as
                 the Noticed card, the exact RarityClimb inside, one plain honest line.
                 Keyed on introOpen so the cozy entrance REPLAYS after a first-time
                 user dismisses the Climb intro overlay (otherwise the whole
                 choreography runs hidden underneath it and lands frozen). */
              <div key={introOpen ? 'cold-behind-intro' : 'cold-shown'} className={styles.coldCard} aria-label="Your first find is coming">
                <span className={styles.introEyebrow}>your first find is coming</span>
                <RarityClimb line={CLIMB_LINE} />
                <p className={styles.coldSub}>{COLD_LINE}</p>
              </div>
            )}
          </section>
        </div>

        {/* ·02 the fused FULL goals engine: author a goal, watch Vee steer it */}
        <section className={`${styles.pageSection} ${styles.narrow}`} id="vee-goals" aria-label="Your goals">
          <SecHead num="·02" label="Your goals" />
          <p className={styles.secLede}>set a goal. I steer it with your real data.</p>
          <VeeGoalsSection goals={goals} habits={habits} rows={rows} guides={guides} lifeChips={lifeChips} daysLogged={stats.daysLogged} suggestionEvidence={suggestionEvidence} tileStreams={tileStreams} activeModules={activeModules} readOnly={readOnly} />
        </section>

        {/* ·03 refocused on CLAUDE: one composer, one destination */}
        <section className={`${styles.pageSection} ${styles.narrow}`} aria-label="Ask Vee">
          <SecHead num="·03" label="Ask Vee" />
          <p className={styles.secLede}>ask anything. the conversation lives in Claude.</p>
          <VeeAsk claudeContext={claudeContext} />
        </section>

        {/* ·04 the kept strip: thoughts + mood, alive in their own right */}
        <section className={`${styles.pageSection} ${styles.narrow}`} aria-label="Leave a thought">
          <SecHead num="·04" label="Leave a thought" />
          <VeeKeep notes={notes} moodHistory={moodHistory} moodFacts={moodFacts} readOnly={readOnly} />
        </section>
      </main>

      {infoOpen && (
        <div className={styles.infoOverlay} onClick={() => setInfoOpen(false)} role="dialog" aria-modal="true" aria-label="How Vee works">
          <div className={styles.infoPanel} onClick={e => e.stopPropagation()}>
            <button type="button" className={styles.infoClose} onClick={() => setInfoOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <span className={styles.infoTitle}>How Vee works</span>
            <p className={styles.explainer}>{VEE_EXPLAINER}</p>
            <RarityClimb line={CLIMB_LINE} />
          </div>
        </div>
      )}

      {/* the first-ever-click Climb intro: the whole game in one moment, tap to skip */}
      {introOpen && (
        <div className={styles.introOverlay} onClick={dismissIntro} role="dialog" aria-modal="true" aria-label="Meet Vee">
          <div className={styles.introPanel}>
            <span className={styles.introEyebrow}>meet vee</span>
            <p className={styles.explainer}>{VEE_EXPLAINER}</p>
            <RarityClimb line={CLIMB_LINE} />
            <span className={styles.introSkip}>tap anywhere to continue</span>
          </div>
        </div>
      )}
    </div>
  )
}
