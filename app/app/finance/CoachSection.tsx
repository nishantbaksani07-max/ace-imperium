'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import CoachGem from '@/components/CoachGem'
import CozyLoader from '@/components/CozyLoader'
import RevealText from '@/components/RevealText'
import { COACH_SET } from '@/lib/cozy/coach'
import { getLocalDateKey } from '@/lib/dates'
import {
  assetsChf,
  categoryBreakdown,
  chfToDisplay,
  debtChf,
  monthlyEquivalent,
  monthlyRecap,
  runwayMonths,
  subscriptionAlerts,
  upcomingBills,
  useMonthlyBudget,
  useNetWorthGoal,
  type ExchangeRates,
} from './state'
import type { FinanceState } from './types'
import styles from './coachSection.module.css'

/**
 * ·05 Your money coach — the finance-purposed Echo. Modeled 1:1 on the Fuel
 * coach (app/app/fuel/CoachSection.tsx), retargeted from food to money.
 *
 * Option 5 "split": score + reason on the left, ask box + chat on the right.
 *
 * - Score auto-computes once when the tab opens and caches in localStorage keyed
 *   by day + a cheap money signature (net worth + sub/spend/bill counts). It uses
 *   the cached read when today's numbers are unchanged, and the "↻ rescore" button
 *   re-calls the model after the user edits accounts/subs/orders.
 * - Chat is ephemeral (component state). The finance coach is STATELESS on the
 *   server — there's no coach_messages / memory table (those are nutrition-only).
 *   The coach still "knows you" because the client posts the whole money snapshot
 *   on every call.
 * - The coach's face is Echo, the real gem-library gem (CoachGem preset="echo").
 *   We drive it via controlRef: a thinking beat while a call runs, a mood when it
 *   speaks, a gentle curious idle otherwise.
 *
 * No quiz gate (Fuel's "locked coach" teaser is dropped) and no new avatar — Echo
 * only. The snapshot is built from the single useFinanceState() instance the
 * FinanceModule already holds, passed down as props (no second data hook).
 */

const CACHE_KEY = 'vitality_finance_coach_v1'

const STARTERS = ['am I overspending?', 'what should I cancel?', "how's my month?"]
const CELEBRATED_KEY = 'vitality_finance_coach_celebrated_v1'

// Celebration burst — deterministic mint particles flung out from the gem center.
const BURST_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  const r = 90 + (i % 3) * 22
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) }
})

// The finance snapshot shape the /api/finance/coach route consumes. The `*CHF`
// names are a vestige of canonical storage — we send DISPLAY-currency values
// (the route's prompt says "amounts are already in the user's currency" and it
// labels them with `currency`), so the coach speaks the same numbers the user
// sees on screen.
interface UpcomingBillLite { name: string; amountCHF: number; daysUntil: number }
interface CoachAlertLite { kind: 'trial' | 'hike'; name: string; detail: string }
interface TopCategoryLite { category: string; totalCHF: number }
interface FinanceSnapshot {
  currency: string
  netWorthCHF: number
  monthlyBurnCHF: number
  assetsCHF: number
  debtCHF: number
  cryptoCHF: number
  upcomingBills: UpcomingBillLite[]
  alerts: CoachAlertLite[]
  thisMonthSpendCHF: number
  lastMonthSpendCHF: number
  thisMonthIncomeCHF: number
  netCashFlowCHF: number
  budgetCHF: number | null
  topCategories: TopCategoryLite[]
  runwayMonths: number | null
  goalCHF: number | null
  goalPct: number | null
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface CachedScore { sig: string; score: number | null; reason: string }
type Cache = Record<string, CachedScore>

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Cache) : {}
  } catch {
    return {}
  }
}

function writeCache(dayKey: string, entry: CachedScore) {
  try {
    const cache = readCache()
    cache[dayKey] = entry
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full or disabled — score just won't cache, no crash.
  }
}

/** Build the money snapshot from the live finance state, converted to the user's
 *  display currency so the coach's numbers match the rest of the UI. */
