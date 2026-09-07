'use client'

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import DashboardHeaderGem from '../DashboardHeaderGem'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import { createClient } from '@/lib/supabase/client'
import { getLocalDateKey } from '@/lib/dates'
import type { HomePull } from '@/lib/home/pullTypes'
import { derivePresence, typicalKcal, waterPace, type Presence } from '@/lib/home/presence'
import HomeActVitals from './acts/HomeActVitals'
import HomeActPeak from './acts/HomeActPeak'
import HomeActGym from './acts/HomeActGym'
import styles from './homecoming.module.css'

/**
 * "Vitality, I'm home" - the daily ritual stage machine.
 *
 * Tap the dashboard gem: the world fades to the signature backdrop, the gem
 * (DashboardHeaderGem, the proven wrapper that sizes HeroCrystal correctly)
 * holds center while ONE composite pull (/api/home/pull, HomePull contract in
 * lib/home/pullTypes.ts) reads the whole day. Then the gem docks top-center
 * and the ritual walks ONLY the beats this account's data earns (THE LAW:
 * zero-input, presence-driven, anticipate never ask - lib/home/presence.ts):
 *
 *   ARRIVE -> [VITALS?] -> [PEAK?] -> [GYM?] -> QUESTIONS -> CLOSE
 *   ARRIVE -> QUESTIONS -> CLOSE   (fuel/water streams only)
 *   ARRIVE -> QUIET -> CLOSE       (no streams at all, or pull unreachable)
 *
 * A one-tile account gets a short warm briefing about its one stream; a
 * power account gets the full film. The shell owns the fixed stage, backdrop,
 * scrim, gem, exit X, crossfades, per-act skip, and the two end questions
 * (tap pills only). Acts live in ./acts/*; each mounts inside an error
 * boundary so a crashing act can never strand the ritual. Every number shown
 * anywhere is engine-derived from the pull, never invented; inferences read
 * as anticipations ("reads as", "you usually land around"), never as facts.
 */

type Phase = 'arrive' | 'vitals' | 'peak' | 'gym' | 'questions' | 'quiet' | 'close'

const PULL_BEATS = ['PULLING YOUR DAY', 'READING YOUR NUMBERS', 'SHAPING THE PICTURE']

/** The presence-driven phase sequence. Absent streams simply do not exist. */
function buildSequence(presence: Presence): Phase[] {
  const beats: Phase[] = []
  if (presence.usesVitals) beats.push('vitals')
  if (presence.usesPeak) beats.push('peak')
  if (presence.usesTrain) beats.push('gym')
  if (beats.length > 0) return ['arrive', ...beats, 'questions', 'close']
  // Fuel/water-only accounts skip straight to the questions + the recap close
  // (their stream lines live there) instead of a wrong "nothing logged" slate.
  if (presence.usesFuel || presence.usesWater) return ['arrive', 'questions', 'close']
  return ['arrive', 'quiet', 'close']
}

/* ── Ritual memory (localStorage for now, no new table) ─────────────────── */

interface ImHomeState {
  trackFuel: boolean | null
  layoutDay: boolean | null
  lastRun: string | null
}

function saveImHome(userId: string | null, patch: Partial<ImHomeState>) {
  try {
    const key = `vitality:${userId ?? 'anon'}:imhome`
    const prev = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Partial<ImHomeState>
    window.localStorage.setItem(key, JSON.stringify({ ...prev, ...patch }))
  } catch {
    /* storage unavailable: the ritual still runs, it just will not remember */
  }
}

/* ── Act crash guard ────────────────────────────────────────────────────── */

