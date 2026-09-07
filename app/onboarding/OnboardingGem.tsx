'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { saveOnboardingProfile, completeOnboarding } from './actions'
import { loadOnboardingCache, saveOnboardingCache, clearOnboardingCache } from '@/lib/vitality/onboardingCache'
import { GemBurst, useGemBurst, type BurstKind } from '@/components/GemBurst'
import { BirthdayPicker } from './BirthdayPicker'
import styles from './onboardingGem.module.css'
import type { Units, Sex, FocusArea } from '@/lib/supabase/types'

// HeroCrystal is Three.js — client-only, SSR-disabled.
const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

const FOCUS_OPTIONS: { value: FocusArea; label: string; sub: string }[] = [
  { value: 'body',     label: 'Get in shape',            sub: 'Train, eat, recover.' },
  { value: 'mind',     label: 'Sharpen my mind',         sub: 'Mentor, goals, journaling.' },
  { value: 'peak',     label: 'Peak energy + performance', sub: 'Sleep, recovery, the daily edge.' },
  { value: 'brand',    label: 'Build something',         sub: 'Brand, audience, your business.' },
  { value: 'money',    label: 'Master my money',         sub: 'Net worth, spending, subs.' },
]
const FOCUS_CAP = 3

// Gem reaction per chapter advance (steps 1→2, 2→3, 3→4). Varied so each
// continue feels distinct: a proud check, an aha bolt, then a peppy cheer.
const STEP_MOVES = ['proud', 'idea', 'encourage'] as const

// Short, upbeat gem moods played at random when you answer a button question
// or flip a toggle — a quick "nice pick" reaction. Includes 'spin' (the
// no-loading-icon spin: keeps the V and just spins).
const HAPPY_MOVES = ['proud', 'excited', 'idea', 'cheer', 'twinkle', 'nod', 'groove', 'spin'] as const

// Rich pool of simple pulse bursts (ported into GemBurst from the gem-library
// lab) — a random one fires on each answer so the gem never repeats itself.
const BURST_POOL: BurstKind[] = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit', 'bloom', 'spiral', 'ripple']

interface FormState {
  firstName: string
  birthday: string
  sex: Sex | ''
  heightCm: string
  heightFt: string
  heightIn: string
  startingWeightKg: string
  startingWeightLbs: string
  units: Units
  focusAreas: FocusArea[]
}

export interface InitialData {
  firstName?: string
  birthday?: string
  sex?: Sex
  heightCm?: number
  startingWeightKg?: number
  units?: Units
  focusAreas?: FocusArea[]
}

interface Props {
  userId: string
  initialStep: number
  initialData: InitialData
}

// Step model:
//   0 — Intro greeting (gem says hi, "begin")
//   1 — Name
//   2 — Birthday + sex
//   3 — Units + height + weight
//   4 — Goal
//   5 — Done (gem celebrates, "let me show you around" → /welcome)
const TOTAL_Q_STEPS = 4