function buildSnapshot(
  state: FinanceState,
  rates: ExchangeRates,
  netWorth: number,
  budgetCHF: number | null,
  goalCHF: number | null,
): FinanceSnapshot {
  const ccy = state.currency
  const d = (chf: number) => Math.round(chfToDisplay(chf, ccy, rates))

  const monthlyBurn = state.subscriptions.reduce((sum, s) => sum + monthlyEquivalent(s), 0)
  const recap = monthlyRecap(state.orders)
  const assets = assetsChf(state.accounts)
  const debt = debtChf(state.accounts)
  const crypto = state.accounts.reduce((sum, a) => sum + (a.type === 'crypto' ? a.amountCHF : 0), 0)
  const runway = runwayMonths(state.accounts, state.subscriptions, state.orders)
  const goalPct = goalCHF && goalCHF > 0 ? Math.round((netWorth / goalCHF) * 100) : null

  const bills = upcomingBills(state.subscriptions).map((b) => ({
    name: b.name,
    amountCHF: d(b.amountCHF),
    daysUntil: b.daysUntil,
  }))

  const alerts: CoachAlertLite[] = subscriptionAlerts(state.subscriptions).map((a) => {
    if (a.kind === 'trial') {
      const detail = a.daysUntil === 0 ? 'free trial ends today' : `free trial ends in ${a.daysUntil}d`
      return { kind: 'trial', name: a.name, detail }
    }
    return { kind: 'hike', name: a.name, detail: `price up: ${d(a.fromCHF ?? 0)} → ${d(a.toCHF ?? 0)}` }
  })

  const topCategories = categoryBreakdown(state.orders).slice(0, 4).map((c) => ({
    category: c.category,
    totalCHF: d(c.total),
  }))

  return {
    currency: ccy,
    netWorthCHF: d(netWorth),
    monthlyBurnCHF: d(monthlyBurn),
    assetsCHF: d(assets),
    debtCHF: d(debt),
    cryptoCHF: d(crypto),
    upcomingBills: bills,
    alerts,
    thisMonthSpendCHF: d(recap.thisMonthCHF),
    lastMonthSpendCHF: d(recap.lastMonthCHF),
    thisMonthIncomeCHF: d(recap.thisMonthIncomeCHF),
    netCashFlowCHF: d(recap.netCHF),
    budgetCHF: budgetCHF == null ? null : d(budgetCHF),
    topCategories,
    runwayMonths: runway == null ? null : Math.round(runway * 10) / 10,
    goalCHF: goalCHF == null ? null : d(goalCHF),
    goalPct,
  }
}

/** A cheap day-stable fingerprint of the money picture: only changes when the
 *  numbers that matter to a verdict move, so we don't re-call the model for noise. */
function signatureOf(s: FinanceSnapshot): string {
  return [
    s.netWorthCHF,
    s.monthlyBurnCHF,
    s.thisMonthSpendCHF,
    s.thisMonthIncomeCHF,
    s.debtCHF,
    s.upcomingBills.length,
    s.alerts.length,
    s.budgetCHF ?? '-',
    s.runwayMonths ?? '-',
    s.goalCHF ?? '-',
  ].join(':')
}

interface CoachSectionProps {
  state: FinanceState
  rates: ExchangeRates
  /** Live total net worth in CHF (from useFinanceState). */
  netWorth: number
}