/** An act throwing must never strand the ritual: apologize, offer the door. */
class ActBoundary extends Component<{ onSkip: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className={styles.actFail}>
          <p className={styles.vee}>
            <span className={`${styles.veeTag} ${styles.veeTagAmber}`}>VEE</span>
            That part of the picture slipped out of my hands. Not your fault. Let me keep going.
          </p>
          <button type="button" className={styles.next} onClick={this.props.onSkip}>
            Keep going
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── The shell ──────────────────────────────────────────────────────────── */

export default function Homecoming({
  firstName,
  onClose,
}: {
  firstName: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('arrive')
  const [leaving, setLeaving] = useState(false)
  const [settling, setSettling] = useState(false)
  const [beat, setBeat] = useState(0)
  const [pull, setPull] = useState<HomePull | null>(null)
  const [presence, setPresence] = useState<Presence | null>(null)
  const [pullFailed, setPullFailed] = useState(false)
  const [q1, setQ1] = useState<boolean | null>(null)
  const [q2, setQ2] = useState<boolean | null>(null)

  const phaseRef = useRef<Phase>('arrive')
  // The presence-built phase order; quiet fallback until the pull lands.
  const seqRef = useRef<Phase[]>(['arrive', 'quiet', 'close'])
  const leavingRef = useRef(false)
  const closedRef = useRef(false)
  const uidRef = useRef<string | null>(null)
  const rm = useRef(false)

  useEffect(() => {
    rm.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  // The ritual memory is per-user; grab the id once (RLS already scoped the pull).
  useEffect(() => {
    let alive = true
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) uidRef.current = data.user?.id ?? null
      })
    return () => {
      alive = false
    }
  }, [])

  // Crossfade helper: fade the current phase out, then switch. Guarded so a
  // double onDone (act bug, double tap) cannot skip two phases at once.
  const goTo = useCallback((next: Phase) => {
    if (leavingRef.current) return
    if (rm.current) {
      // Reduced motion still needs the double-advance guard: a double tap on
      // SKIP must not jump two phases (verify LOW-2). One micro-task beat.
      leavingRef.current = true
      phaseRef.current = next
      setPhase(next)
      window.setTimeout(() => { leavingRef.current = false }, 50)
      return
    }
    leavingRef.current = true
    setLeaving(true)
    window.setTimeout(() => {
      leavingRef.current = false
      setLeaving(false)
      phaseRef.current = next
      setPhase(next)
    }, 340)
  }, [])

  const close = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  // One advance for everything: act onDone, the shell skip, boundary rescue.
  // Walks the presence-built sequence; anything off-script exits cleanly.
  const advance = useCallback(() => {
    const cur = phaseRef.current
    const seq = seqRef.current
    const i = seq.indexOf(cur)
    if (cur === 'close' || i === -1 || i === seq.length - 1) {
      close()
      return
    }
    goTo(seq[i + 1])
  }, [close, goTo])

  // Esc exits the ritual - unless the user is mid-typing in an act field
  // (check-in numbers, substance search). There Esc just blurs the field, so
  // the close-the-picker instinct never nukes typed data (verify LOW-3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        t.blur()
        return
      }
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // The one composite pull + the arrive dwell. The gem holds its loading
  // breath until BOTH the data and the minimum beat time have passed, then a
  // bright settle carries the stage into the first act. A pull that comes
  // back empty (or not at all) routes to the quiet slate instead of running
  // empty acts.
  useEffect(() => {
    let alive = true
    const started = Date.now()
    const beatTimer = window.setInterval(() => {
      setBeat((b) => (b + 1) % PULL_BEATS.length)
    }, 1400)

    ;(async () => {
      let data: HomePull | null = null
      try {
        // 10s cap so a hung (not failed) fetch can never strand the arrive
        // beats cycling forever (verify LOW-8); timeout routes to quiet.
        const res = await fetch(`/api/home/pull?day=${getLocalDateKey()}`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) data = (await res.json()) as HomePull
      } catch {
        /* degraded pull: the quiet slate carries the ritual */
      }
      if (!alive) return

      if (data) setPull(data)
      setPullFailed(!data)
      // Presence decides which beats exist AT ALL - the ritual gracefully
      // shortens to whatever streams this account actually uses.
      const pres = data ? derivePresence(data) : null
      if (pres) setPresence(pres)
      seqRef.current = pres ? buildSequence(pres) : ['arrive', 'quiet', 'close']
      const next: Phase = seqRef.current[1]

      const dwell = rm.current ? 0 : Math.max(0, 2400 - (Date.now() - started))
      window.setTimeout(() => {
        if (!alive) return
        window.clearInterval(beatTimer)
        if (rm.current) {
          phaseRef.current = next
          setPhase(next)
          return
        }
        setSettling(true)
        window.setTimeout(() => {
          if (alive) goTo(next)
        }, 260)
        window.setTimeout(() => {
          if (alive) setSettling(false)
        }, 720)
      }, dwell)
    })()

    return () => {
      alive = false
      window.clearInterval(beatTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reaching CLOSE stamps the run, whichever path got here.
  useEffect(() => {
    if (phase === 'close') saveImHome(uidRef.current, { lastRun: pull?.today ?? getLocalDateKey() })
  }, [phase, pull])

  const answerQ1 = (v: boolean) => {
    if (q1 !== null) return
    setQ1(v)
    saveImHome(uidRef.current, { trackFuel: v, lastRun: pull?.today ?? getLocalDateKey() })
  }
  // ANTICIPATE, NEVER ASK: when the data already shows both streams in use,
  // Vee does not ask whether you track them - Q1 answers itself from presence
  // and only Q2 renders (verify MED-5).
  const q1Known = !!(presence?.usesFuel && presence?.usesWater)
  useEffect(() => {
    if (phase === 'questions' && q1 === null && q1Known) {
      setQ1(true)
      saveImHome(uidRef.current, { trackFuel: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q1Known])
  const answerQ2 = (v: boolean) => {
    if (q2 !== null) return
    setQ2(v)
    saveImHome(uidRef.current, { layoutDay: v, lastRun: pull?.today ?? getLocalDateKey() })
    window.setTimeout(() => advance(), rm.current ? 0 : 650)
  }

  const isAct = phase === 'vitals' || phase === 'peak' || phase === 'gym'
  const fade = leaving ? styles.bodyLeaving : ''

  // Close-recap stream lines: only when the stream exists, only claims the
  // data supports. Typicals are anticipations ("you usually land around").
  const fmtNum = (n: number) => n.toLocaleString('en-US')
  const fuelLine = (() => {
    if (!pull || !presence?.usesFuel || !pull.fuel) return null
    const usual = typicalKcal(pull.fuel.recentDayKcals)
    if (pull.fuel.todayKcal != null) {
      return usual != null
        ? `Fuel: ${fmtNum(pull.fuel.todayKcal)} kcal in so far. You usually land around ${fmtNum(usual)}.`
        : `Fuel: ${fmtNum(pull.fuel.todayKcal)} kcal in so far.`
    }
    return usual != null
      ? `Fuel: nothing logged yet. You usually land around ${fmtNum(usual)} kcal.`
      : null
  })()
  const waterLine = (() => {
    if (!pull || !presence?.usesWater) return null
    const pace = waterPace(pull.waterRecent ?? [], pull.today)
    if (pace.todayCount > 0) {
      return pace.typical != null
        ? `Water: ${pace.todayCount} down today. You usually land around ${pace.typical}.`
        : `Water: ${pace.todayCount} down today.`
    }
    return pace.typical != null
      ? `Water: you usually land around ${pace.typical} servings a day.`
      : null
  })()

  return (
    <div className={styles.stage} role="dialog" aria-modal="true" aria-label="Vitality, I'm home">
      <WelcomeBackdrop />
      <div className={styles.scrim} />
      {settling && <div className={styles.settleFlash} aria-hidden />}

      {/* The gem: center-large during arrive, docked top-center for the acts.
          One transform-only transition on the wrapper (no filter on the mover);
          DashboardHeaderGem keeps HeroCrystal honest inside a 200px stage. */}
      <div className={`${styles.gemWrap} ${phase === 'arrive' ? styles.gemCenter : styles.gemDock}`}>
        <DashboardHeaderGem size={200} />
      </div>

      <button type="button" className={styles.exit} onClick={close} aria-label="Leave the ritual">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      {isAct && pull && presence ? (
        <div className={`${styles.actFrame} ${fade}`}>
          <div className={styles.actStage}>
            <ActBoundary key={phase} onSkip={advance}>
              {phase === 'vitals' && (
                <HomeActVitals pull={pull} presence={presence} firstName={firstName} onDone={advance} />
              )}
              {phase === 'peak' && <HomeActPeak pull={pull} firstName={firstName} onDone={advance} />}
              {phase === 'gym' && <HomeActGym pull={pull} firstName={firstName} onDone={advance} />}
            </ActBoundary>
          </div>
          <button type="button" className={styles.skip} onClick={advance}>
            SKIP
          </button>
        </div>
      ) : (
        <div className={`${styles.body} ${fade}`}>
          {phase === 'arrive' && (
            <div className={styles.arrive}>
              <p className={styles.vee}>
                <span className={styles.veeTag}>VEE</span>
                Welcome home, {firstName}. Give me a second, I am pulling your whole day.
              </p>
              <div className={styles.beatRow} aria-live="polite">
                <span className={styles.beatDot} />
                <span className={styles.beatText}>{PULL_BEATS[beat]}</span>
              </div>
            </div>
          )}

          {phase === 'quiet' && (
            <div className={styles.quiet}>
              <p className={styles.vee}>
                <span className={styles.veeTag}>VEE</span>
                {pullFailed
                  ? 'I could not reach your day just now. No numbers, no problem. We go by feel.'
                  : 'Nothing logged anywhere yet. A quiet slate, and the whole day is still yours.'}
              </p>
              <button type="button" className={styles.next} onClick={advance}>
                Carry on
              </button>
            </div>
          )}

          {phase === 'questions' && (
            <div className={styles.questions}>
              <p className={styles.vee}>
                <span className={styles.veeTag}>VEE</span>
                {q1Known ? 'Before I set your day, one quick one.' : 'Before I set your day, two quick ones.'}
              </p>
              {!q1Known && (
                <div className={styles.question}>
                  <p className={styles.questionLine}>
                    Are you tracking water and macros too, or is that too much right now
                  </p>
                  <div className={styles.togglePair}>
                    <button
                      type="button"
                      className={`${styles.toggle} ${q1 === true ? styles.toggleOn : ''}`}
                      onClick={() => answerQ1(true)}
                    >
                      Tracking both
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggle} ${q1 === false ? styles.toggleOn : ''}`}
                      onClick={() => answerQ1(false)}
                    >
                      Too much right now
                    </button>
                  </div>
                </div>
              )}
              {(q1 !== null || q1Known) && (
                <div className={styles.question}>
                  <p className={styles.questionLine}>
                    Want me to lay out your day and drop the gym on your best window
                  </p>
                  <div className={styles.togglePair}>
                    <button
                      type="button"
                      className={`${styles.toggle} ${q2 === true ? styles.toggleOn : ''}`}
                      onClick={() => answerQ2(true)}
                    >
                      Lay it out
                    </button>
                    <button
                      type="button"
                      className={`${styles.toggle} ${q2 === false ? styles.toggleOn : ''}`}
                      onClick={() => answerQ2(false)}
                    >
                      I will shape it myself
                    </button>
                  </div>
                </div>
              )}
              {/* The questions must never be a wall between the acts and the
                  close celebration: a quiet out keeps the beat (verify LOW-4). */}
              <button type="button" className={styles.skip} onClick={advance}>
                LATER
              </button>
            </div>
          )}

          {phase === 'close' && (
            <div className={styles.closeAct}>
              <span className={styles.eyebrow}>YOUR DAY IS SET</span>
              <h1 className={styles.hero}>
                Let&apos;s get after it, <em>{firstName}</em>.
              </h1>
              {pull?.trainingDay && (
                <p className={styles.heroSub}>{pull.trainingDay} is waiting for you.</p>
              )}
              {(fuelLine || waterLine) && (
                <div className={styles.recap}>
                  {fuelLine && <p className={styles.recapLine}>{fuelLine}</p>}
                  {waterLine && <p className={styles.recapLine}>{waterLine}</p>}
                </div>
              )}
              <button type="button" className={styles.enter} onClick={close}>
                Enter my day
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