export function OnboardingGem({ userId, initialStep, initialData }: Props) {
  const [step, setStep] = useState(initialStep)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Gem reactions: the gem nods you along each step and throws a real
  // celebration (gift + confetti) the moment onboarding is done.
  const gemControl = useRef<((move: string) => void) | null>(null)
  const { burst, fire: fireBurst } = useGemBurst()

  // Floating "z"s while the gem dozes — a host-side CSS overlay above the gem
  // (same as the gem-library lab). HeroCrystal tells us when the sleepy move
  // falls asleep / wakes via onMoveGlyph, and we stream the Zzz in between.
  const [sleeping, setSleeping] = useState(false)
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startSleep = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current)
    setSleeping(true)
    // Fallback clear in case the 'wake' phase never arrives (move interrupted).
    sleepTimerRef.current = setTimeout(() => setSleeping(false), 8200)
  }
  const endSleep = () => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null }
    setSleeping(false)
  }

  const [form, setForm] = useState<FormState>({
    firstName:         initialData.firstName ?? '',
    birthday:          initialData.birthday ?? '',
    sex:               initialData.sex ?? '',
    heightCm:          initialData.heightCm != null ? String(initialData.heightCm) : '',
    heightFt:          '',
    heightIn:          '0',
    startingWeightKg:  initialData.startingWeightKg != null ? String(initialData.startingWeightKg) : '',
    startingWeightLbs: '',
    units:             initialData.units ?? 'metric',
    focusAreas:        initialData.focusAreas ?? [],
  })

  // localStorage resume (steps 1–3) — clears + ignores cache from a
  // different userId so a second account on the same browser doesn't
  // inherit prior state.
  useEffect(() => {
    if (initialStep > 0) return
    const cached = loadOnboardingCache(userId)
    if (!cached) return
    const { step: cachedStep, userId: _uid, ...cachedFields } = cached
    setForm(prev => ({ ...prev, ...cachedFields }))
    if (cachedStep > 0 && cachedStep < 5) setStep(cachedStep)
  }, [initialStep, userId])

  // Save to cache between steps 1–3 (step 4 writes to DB).
  useEffect(() => {
    if (step <= 0 || step >= 4) return
    saveOnboardingCache(userId, { ...form, step })
  }, [step, form, userId])

  // Arrival hello — the moment the gem is ready on the intro screen it waves
  // hello + sends a soft ring pulse, so landing here feels like the character
  // noticing you (not a gem sitting silent until you click begin). The gem is
  // dynamically imported, so poll controlRef briefly until it's wired, then
  // greet once. greetedRef keeps it to a single greeting per session.
  const greetedRef = useRef(false)
  useEffect(() => {
    if (step !== 0 || greetedRef.current) return
    let tries = 0
    let settle: ReturnType<typeof setTimeout> | null = null
    const greet = () => {
      if (!gemControl.current) return
      gemControl.current('happyHello')
      fireBurst('rings')
      greetedRef.current = true
    }
    const id = setInterval(() => {
      // Wait until the gem has actually drawn its first frame (crystal-ready),
      // then let it finish fading in before greeting — so it reads as "arrive,
      // settle, say hi" instead of popping in already mid-wave.
      const ready = document.documentElement.classList.contains('crystal-ready')
      if (gemControl.current && ready) {
        clearInterval(id)
        settle = setTimeout(greet, 520)
      } else if (++tries > 60) {
        // Safety (e.g. WebGL fallback never sets crystal-ready): greet if we
        // can, otherwise stay quiet.
        clearInterval(id)
        settle = setTimeout(greet, 200)
      }
    }, 100)
    return () => { clearInterval(id); if (settle) clearTimeout(settle) }
  }, [step, fireBurst])

  // Finish celebration — gem opens a gift + confetti when the done screen lands.
  useEffect(() => {
    if (step !== 5) return
    const t = setTimeout(() => {
      gemControl.current?.('celebrate')
      fireBurst('confetti')
    }, 220)
    return () => clearTimeout(t)
  }, [step, fireBurst])

  // Each question lands with a soft, simple ring pulse so the gem feels present
  // on every step (kept to the simplest burst — rings — on purpose).
  useEffect(() => {
    if (step < 1 || step > 4) return
    fireBurst('rings')
  }, [step, fireBurst])

  // Sleepy when idle — if you sit on a question without answering for a while,
  // the gem dozes off (soft nod-off + Z, wakes on its own). Any change to your
  // answers resets the timer. Question steps only.
  useEffect(() => {
    if (step < 1 || step > 4) return
    const t = setTimeout(() => { gemControl.current?.('sleepy') }, 9000)
    return () => clearTimeout(t)
  }, [step, form])

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  // A quick, random, happy gem reaction for any button/toggle answer — a
  // positive mood move + a simple pulse. Call only when the value changes.
  function happyReact() {
    const move = HAPPY_MOVES[Math.floor(Math.random() * HAPPY_MOVES.length)]
    gemControl.current?.(move)
    fireBurst(undefined, BURST_POOL)   // random burst from the rich pool
  }

  function validate(s: number): string {
    if (s === 1 && !form.firstName.trim()) return 'Tell me your first name.'
    if (s === 2) {
      if (!form.birthday) return 'Pick your birthday.'
      if (!form.sex) return 'Pick one.'
    }
    if (s === 3) {
      if (form.units === 'metric') {
        if (!form.heightCm || parseFloat(form.heightCm) <= 0) return 'Enter your height.'
        if (!form.startingWeightKg || parseFloat(form.startingWeightKg) <= 0) return 'Enter your weight.'
      } else {
        if (!form.heightFt || parseFloat(form.heightFt) <= 0) return 'Enter your height in feet.'
        if (!form.startingWeightLbs || parseFloat(form.startingWeightLbs) <= 0) return 'Enter your weight.'
      }
    }
    if (s === 4 && form.focusAreas.length === 0) return 'Pick at least one.'
    return ''
  }

  function toggleFocus(value: FocusArea) {
    // Happy gem reaction when you add a focus (not on remove / at-cap).
    const adding = !form.focusAreas.includes(value) && form.focusAreas.length < FOCUS_CAP
    if (adding) happyReact()
    setForm(prev => {
      const has = prev.focusAreas.includes(value)
      if (has) return { ...prev, focusAreas: prev.focusAreas.filter(v => v !== value) }
      if (prev.focusAreas.length >= FOCUS_CAP) return prev
      return { ...prev, focusAreas: [...prev.focusAreas, value] }
    })
    setError('')
  }

  async function next() {
    const err = validate(step)
    if (err) { setError(err); return }

    if (step === 4) {
      setSubmitting(true)

      const heightCm = form.units === 'metric'
        ? parseFloat(form.heightCm)
        : parseFloat(form.heightFt) * 30.48 + parseFloat(form.heightIn || '0') * 2.54

      const weightKg = form.units === 'metric'
        ? parseFloat(form.startingWeightKg)
        : parseFloat(form.startingWeightLbs) * 0.453592

      const saveErr = await saveOnboardingProfile({
        firstName:        form.firstName.trim(),
        birthday:         form.birthday,
        sex:              form.sex as Sex,
        heightCm:         Math.round(heightCm * 100) / 100,
        startingWeightKg: Math.round(weightKg * 100) / 100,
        units:            form.units,
        focusAreas:       form.focusAreas,
      })

      setSubmitting(false)
      if (saveErr) { setError(saveErr); return }

      clearOnboardingCache()
    }

    // Gem cheers you along between question steps — a varied affirm + a light
    // sparkle pulse so finishing each chapter feels rewarded (the finish screen
    // gets the big celebrate + confetti).
    if (step >= 1 && step <= 3) {
      gemControl.current?.(STEP_MOVES[step - 1])
      fireBurst('sparkles')
    }
    setStep(s => s + 1)
  }

  function back() {
    setError('')
    if (step > 0) setStep(s => s - 1)
  }

  async function finishToWelcome() {
    setSubmitting(true)
    await completeOnboarding()
  }

  // Drifting mint particle field — same recipe as /welcome and Quiz.
  const particlesRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = typeof window !== 'undefined' && window.innerWidth < 640 ? 14 : 22
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = (Math.random() * 100) + '%'
      s.style.top = (55 + Math.random() * 45) + '%'
      const size = 1 + Math.random() * 1.4
      s.style.width = s.style.height = size + 'px'
      const dur = 22 + Math.random() * 26
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', (Math.random() * 28 - 14) + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach(s => s.remove()) }
  }, [])

  const gemBig = step === 0 || step === 5

  // Cross-fade between beats so the screen never blanks to black during a step
  // change (worst on focus → done, where the content also shrinks a lot). The
  // previous beat stays mounted for one beat, overlaid and fading/lifting out
  // on top of the incoming one — they ease together instead of hard-cutting.
  const [shown, setShown] = useState(step)
  const [leaving, setLeaving] = useState<number | null>(null)
  const shownRef = useRef(step)
  useEffect(() => {
    if (step === shownRef.current) return
    const from = shownRef.current
    shownRef.current = step
    setLeaving(from)
    setShown(step)
    const t = setTimeout(() => setLeaving(null), 380)
    return () => clearTimeout(t)
  }, [step])

  // The inner content for a given step (no `.beat` wrapper — the cross-fade
  // layers provide it). Uses the passed `s` so the leaving layer renders the
  // step it's fading away from, not the current one.
  function renderBeat(s: number, active = true) {
    if (s === 0) return (
      <>
        <span className={`${styles.eyebrow} ${styles.eyebrowReveal}`}>
          <span className={styles.eyebrowRule} aria-hidden /> first things first
        </span>
        <h1 className={styles.heading}>
          <span className={styles.word} style={{ animationDelay: '0.55s' }}><em>Hey.</em></span>{' '}
          <span className={styles.word} style={{ animationDelay: '0.71s' }}>Let&apos;s</span>{' '}
          <span className={styles.word} style={{ animationDelay: '0.87s' }}>set</span>{' '}
          <span className={styles.word} style={{ animationDelay: '1.03s' }}>you</span>{' '}
          <span className={styles.word} style={{ animationDelay: '1.19s' }}>up.</span>
        </h1>
        <p className={styles.sub}>
          Four quick questions to make it yours.
        </p>
        <button type="button" className={styles.cta} onClick={() => { gemControl.current?.('pumpUp'); fireBurst('sparkles'); setStep(1) }}>
          begin <span aria-hidden>→</span>
        </button>
      </>
    )

    if (s === 5) return (
      <>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden /> all set
        </span>
        <h1 className={styles.heading}>
          <em>You&apos;re in{form.firstName ? `, ${form.firstName.trim()}` : ''}.</em>
        </h1>
        <p className={styles.sub}>
          Let me show you around.
        </p>
        <button
          type="button"
          className={styles.cta}
          onClick={finishToWelcome}
          disabled={submitting}
        >
          {submitting ? 'loading…' : <>let&apos;s go <span aria-hidden>→</span></>}
        </button>
        <button
          type="button"
          className={styles.doneBack}
          onClick={back}
          disabled={submitting}
        >
          <span aria-hidden>←</span> edit my answers
        </button>
      </>
    )

    return (
      <>
        {/* Chapter progress (4 dots) */}
        <div className={`${styles.progress} ${styles.entRise}`} aria-hidden>
          {Array.from({ length: TOTAL_Q_STEPS }).map((_, i) => {
            const idx = i + 1
            const cls = idx < s ? styles.progressSegDone
                      : idx === s ? styles.progressSegCurrent
                      : ''
            return <div key={i} className={`${styles.progressSeg} ${cls}`} />
          })}
        </div>

        <span className={`${styles.eyebrow} ${styles.entRise}`} style={{ animationDelay: '0.06s' }}>
          <span className={`${styles.eyebrowRule} ${styles.entDraw}`} aria-hidden />
          {chapterFor(s)} <span aria-hidden className={styles.eyebrowSep}>·</span>
          <span className={styles.eyebrowCount}>{s} of {TOTAL_Q_STEPS}</span>
        </span>

        {s === 1 && (
          <>
            <h2 className={styles.heading}><em>
              <span className={styles.word} style={{ animationDelay: '0.22s' }}>What</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.31s' }}>should</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.40s' }}>I</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.49s' }}>call</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.58s' }}>you?</span>
            </em></h2>
            <input
              type="text"
              className={`${styles.textInput} ${styles.entPop}`}
              style={{ animationDelay: '0.72s' }}
              placeholder="first name"
              value={form.firstName}
              onChange={e => set('firstName', e.target.value)}
              autoFocus={active}
              autoComplete="given-name"
              onKeyDown={e => { if (e.key === 'Enter') next() }}
            />
          </>
        )}

        {s === 2 && (
          <>
            <h2 className={`${styles.heading} ${styles.entPop}`} style={{ animationDelay: '0.18s' }}><em>A little about you.</em></h2>
            <div className={styles.fieldStack}>
              <div className={`${styles.fieldLabel} ${styles.entRise}`} style={{ animationDelay: '0.34s', position: 'relative', zIndex: 5 }}>
                <span>birthday</span>
                <BirthdayPicker value={form.birthday} onChange={v => set('birthday', v)} />
              </div>
              <div className={`${styles.fieldLabel} ${styles.entRise}`} style={{ animationDelay: '0.44s' }}>
                <span>sex assigned at birth</span>
                <div className={styles.choicesRow}>
                  {(['M', 'F'] as Sex[]).map(sx => (
                    <button
                      key={sx}
                      type="button"
                      className={`${styles.choice} ${form.sex === sx ? styles.choiceActive : ''}`}
                      onClick={() => { if (sx !== form.sex) happyReact(); set('sex', sx) }}
                      aria-pressed={form.sex === sx}
                    >
                      <span className={styles.choiceLabel}>{sx === 'M' ? 'Male' : 'Female'}</span>
                      <span className={styles.choiceCheck} aria-hidden>
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M 3 8.5 L 7 12 L 13 4.5" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {s === 3 && (
          <>
            <h2 className={`${styles.heading} ${styles.entPop}`} style={{ animationDelay: '0.18s' }}><em>Your starting point.</em></h2>
            <div className={`${styles.unitsToggle} ${styles.entPop}`} style={{ animationDelay: '0.32s' }}>
              {(['metric', 'imperial'] as Units[]).map(u => (
                <button
                  key={u}
                  type="button"
                  className={`${styles.unitBtn} ${form.units === u ? styles.unitBtnActive : ''}`}
                  onClick={() => { if (u !== form.units) happyReact(); set('units', u) }}
                >
                  {u}
                </button>
              ))}
            </div>
            {form.units === 'metric' ? (
              <div className={`${styles.fieldStack} ${styles.entRise}`} style={{ animationDelay: '0.44s' }}>
                <label className={styles.fieldLabel}>
                  <span>height (cm)</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    placeholder="178"
                    value={form.heightCm}
                    onChange={e => set('heightCm', e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className={styles.fieldLabel}>
                  <span>weight (kg)</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    placeholder="74"
                    value={form.startingWeightKg}
                    onChange={e => set('startingWeightKg', e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
            ) : (
              <div className={`${styles.fieldStack} ${styles.entRise}`} style={{ animationDelay: '0.44s' }}>
                <label className={styles.fieldLabel}>
                  <span>height</span>
                  <div className={styles.ftInRow}>
                    <input
                      type="number"
                      className={styles.numInput}
                      placeholder="5"
                      value={form.heightFt}
                      onChange={e => set('heightFt', e.target.value)}
                      inputMode="numeric"
                      aria-label="feet"
                    />
                    <span className={styles.unitTag}>ft</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      placeholder="10"
                      value={form.heightIn}
                      onChange={e => set('heightIn', e.target.value)}
                      inputMode="numeric"
                      aria-label="inches"
                    />
                    <span className={styles.unitTag}>in</span>
                  </div>
                </label>
                <label className={styles.fieldLabel}>
                  <span>weight (lbs)</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    placeholder="165"
                    value={form.startingWeightLbs}
                    onChange={e => set('startingWeightLbs', e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
            )}
          </>
        )}

        {s === 4 && (
          <>
            <h2 className={styles.heading}><em>
              <span className={styles.word} style={{ animationDelay: '0.22s' }}>Where</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.31s' }}>should</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.40s' }}>I</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.49s' }}>focus</span>{' '}
              <span className={styles.word} style={{ animationDelay: '0.58s' }}>first?</span>
            </em></h2>
            <p className={`${styles.qHint} ${styles.entRise}`} style={{ animationDelay: '0.62s' }}>
              pick up to {FOCUS_CAP}.
              {form.focusAreas.length > 0 && <> <span className={styles.qHintCount}>· {form.focusAreas.length}/{FOCUS_CAP} picked</span></>}
            </p>
            <div className={styles.choiceStack}>
              {FOCUS_OPTIONS.map((g, i) => {
                const isActive = form.focusAreas.includes(g.value)
                const atCap = !isActive && form.focusAreas.length >= FOCUS_CAP
                return (
                  <button
                    key={g.value}
                    type="button"
                    className={`${styles.choice} ${styles.entDeal} ${isActive ? styles.choiceActive : ''} ${atCap ? styles.choiceDisabled : ''}`}
                    style={{ animationDelay: `${0.5 + i * 0.07}s` }}
                    onClick={() => toggleFocus(g.value)}
                    aria-pressed={isActive}
                    aria-disabled={atCap || undefined}
                    disabled={atCap}
                  >
                    <span className={styles.choiceText}>
                      <span className={styles.choiceLabel}>{g.label}</span>
                      <span className={styles.choiceSub}>{g.sub}</span>
                    </span>
                    <span className={styles.choiceCheck} aria-hidden>
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M 3 8.5 L 7 12 L 13 4.5" />
                      </svg>
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <div className={styles.foot}>
          <button type="button" className={styles.footBack} onClick={back}>
            ← back
          </button>
          <button
            type="button"
            className={styles.footNext}
            onClick={next}
            disabled={submitting}
          >
            {s === 4
              ? (submitting ? 'saving…' : <>save <span aria-hidden>→</span></>)
              : <>continue <span aria-hidden>→</span></>}
          </button>
        </div>
      </>
    )
  }

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="onboarding-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="onboarding-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#onboarding-mt-far)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#onboarding-mt-near)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <div className={styles.shell}>
        <div className={`${styles.gemStage} ${gemBig ? styles.gemStageBig : styles.gemStageSmall}`}>
          <GemBurst burst={burst} />
          {sleeping && (
            <div className={styles.sleepZs} aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.sleepZ}
                  style={{ animationDelay: `${i * 1.55}s`, left: `${i * 4}px` }}
                >z</span>
              ))}
            </div>
          )}
          <HeroCrystal
            mode="character"
            controlRef={gemControl}
            onMoveGlyph={(move, phase) => {
              if (move === 'sleepy' && phase === 'sleep') startSleep()
              else endSleep()
            }}
          />
        </div>

        <div className={styles.stage}>
          {leaving !== null && (
            <div key={`leave-${leaving}`} className={`${styles.beat} ${styles.beatLeaving}`} aria-hidden>
              {renderBeat(leaving, false)}
            </div>
          )}
          <div key={`show-${shown}`} className={`${styles.beat} ${styles.beatEntering}`}>
            {renderBeat(shown)}
          </div>
        </div>
      </div>
    </main>
  )
}

function chapterFor(step: number): string {
  switch (step) {
    case 1: return 'your name'
    case 2: return 'a little about you'
    case 3: return 'your numbers'
    case 4: return 'your focus'
    default: return ''
  }
}