export default function CoachSection({ state, rates, netWorth }: CoachSectionProps) {
  const { budgetCHF } = useMonthlyBudget()
  const { goalCHF } = useNetWorthGoal()

  const [mounted, setMounted] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [reason, setReason] = useState<string>('')
  const [scoring, setScoring] = useState(false)
  const [scored, setScored] = useState(false) // a score (or empty verdict) has resolved
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatting, setChatting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  // The snapshot + its fingerprint, recomputed whenever the money picture moves.
  const snapshot = useMemo(
    () => buildSnapshot(state, rates, netWorth, budgetCHF, goalCHF),
    [state, rates, netWorth, budgetCHF, goalCHF],
  )
  const sig = useMemo(() => signatureOf(snapshot), [snapshot])
  const hasData = snapshot.netWorthCHF > 0 || snapshot.monthlyBurnCHF > 0

  // Keep refs fresh so the rescore button + chat always send the latest numbers
  // without re-binding their callbacks.
  const snapRef = useRef(snapshot)
  const sigRef = useRef(sig)
  snapRef.current = snapshot
  sigRef.current = sig
  const dayKeyRef = useRef<string>('')

  const chatLogRef = useRef<HTMLDivElement | null>(null)
  // Echo coach gem control: passing controlRef turns off the gem's auto-loop, so
  // we drive it — a 'loading' thinking beat while a call is in flight, a mood
  // reaction when the coach speaks, and a gentle 'curious' idle otherwise.
  const coachCtrl = useRef<((move: string) => void) | null>(null)
  const busyRef = useRef(false)
  const celebTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInit = useRef(false)

  const fire = useCallback((move: string) => {
    coachCtrl.current?.(move)
  }, [])

  // A celebration moment: the gem bursts proud + mint particles fly + the card
  // glows. Once per day per device so it stays special, never naggy.
  const celebrate = useCallback(() => {
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === dayKeyRef.current) return
      localStorage.setItem(CELEBRATED_KEY, dayKeyRef.current)
    } catch {
      /* ignore */
    }
    fire('celebrate')
    setCelebrating(true)
    if (celebTimer.current) clearTimeout(celebTimer.current)
    celebTimer.current = setTimeout(() => setCelebrating(false), 1800)
  }, [fire])

  const fetchScore = useCallback(async () => {
    setScoring(true)
    setErr(null)
    fire('loading')
    try {
      const res = await fetch('/api/finance/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'score', snapshot: snapRef.current }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr('Coach could not score right now.')
        return
      }
      setScore(data.score ?? null)
      setReason(data.reason ?? '')
      setScored(true)
      writeCache(dayKeyRef.current, { sig: sigRef.current, score: data.score ?? null, reason: data.reason ?? '' })
      const sc = data.score
      fire(typeof sc === 'number' ? (sc >= 8 ? 'cheer' : sc >= 5 ? 'nod' : 'consider') : 'curious')
      if (typeof sc === 'number' && sc >= 9) celebrate()
    } catch {
      setErr('Coach could not score right now.')
    } finally {
      setScoring(false)
    }
  }, [fire, celebrate])

  // Mount: resolve today's verdict ONCE — use today's cache when the numbers are
  // unchanged, auto-score when they're not (and there's data), else show the
  // empty nudge. In-session edits don't auto-rescore; the user hits "↻ rescore".
  useEffect(() => {
    setMounted(true)
    if (didInit.current) return
    didInit.current = true
    const todayKey = getLocalDateKey()
    dayKeyRef.current = todayKey

    if (!hasData) {
      setScore(null)
      setReason('')
      setScored(true)
      return
    }
    const cached = readCache()[todayKey]
    if (cached && cached.sig === sigRef.current) {
      setScore(cached.score)
      setReason(cached.reason)
      setScored(true)
      return
    }
    void fetchScore()
    // hasData/fetchScore are read once on the gated init; intentionally not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear the celebration timer on unmount.
  useEffect(() => () => {
    if (celebTimer.current) clearTimeout(celebTimer.current)
  }, [])

  // Track busy so the idle loop never fights an in-flight reaction.
  useEffect(() => {
    busyRef.current = scoring || chatting
  }, [scoring, chatting])

  // Keep Echo alive: a greeting on arrival, then a gentle curious beat while idle.
  useEffect(() => {
    const greet = setTimeout(() => {
      if (!busyRef.current) fire('happyHello')
    }, 1400)
    const idle = setInterval(() => {
      if (!busyRef.current) fire('curious')
    }, 9000)
    return () => {
      clearTimeout(greet)
      clearInterval(idle)
    }
  }, [fire])

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
  }, [messages, chatting])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || chatting) return
      setErr(null)
      const next = [...messages, { role: 'user' as const, content }]
      setMessages(next)
      setInput('')
      setChatting(true)
      fire('loading')
      try {
        const res = await fetch('/api/finance/coach', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'chat', snapshot: snapRef.current, messages: next }),
        })
        const data = await res.json()
        if (!res.ok || typeof data.reply !== 'string') {
          setErr('Coach could not answer right now.')
          return
        }
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
        fire('love')
      } catch {
        setErr('Coach could not answer right now.')
      } finally {
        setChatting(false)
      }
    },
    [messages, chatting, fire],
  )

  const Eyebrow = (
    <div className={styles.eyebrow}>
      <span className={styles.eyebrowNum}>·05</span>
      <span className={styles.eyebrowLbl}>Your money coach</span>
      <span className={styles.eyebrowRule} />
    </div>
  )

  if (!mounted) {
    return (
      <section className={styles.section}>
        {Eyebrow}
        <div className={styles.card} style={{ minHeight: 150 }} />
      </section>
    )
  }

  const busy = scoring || chatting

  return (
    <section className={styles.section}>
      {Eyebrow}
      <div className={`${styles.card} ${celebrating ? styles.cardCelebrate : ''}`}>
        {/* left: the coach — Echo, the real gem-library gem */}
        <div className={styles.gemStage}>
          <CoachGem preset="echo" controlRef={coachCtrl} />
          {celebrating && (
            <span className={styles.burst} aria-hidden>
              {BURST_PARTICLES.map((p, i) => (
                <i key={i} style={{ ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` }} />
              ))}
            </span>
          )}
        </div>

        <div className={styles.divider} />

        {/* right: score + ask */}
        <div className={styles.contentCol}>
          <div className={styles.scoreBody}>
            <span className={styles.scoreLabel}>Today&apos;s money</span>
            {!scored ? (
              <div className={styles.reason} style={{ marginTop: 8 }}>
                Reading your money&hellip;
              </div>
            ) : score == null ? (
              <div className={styles.reason} style={{ marginTop: 8 }}>
                {reason || 'Add an account or a subscription and I will take a look.'}
              </div>
            ) : (
              <>
                <div className={styles.scoreNum}>
                  {score}
                  <span className={styles.scoreOf}>/10</span>
                </div>
                <div className={styles.reason}>
                  <span className={styles.coachTag}>Today&rsquo;s read</span>
                  <RevealText key={reason} text={reason} className={styles.coachBody} />
                </div>
              </>
            )}
            {hasData && scored && (
              <button className={styles.rescore} onClick={() => fetchScore()} disabled={scoring}>
                {scoring ? 'scoring…' : '↻ rescore'}
              </button>
            )}
          </div>

          {/* ask */}
          <div className={styles.askCol}>
          <span className={styles.askLabel}>Ask your coach</span>
          {(messages.length > 0 || chatting) && (
            <div className={styles.chatLog} ref={chatLogRef}>
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className={`${styles.msg} ${styles.msgUser}`}>{m.content}</div>
                ) : (
                  <div key={i} className={`${styles.msg} ${styles.msgCoach}`}>
                    <span className={styles.coachTag}>Echo</span>
                    <RevealText text={m.content} className={styles.coachBody} />
                  </div>
                ),
              )}
              {chatting && (
                <CozyLoader
                  items={COACH_SET.items}
                  tags={COACH_SET.tags}
                  showProgress={false}
                  className={styles.coachThinking}
                />
              )}
            </div>
          )}
          {messages.length === 0 && !chatting && (
            <div className={styles.chips}>
              {STARTERS.map((q) => (
                <button key={q} className={styles.chip} onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          {err && <div className={styles.errline}>{err}</div>}
          <div className={styles.askBar}>
            <input
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ask your coach…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') send(input)
              }}
              disabled={busy}
            />
            <button className={styles.send} onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
              →
            </button>
          </div>
          </div>
        </div>
      </div>
    </section>
  )
}
