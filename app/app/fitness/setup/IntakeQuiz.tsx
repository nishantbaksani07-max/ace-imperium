'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './intakeQuiz.module.css'
import {
  recommendIntake,
  type IntakeAnswers,
  type IntakeRecommendation,
  type Experience,
  type FormConfidence,
  type MovementPref,
  type FailureTolerance,
  type CardioAndOutside,
  type Goal,
  type Days,
  type Session,
  type Equipment,
  type Restriction,
  type Recovery,
  type Priority,
  type TrainingStyle,
} from './presets'
import type { GoalPreferences } from '@/lib/preferences'

/**
 * Vitality's tailored intake — 13 questions, one at a time.
 *
 * v2 (2026-05-29): added formConfidence, movementPreference,
 * failureTolerance. Sharpened experience (returning split into
 * back_recent + back_long). Merged outsideTraining + cardio →
 * cardioAndOutside with modality (running vs cycling vs sport).
 *
 * Each question gets its own screen. Single-select picks auto-advance
 * after a brief check-mark animation; multi-select picks (priorities,
 * restrictions) require explicit Continue. The eyebrow line is "where
 * you are · 1 of 13" so the user always knows how much is left.
 *
 * Back preserves every previously-entered answer. Cancel/Escape closes
 * the whole dialog and returns to the preset grid.
 */

interface IntakeQuizProps {
  onComplete: (answers: IntakeAnswers, rec: IntakeRecommendation) => void
  onCancel: () => void
  initialAnswers?: IntakeAnswers | null
  /** Vitality Goal preferences, when the user has completed that quiz.
   *  Feeds into recommendIntake() as a strategic overlay — Goal owns
   *  intent (cut/bulk/longevity), intake owns capacity. Null/undefined
   *  means Goal hasn't been set, recommendation behaves as it did
   *  before Goal integration. */
  goal?: GoalPreferences | null
}

type Partial<T> = { [K in keyof T]?: T[K] }
type Draft = Partial<IntakeAnswers> & {
  restrictions?: Restriction[]
  priorities?: Priority[]
}

const MAX_PRIORITIES = 2

// Ordered question manifest. `kind: 'multi'` skips auto-advance so the
// user can toggle multiple chips before continuing.
type QId =
  | 'experience' | 'formConfidence' | 'recovery'
  | 'goal' | 'priorities'
  | 'style' | 'movementPreference' | 'failureTolerance' | 'days' | 'session' | 'equipment'
  | 'restrictions' | 'cardioAndOutside'

interface QMeta {
  id: QId
  chapter: 1 | 2 | 3 | 4
  prompt: string
  kind: 'single' | 'multi'
}

const QUESTIONS: QMeta[] = [
  // Chapter 1 — where you are
  { id: 'experience',         chapter: 1, prompt: 'How long have you been lifting consistently?',           kind: 'single' },
  { id: 'formConfidence',     chapter: 1, prompt: 'How confident are you with the big barbell lifts?',      kind: 'single' },
  { id: 'recovery',           chapter: 1, prompt: "How's recovery been lately, sleep, stress, all of it?",  kind: 'single' },
  // Chapter 2 — what you want
  { id: 'goal',               chapter: 2, prompt: "What's the headline goal?",                              kind: 'single' },
  { id: 'priorities',         chapter: 2, prompt: 'Any body parts to bias toward?',                         kind: 'multi'  },
  // Chapter 3 — how you train
  { id: 'style',              chapter: 3, prompt: 'How do you actually like to train?',                     kind: 'single' },
  { id: 'movementPreference', chapter: 3, prompt: 'When given a choice, what do you reach for first?',      kind: 'single' },
  { id: 'failureTolerance',   chapter: 3, prompt: 'When you finish a hard set, where do you usually stop?', kind: 'single' },
  { id: 'days',               chapter: 3, prompt: 'How many days a week, honestly?',                        kind: 'multi'  },
  { id: 'session',            chapter: 3, prompt: 'How much time per session?',                             kind: 'multi'  },
  { id: 'equipment',          chapter: 3, prompt: 'What do you have access to?',                            kind: 'single' },
  // Chapter 4 — your body + life
  { id: 'restrictions',       chapter: 4, prompt: 'Anything your body needs you to avoid?',                 kind: 'multi'  },
  { id: 'cardioAndOutside',   chapter: 4, prompt: 'What fills your week outside lifting?',                  kind: 'single' },
]

const CHAPTER_LABELS: Record<1|2|3|4, string> = {
  1: 'where you are',
  2: 'what you want',
  3: 'how you train',
  4: 'your body',
}

export default function IntakeQuiz({ onComplete, onCancel, initialAnswers, goal }: IntakeQuizProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    initialAnswers
      ? {
          ...initialAnswers,
          restrictions: initialAnswers.restrictions ?? [],
          priorities: initialAnswers.priorities ?? [],
        }
      : { restrictions: [], priorities: [] }
  )
  const [currentIdx, setCurrentIdx] = useState(0)
  // Value of the option the user just picked — drives the mint-check
  // scale-in animation on that card before the screen swaps.
  const [justPicked, setJustPicked] = useState<string | number | null>(null)
  // Which lift's form-reference sheet is open (squat/bench/deadlift), or null.
  const [liftOpen, setLiftOpen] = useState<LiftKey | null>(null)
  // Entrance gate. `entered` is true only while a question's cozy entrance
  // animation should be playing; once it settles we drop the classes so the
  // resting DOM holds no `fill: both` frame a repaint could flash back to.
  const [entered, setEntered] = useState(true)
  const [entranceIdx, setEntranceIdx] = useState(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const particlesRef = useRef<HTMLDivElement | null>(null)

  const q = QUESTIONS[currentIdx]
  const totalQ = QUESTIONS.length
  const isLast = currentIdx === totalQ - 1

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Drop the entrance classes once a question's entrance has settled, so the
  // resting DOM never holds a `fill: both` animation a later repaint could
  // flash back to its hidden first frame. 1100ms clears the longest entrance
  // (cascade title + staggered options + icon spring).
  useEffect(() => {
    const t = setTimeout(() => setEntered(false), 1100)
    return () => clearTimeout(t)
  }, [currentIdx])

  // Drifting mint particles — same canon as the landing & setup wizard.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span')
      s.style.left = (Math.random() * 100) + '%'
      s.style.top = (50 + Math.random() * 50) + '%'
      const size = 1 + Math.random() * 1.4
      s.style.width = s.style.height = size + 'px'
      const dur = 22 + Math.random() * 24
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', (Math.random() * 28 - 14) + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach(s => s.remove()) }
  }, [])

  // Cleanup pending auto-advance on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
  }, [])

  // ─── State setters ─────────────────────────────────────────

  function set<K extends keyof IntakeAnswers>(key: K, value: IntakeAnswers[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  function toggleRestriction(r: Restriction) {
    setDraft(d => {
      const current = d.restrictions ?? []
      return {
        ...d,
        restrictions: current.includes(r) ? current.filter(x => x !== r) : [...current, r],
      }
    })
  }

  function clearRestrictions() {
    setDraft(d => ({ ...d, restrictions: [] }))
  }

  function togglePriority(p: Priority) {
    setDraft(d => {
      const current = d.priorities ?? []
      if (p === 'balanced') {
        return { ...d, priorities: current.includes('balanced') ? [] : ['balanced'] }
      }
      const withoutBalanced = current.filter(x => x !== 'balanced')
      if (withoutBalanced.includes(p)) {
        return { ...d, priorities: withoutBalanced.filter(x => x !== p) }
      }
      if (withoutBalanced.length >= MAX_PRIORITIES) return { ...d, priorities: withoutBalanced }
      return { ...d, priorities: [...withoutBalanced, p] }
    })
  }

  // ─── Pick + auto-advance ──────────────────────────────────

  function pickAndAdvance<K extends keyof IntakeAnswers>(key: K, value: IntakeAnswers[K]) {
    setDraft(d => ({ ...d, [key]: value }))
    setJustPicked(value as string | number)
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    advanceTimer.current = setTimeout(() => {
      setJustPicked(null)
      if (currentIdx + 1 < totalQ) {
        setCurrentIdx(i => i + 1)
      } else {
        // Final question — submit with the freshly-set value (state may
        // not have flushed via the setDraft callback yet).
        setDraft(d => {
          const final = { ...d, [key]: value } as IntakeAnswers
          const rec = recommendIntake(final, goal)
          onComplete(final, rec)
          return final
        })
      }
    }, 440)
  }

  // ─── Validation per question ──────────────────────────────

  function isAnswered(d: Draft, idx: number): boolean {
    switch (QUESTIONS[idx].id) {
      case 'experience':         return !!d.experience
      case 'formConfidence':     return !!d.formConfidence
      case 'recovery':           return !!d.recovery
      case 'goal':               return !!d.goal
      case 'priorities':         return (d.priorities?.length ?? 0) > 0
      case 'style':              return !!d.style
      case 'movementPreference': return !!d.movementPreference
      case 'failureTolerance':   return !!d.failureTolerance
      case 'days':               return d.days !== undefined
      case 'session':            return !!d.session
      case 'equipment':          return !!d.equipment
      case 'restrictions':       return d.restrictions !== undefined // empty array (= "Nothing") is valid
      case 'cardioAndOutside':   return !!d.cardioAndOutside
    }
  }

  const canContinue = isAnswered(draft, currentIdx)

  function next() {
    if (!canContinue) return
    if (currentIdx + 1 < totalQ) {
      setCurrentIdx(i => i + 1)
    } else {
      const final = draft as IntakeAnswers
      const rec = recommendIntake(final, goal)
      onComplete(final, rec)
    }
  }

  function back() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setJustPicked(null)
    if (currentIdx > 0) setCurrentIdx(i => i - 1)
    else onCancel()
  }

  // ── Entrance choreography ────────────────────────────────────
  // One cozy "personality" per question, varied across the flow, replayed on
  // every question change (title + body are keyed on currentIdx so the CSS
  // animations rerun). Deterministic per question so forward + back match.
  // Reduced-motion safe — every ent* class degrades to instant in the module.
  //
  // Arm the gate synchronously when the question changes, so the very first
  // paint of a new question already has its entrance classes (no late flash).
  if (currentIdx !== entranceIdx) { setEntranceIdx(currentIdx); setEntered(true) }
  // Seven cozy personalities, cycled by question index. cascade + ripple animate
  // the title per word; flip/swing/deal/bloom/rise animate it as one block.
  const ENTRANCES = ['cascade', 'deal', 'bloom', 'rise', 'ripple', 'flip', 'swing'] as const
  const entrance: typeof ENTRANCES[number] = ENTRANCES[currentIdx % ENTRANCES.length]
  const perWord = entrance === 'cascade' || entrance === 'ripple'
  const titleCls = !entered ? ''
    : entrance === 'deal' ? styles.entTitlePop
    : entrance === 'bloom' ? styles.entTitleBloom
    : entrance === 'flip' ? styles.entTitleFlip
    : entrance === 'swing' ? styles.entTitleSwing
    : styles.entTitleRise
  const optCls = !entered ? ''
    : entrance === 'deal' ? styles.entDeal
    : entrance === 'ripple' ? styles.entRipple
    : entrance === 'flip' ? styles.entFlip
    : entrance === 'swing' ? styles.entSwing
    : styles.entOpt
  const icoCls = !entered ? ''
    : entrance === 'cascade' ? styles.entIcoDrop
    : entrance === 'deal' ? styles.entIcoWiggle
    : entrance === 'bloom' ? styles.entIcoDraw
    : entrance === 'ripple' ? styles.entIcoPop
    : entrance === 'flip' ? styles.entIcoDrop
    : entrance === 'swing' ? styles.entIcoWiggle
    : styles.entIcoSpin
  const titleWords = q.prompt.split(' ')
  const titleSettle = perWord ? titleWords.length * 0.055 + 0.14 : 0.13
  const optDelay = (i: number) => titleSettle + i * (entrance === 'deal' ? 0.075 : 0.055)
  // An option's icon springs in a beat after the option itself lands. 'bloom'
  // traces the icon stroke (uses --d), the others animate the icon element.
  const icoStyle = (i: number): React.CSSProperties | undefined =>
    !entered ? undefined : entrance === 'bloom'
      ? ({ ['--d' as string]: `${optDelay(i) + 0.16}s` } as React.CSSProperties)
      : { animationDelay: `${optDelay(i) + 0.16}s` }
  // Entrance delay rides on a custom property the entrance animation consumes,
  // NOT the generic animation-delay — otherwise it also delays the pick bounce
  // (choicePop), which then gets cut off by auto-advance and the card just
  // vanishes with no feedback.
  const optStyle = (i: number): React.CSSProperties | undefined =>
    !entered ? undefined : entrance === 'deal'
      ? ({ ['--enter-delay' as string]: `${optDelay(i)}s`, ['--rot' as string]: i % 2 ? '2deg' : '-2deg' } as React.CSSProperties)
      : ({ ['--enter-delay' as string]: `${optDelay(i)}s` } as React.CSSProperties)

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="intake-title">
      <div className={styles.dialog}>
        <div className={styles.atmosphere} aria-hidden />
        <div className={styles.particles} ref={particlesRef} aria-hidden />
        <button type="button" className={styles.closeIcon} onClick={onCancel} aria-label="Cancel intake">×</button>

        <div className={styles.dialogShell}>
          {/* Progress bar — 11 segments. The current segment glows mint;
              done segments are mint-faded; upcoming are bare rule lines. */}
          <div className={styles.progress} aria-label={`Question ${currentIdx + 1} of ${totalQ}`}>
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`${styles.progressSeg} ${
                  i < currentIdx ? styles.progressSegDone :
                  i === currentIdx ? styles.progressSegCurrent : ''
                }`}
              />
            ))}
          </div>

          {/* Eyebrow — chapter label + "X of 11" counter. Subtle, gives
              orientation without dominating. */}
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowChapter}>{CHAPTER_LABELS[q.chapter]}</span>
            <span aria-hidden className={styles.eyebrowSep}>·</span>
            <span className={styles.eyebrowCount}>{currentIdx + 1} of {totalQ}</span>
          </div>

          {/* Prompt — the big serif question */}
          <h2 id="intake-title" className={styles.title} key={`t-${currentIdx}`}>
            {perWord
              ? titleWords.map((w, i) => (
                  <span key={i} className={entered ? (entrance === 'ripple' ? styles.entWordRipple : styles.entWord) : ''} style={entered ? { animationDelay: `${i * 0.055}s` } : undefined}>{w} </span>
                ))
              : <span className={titleCls}>{q.prompt}</span>}
          </h2>

          {/* Body — re-mounted on currentIdx change so the swap animation
              and per-card check animation replay every screen. */}
          <div className={styles.body} key={currentIdx}>
            {renderBody()}
          </div>

          {/* Footer nav — Back is always available; Continue only for
              multi-select questions (single-select auto-advances after
              the check-mark burst, so a Continue button there is just
              friction). Hint text replaces it so the user knows what
              happens next. */}
          <div className={styles.foot}>
            <button type="button" className={styles.footBack} onClick={back}>
              {currentIdx === 0 ? 'cancel' : '← back'}
            </button>
            {q.kind === 'multi' ? (
              <button
                type="button"
                className={styles.footNext}
                onClick={next}
                disabled={!canContinue}
              >
                {isLast
                  ? <>see my split <span aria-hidden>→</span></>
                  : <>continue <span aria-hidden>→</span></>}
              </button>
            ) : (
              <span className={styles.footHint} aria-hidden>
                {isLast ? 'pick to see your split' : 'pick to continue'}
              </span>
            )}
          </div>
        </div>

        {liftOpen && <LiftSheet which={liftOpen} onClose={() => setLiftOpen(null)} />}
      </div>
    </div>
  )

  // ─── Per-question renderers ───────────────────────────────

  function renderBody(): React.ReactNode {
    const wasPicked = (v: string | number) => justPicked === v
    switch (q.id) {
      case 'experience': {
        // Journey trail: five nodes left→right, the line fills to the pick.
        // Each node's `v` is an existing Experience value — pure presentation.
        const nodes: Array<{ v: Experience; label: string; cap: string; Icon: React.FC }> = [
          { v: 'new',         label: 'New',           cap: 'Under a year, or just starting.',   Icon: ExpNewIcon },
          { v: 'some',        label: 'A few years',   cap: 'One to three years in.',             Icon: ExpSomeIcon },
          { v: 'experienced', label: 'Seasoned',      cap: 'Three years plus under the bar.',    Icon: ExpSeasonedIcon },
          { v: 'back_recent', label: 'Coming back',   cap: 'Lifted before, off under 6 months.', Icon: ExpComingBackIcon },
          { v: 'back_long',   label: 'Starting over', cap: 'Off 6+ months, basically fresh.',    Icon: ExpStartingOverIcon },
        ]
        return (
          <JourneyTrail
            nodes={nodes}
            value={draft.experience}
            entranceClass={optCls}
            entranceStyle={optStyle(0)}
            onPick={v => pickAndAdvance('experience', v)}
          />
        )
      }
      case 'formConfidence': {
        const opts: Array<{ v: FormConfidence; label: string; sub: string; Icon: React.FC }> = [
          { v: 'rock_solid',     label: 'Rock solid',     sub: 'squat, bench, deadlift feel like home',  Icon: FormRockSolidIcon },
          { v: 'getting_there',  label: 'Getting there',  sub: 'I can do them, still tuning form',       Icon: FormGettingThereIcon },
          { v: 'still_learning', label: 'Still learning', sub: 'rather not load them heavy yet',         Icon: FormStillLearningIcon },
          { v: 'skip_them',      label: "I don't use them",       sub: 'give me machines and dumbbells', Icon: FormSkipThemIcon },
        ]
        return (
          <>
            <p className={styles.qSub}>
              <button type="button" className={styles.liftLink} onClick={() => setLiftOpen('squat')}>Squat</button>
              {', '}
              <button type="button" className={styles.liftLink} onClick={() => setLiftOpen('bench')}>bench</button>
              {', '}
              <button type="button" className={styles.liftLink} onClick={() => setLiftOpen('deadlift')}>deadlift</button>
              {'. Tap any to see it. New to them is totally fine.'}
            </p>
            <div className={styles.qChoices}>
              {opts.map((o, i) => (
                <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                  active={draft.formConfidence === o.v}
                  justPicked={wasPicked(o.v)}
                  entranceClass={wasPicked(o.v) ? '' : optCls}
                  entranceStyle={optStyle(i)}
                  iconClass={wasPicked(o.v) ? '' : icoCls}
                  iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                  onClick={() => pickAndAdvance('formConfidence', o.v)} />
              ))}
            </div>
          </>
        )
      }
      case 'recovery': {
        // Charge meter: levels in ascending order (lowest → highest), bars
        // light up to and including the pick. Maps 1:1 to the four Recovery
        // values the engine already expects.
        const levels: Array<{ v: Recovery; label: string; sub: string }> = [
          { v: 'rough',    label: 'Rough',    sub: "right now, it's a lot" },
          { v: 'stressed', label: 'Stressed', sub: 'short on sleep, under-recovered' },
          { v: 'okay',     label: 'Okay',     sub: 'normal busy life, sleep is fine' },
          { v: 'great',    label: 'Great',    sub: '7+ hours, life feels manageable' },
        ]
        return (
          <ChargeMeter
            levels={levels}
            value={draft.recovery}
            entranceClass={optCls}
            entranceStyle={optStyle(0)}
            onPick={v => pickAndAdvance('recovery', v)}
          />
        )
      }
      case 'goal': {
        const opts: Array<{ v: Goal; label: string; sub: string; Icon: React.FC }> = [
          { v: 'strength', label: 'Get stronger', sub: 'heavier compounds, less about size',     Icon: GoalStrengthIcon },
          { v: 'muscle',   label: 'Build muscle', sub: 'size, shape, aesthetics',                Icon: GoalMuscleIcon },
          { v: 'fat_loss', label: 'Lose fat',     sub: 'cut, lean down',                          Icon: GoalFatLossIcon },
          { v: 'recomp',   label: 'Recomp',       sub: 'lose fat + add muscle at the same time', Icon: GoalRecompIcon },
          { v: 'health',   label: 'Stay healthy', sub: 'general fitness, longevity',             Icon: GoalHealthIcon },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                active={draft.goal === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                iconClass={wasPicked(o.v) ? '' : icoCls}
                iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                onClick={() => pickAndAdvance('goal', o.v)} />
            ))}
          </div>
        )
      }
      case 'priorities': {
        const priorities = draft.priorities ?? []
        const balanced = priorities.includes('balanced')
        const specificCount = priorities.filter(p => p !== 'balanced').length
        const atCap = specificCount >= MAX_PRIORITIES
        const opts: Array<{ v: Priority; label: string; Icon: React.FC }> = [
          { v: 'chest',     label: 'Chest',             Icon: PriChestPic },
          { v: 'back',      label: 'Back / lats',       Icon: PriBackPic },
          { v: 'shoulders', label: 'Shoulders / delts', Icon: PriShoulderPic },
          { v: 'arms',      label: 'Arms (bi / tri)',   Icon: PriArmsPic },
          { v: 'legs',      label: 'Legs / glutes',     Icon: PriLegsPic },
        ]
        // Tapping a region or a chip routes through togglePriority (max 2,
        // balanced clears specifics). Region adds are blocked at cap / when
        // balanced is on, mirroring the chips' disabled state.
        const onRegion = (v: Priority) => {
          if (!priorities.includes(v) && (balanced || atCap)) return
          togglePriority(v)
        }
        return (
          <>
            <p className={styles.qHint}>
              Tap the body, pick up to <em>{MAX_PRIORITIES}</em>, or choose <em>balanced</em> if it&apos;s all even.
            </p>
            <div className={`${styles.bodywrap} ${optCls}`} style={optStyle(0)}>
              <BodyMap priorities={priorities} onRegion={onRegion} />
              <div className={styles.bodylist}>
                <Chip label="Balanced, hit it all evenly"
                  icon={<PriBalancedPic />}
                  active={balanced}
                  onClick={() => togglePriority('balanced')} />
                {opts.map(o => {
                  const isActive = priorities.includes(o.v)
                  const disabled = !isActive && (balanced || atCap)
                  return (
                    <Chip key={o.v} label={o.label}
                      icon={<o.Icon />}
                      active={isActive}
                      disabled={disabled}
                      onClick={() => togglePriority(o.v)} />
                  )
                })}
              </div>
            </div>
          </>
        )
      }
      case 'style': {
        const opts: Array<{ v: TrainingStyle; label: string; sub: string; Icon: React.FC }> = [
          { v: 'one_body_part', label: 'One body part a day',      sub: 'chest day, back day, leg day. Bro Split territory', Icon: StyleOneBodyPartIcon },
          { v: 'ppl',           label: 'Push, pull, legs',         sub: 'movement-pattern days, classic PPL',                 Icon: StylePPLIcon },
          { v: 'upper_lower',   label: 'Upper / lower',            sub: 'one day up top, next day legs',                      Icon: StyleUpperLowerIcon },
          { v: 'full_body',     label: 'Everything every session', sub: 'full body each visit',                               Icon: StyleFullBodyIcon },
          { v: 'surprise_me',   label: 'Pick whatever fits best',  sub: 'I trust the engine',                                 Icon: StyleSurpriseIcon },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                active={draft.style === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                iconClass={wasPicked(o.v) ? '' : icoCls}
                iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                onClick={() => pickAndAdvance('style', o.v)} />
            ))}
          </div>
        )
      }
      case 'movementPreference': {
        const opts: Array<{ v: MovementPref; label: string; sub: string; Icon: React.FC }> = [
          { v: 'barbell',  label: 'Barbell',              sub: 'give me the bar',                Icon: MoveBarbellIcon },
          { v: 'dumbbell', label: 'Dumbbells',            sub: 'feels best on my body',          Icon: MoveDumbbellIcon },
          { v: 'machine',  label: 'Machines',             sub: 'locked-in, dialed-in',           Icon: MoveMachineIcon },
          { v: 'cable',    label: 'Cables and isolation', sub: 'full ROM, constant tension',     Icon: MoveCableIcon },
          { v: 'mix',      label: 'Mix it all',           sub: 'no strong preference',           Icon: MoveMixIcon },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                active={draft.movementPreference === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                iconClass={wasPicked(o.v) ? '' : icoCls}
                iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                onClick={() => pickAndAdvance('movementPreference', o.v)} />
            ))}
          </div>
        )
      }
      case 'failureTolerance': {
        const opts: Array<{ v: FailureTolerance; label: string; sub: string; Icon: React.FC }> = [
          { v: 'failure',     label: 'At absolute failure',         sub: 'every set to count',                              Icon: FailureAllInIcon },
          { v: 'one_two',     label: 'One or two left in the tank', sub: 'clean grindy reps',                               Icon: FailureOneTwoIcon },
          { v: 'three_plus',  label: 'Three-ish left',              sub: 'quality reps only, never grinding',               Icon: FailureThreePlusIcon },
          { v: 'split',       label: "It depends on the lift",      sub: 'hard on isolations, controlled on compounds',     Icon: FailureSplitIcon },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                active={draft.failureTolerance === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                iconClass={wasPicked(o.v) ? '' : icoCls}
                iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                onClick={() => pickAndAdvance('failureTolerance', o.v)} />
            ))}
          </div>
        )
      }
      case 'days': {
        // Whole-number stops carry a tick label (2..6); the half-steps in
        // between (2.5, 3.5, …) carry an empty tick so the knob can rest on a
        // flexible "4-5 days" answer without cluttering the axis with labels.
        // recommendIntake() floors every half back to a concrete day count.
        const stops: SliderStop<Days>[] = [
          { v: 2,   big: '2',   sub: 'busy life',     tick: '2' },
          { v: 2.5, big: '2-3', sub: 'easing in',     tick: ''  },
          { v: 3,   big: '3',   sub: 'sustainable',   tick: '3' },
          { v: 3.5, big: '3-4', sub: 'flexible',      tick: ''  },
          { v: 4,   big: '4',   sub: 'committed',     tick: '4' },
          { v: 4.5, big: '4-5', sub: 'flexible week', tick: ''  },
          { v: 5,   big: '5',   sub: 'a habit',       tick: '5' },
          { v: 5.5, big: '5-6', sub: 'high output',   tick: ''  },
          { v: 6,   big: '6',   sub: 'most days',     tick: '6' },
          { v: 6.5, big: '6-7', sub: 'near-daily',    tick: ''  },
          { v: 7,   big: '7',   sub: 'every day',     tick: '7' },
        ]
        return (
          <StepSlider
            stops={stops}
            value={draft.days}
            unit="days a week"
            defaultIndex={2}
            entranceClass={optCls}
            entranceStyle={optStyle(0)}
            onChange={v => setDraft(d => ({ ...d, days: v }))}
          />
        )
      }
      case 'session': {
        const stops: SliderStop<Session>[] = [
          { v: 'under_45', big: 'Under 45', sub: 'in, work, out, tight schedule', tick: '<45' },
          { v: '45_60',    big: '45 to 60', sub: 'standard session',              tick: '45-60' },
          { v: '60_75',    big: '60 to 75', sub: 'room for accessories',          tick: '60-75' },
          { v: '75_plus',  big: '75+',      sub: 'no rush, full programming',     tick: '75+' },
        ]
        return (
          <StepSlider
            stops={stops}
            value={draft.session}
            unit="minutes"
            defaultIndex={1}
            entranceClass={optCls}
            entranceStyle={optStyle(0)}
            onChange={v => setDraft(d => ({ ...d, session: v }))}
          />
        )
      }
      case 'equipment': {
        const opts: Array<{ v: Equipment; label: string; sub: string }> = [
          { v: 'commercial', label: 'Full commercial gym', sub: 'racks, machines, cables, the works' },
          { v: 'home_full',  label: 'Home gym',            sub: 'barbell, plates, rack' },
          { v: 'dumbbells',  label: 'Dumbbells only',      sub: 'plus maybe a bench' },
          { v: 'bodyweight', label: 'Bodyweight + bands',  sub: 'no free weights' },
          { v: 'mix',        label: 'It varies',           sub: 'gym some days, home others' },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub}
                active={draft.equipment === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                onClick={() => pickAndAdvance('equipment', o.v)} />
            ))}
          </div>
        )
      }
      case 'restrictions': {
        const restrictions = draft.restrictions ?? []
        const none = restrictions.length === 0
        const opts: Array<{ v: Restriction; label: string }> = [
          { v: 'heavy_squat', label: 'Heavy squatting' },
          { v: 'heavy_dl',    label: 'Heavy deadlifting' },
          { v: 'ohp',         label: 'Overhead pressing' },
          { v: 'heavy_pull',  label: 'Heavy pulling' },
          { v: 'explosive',   label: 'Jumping / explosive' },
          { v: 'bench',       label: 'Bench pressing' },
          { v: 'lower_back',  label: 'Lower-back loading' },
        ]
        return (
          <>
            <p className={styles.qHint}>
              Pick any that apply, or <em>nothing</em> if you&apos;re good to lift everything.
            </p>
            <div className={styles.chips}>
              <Chip label="Nothing" active={none}
                entranceClass={optCls} entranceStyle={optStyle(0)}
                onClick={clearRestrictions} />
              {opts.map((o, i) => (
                <Chip key={o.v} label={o.label}
                  active={restrictions.includes(o.v)}
                  entranceClass={optCls} entranceStyle={optStyle(i + 1)}
                  onClick={() => toggleRestriction(o.v)} />
              ))}
            </div>
          </>
        )
      }
      case 'cardioAndOutside': {
        const opts: Array<{ v: CardioAndOutside; label: string; sub: string; Icon: React.FC }> = [
          { v: 'desk',         label: 'Mostly desk life',                 sub: 'lifting is the workout',                Icon: COdeskIcon },
          { v: 'walks',        label: 'Walks and casual movement',        sub: 'active but not training',               Icon: COwalksIcon },
          { v: 'sport',        label: 'A sport',                          sub: 'BJJ, soccer, climbing, anything',       Icon: COsportIcon },
          { v: 'running',      label: 'Regular runs',                     sub: 'three or more runs a week',             Icon: COrunningIcon },
          { v: 'cycling',      label: 'Cycling, rowing, low-impact cardio', sub: 'knee-friendly cardio',                Icon: COcyclingIcon },
          { v: 'cardio_first', label: "Cardio is the main thing",         sub: 'lifting supports cardio',               Icon: COcardioFirstIcon },
        ]
        return (
          <div className={styles.qChoices}>
            {opts.map((o, i) => (
              <Choice key={o.v} label={o.label} sub={o.sub} icon={<o.Icon />}
                active={draft.cardioAndOutside === o.v}
                justPicked={wasPicked(o.v)}
                entranceClass={wasPicked(o.v) ? '' : optCls}
                entranceStyle={optStyle(i)}
                iconClass={wasPicked(o.v) ? '' : icoCls}
                iconStyle={wasPicked(o.v) ? undefined : icoStyle(i)}
                onClick={() => pickAndAdvance('cardioAndOutside', o.v)} />
            ))}
          </div>
        )
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────────
   Primitives
   ────────────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────────
   Lift form-reference sheet — tapping squat / bench / deadlift on the
   form-confidence question opens a quick "what it is" card with the real
   exercise-ref photos (already deployed at /exercise-refs/*) plus a few
   plain-English cues. Pure presentation; no effect on answers.
   ────────────────────────────────────────────────────────────────── */

type LiftKey = 'squat' | 'bench' | 'deadlift'

const LIFTS: Record<LiftKey, {
  name: string; tags: string[]; imgs: [string, string]; what: string; cues: string[]
}> = {
  squat: {
    name: 'Squat', tags: ['Legs', 'Glutes', 'Core'],
    imgs: ['/exercise-refs/back_squat/0.jpg', '/exercise-refs/back_squat/1.jpg'],
    what: 'A bar rests across your upper back. You sit down, then stand back up.',
    cues: [
      'Bar on your upper back, feet about shoulder-width apart.',
      'Sit down like into a low chair until your thighs reach parallel.',
      'Drive through your heels and stand back up tall.',
    ],
  },
  bench: {
    name: 'Bench press', tags: ['Chest', 'Shoulders', 'Triceps'],
    imgs: ['/exercise-refs/bench_bb/0.jpg', '/exercise-refs/bench_bb/1.jpg'],
    what: 'Lying flat on a bench, you press a bar up off your chest.',
    cues: [
      'Lie back and grip the bar a little wider than your shoulders.',
      'Lower it slowly to your mid-chest.',
      'Press it back up until your arms are straight.',
    ],
  },
  deadlift: {
    name: 'Deadlift', tags: ['Back', 'Glutes', 'Hamstrings'],
    imgs: ['/exercise-refs/conv_dl/0.jpg', '/exercise-refs/conv_dl/1.jpg'],
    what: 'Lifting a loaded bar from the floor up to standing.',
    cues: [
      'Stand with the bar over your mid-foot, hands just outside your knees.',
      'Keep your back flat and your chest up.',
      'Push the floor away to stand tall, then lower it back down.',
    ],
  },
}

function LiftSheet({ which, onClose }: { which: LiftKey; onClose: () => void }) {
  const L = LIFTS[which]
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={styles.liftSheet} role="dialog" aria-modal="true" aria-label={`${L.name} form reference`}>
      <button type="button" className={styles.liftScrim} aria-label="Close" onClick={onClose} />
      <div className={styles.liftCard}>
        <button type="button" className={styles.liftClose} aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
        <div className={styles.liftEy}>Form reference</div>
        <h3 className={styles.liftName}>{L.name}</h3>
        <div className={styles.liftTags}>
          {L.tags.map((t, i) => (
            <span key={t}>{i > 0 && <span className={styles.liftSep} aria-hidden>·</span>}{t}</span>
          ))}
        </div>
        <div className={styles.liftPhotos}>
          {L.imgs.map(src => <img key={src} src={src} alt={L.name} loading="lazy" />)}
        </div>
        <p className={styles.liftWhat}>{L.what}</p>
        <ol className={styles.liftCues}>
          {L.cues.map((c, i) => (
            <li key={i}><span className={styles.liftCueNum}>{i + 1}</span><span>{c}</span></li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/* Discrete step slider (days · session). Drag the knob or tap anywhere on
   the track to snap to the nearest stop; the big serif readout + subline
   update live. A sensible default is pre-filled on mount so the knob has a
   home and Continue is enabled. Each stop's `v` is an existing engine value,
   so this is pure presentation — for `days` the stops are the integers 2..6
   only (no 7, no half-steps), keeping the Days contract intact. */
type SliderStop<V extends string | number> = { v: V; big: string; sub: string; tick: string }

function StepSlider<V extends string | number>({
  stops, value, unit, defaultIndex, onChange, entranceClass, entranceStyle,
}: {
  stops: SliderStop<V>[]
  value: V | undefined
  unit: string
  defaultIndex: number
  onChange: (v: V) => void
  entranceClass?: string
  entranceStyle?: React.CSSProperties
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const lastIdx = stops.length - 1
  const foundIdx = value !== undefined ? stops.findIndex(s => s.v === value) : -1
  const activeIdx = foundIdx < 0 ? defaultIndex : foundIdx

  // Pre-fill the default so the value is set (Continue enables) the moment
  // the slider appears, mirroring the standalone's pre-filled knob.
  useEffect(() => {
    if (value === undefined) onChange(stops[defaultIndex].v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setFromClientX = (clientX: number) => {
    const trk = trackRef.current
    if (!trk) return
    const r = trk.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const idx = Math.round(p * lastIdx)
    const stop = stops[idx]
    if (stop && stop.v !== value) onChange(stop.v)
  }

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    setFromClientX(e.clientX)
    const move = (ev: PointerEvent) => setFromClientX(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pct = lastIdx === 0 ? 0 : (activeIdx / lastIdx) * 100
  const current = stops[activeIdx]

  return (
    <div className={`${styles.slid} ${entranceClass ?? ''}`} style={entranceStyle}>
      <div className={styles.slidReadout}>
        <span className={styles.slidN}>{current.big}</span>
        <span className={styles.slidU}>{unit}</span>
      </div>
      <span className={styles.slidS}>{current.sub}</span>
      <div className={styles.track} ref={trackRef} onPointerDown={startDrag}>
        <div className={styles.trackFill} style={{ width: `${pct}%` }} />
        <div className={styles.knob} style={{ left: `${pct}%` }} aria-hidden />
      </div>
      <div className={styles.ticks}>
        {stops.map((s, i) =>
          s.tick ? (
            <button
              key={String(s.v)}
              type="button"
              className={`${styles.tick} ${i === activeIdx ? styles.tickOn : ''}`}
              // Anchor each label to the exact fraction the knob snaps to
              // (same 0→100% mapping), so ticks and knob always line up.
              style={{ left: `${lastIdx === 0 ? 0 : (i / lastIdx) * 100}%` }}
              onClick={() => onChange(s.v)}
            >
              {s.tick}
            </button>
          ) : null,
        )}
      </div>
    </div>
  )
}

/* Charge meter (recovery question). Four bars of rising height; tapping a
   bar (or its label) lights every bar up to and including it, then the quiz
   auto-advances via pickAndAdvance. Pure presentation over the existing
   Recovery values — no data-model change. */
function ChargeMeter({
  levels, value, onPick, entranceClass, entranceStyle,
}: {
  levels: Array<{ v: Recovery; label: string; sub: string }>
  value?: Recovery
  onPick: (v: Recovery) => void
  entranceClass?: string
  entranceStyle?: React.CSSProperties
}) {
  const sel = value ? levels.findIndex(l => l.v === value) : -1
  const heights = [42, 64, 86, 108]
  return (
    <div className={`${styles.energy} ${entranceClass ?? ''}`} style={entranceStyle}>
      <div className={`${styles.energyHead} ${sel >= 0 ? styles.energyHeadSet : ''}`}>
        <span className={styles.ebolt} aria-hidden><BoltIcon /></span>
        <span className={styles.energyHeadText}>
          <span className={styles.eword}>{sel < 0 ? 'How charged do you feel?' : levels[sel].label}</span>
          {sel >= 0 && <span className={styles.esub}>{levels[sel].sub}</span>}
        </span>
      </div>
      <div className={styles.meter}>
        {levels.map((l, i) => {
          const lit = sel >= 0 && i <= sel
          return (
            <button
              key={l.v}
              type="button"
              className={`${styles.ebar} ${lit ? styles.ebarLit : ''} ${sel === i ? styles.ebarSel : ''}`}
              style={{ height: heights[i] }}
              onClick={() => onPick(l.v)}
              aria-pressed={sel === i}
              aria-label={l.label}
            >
              <span className={styles.ebarLvl} aria-hidden />
              <span className={styles.ebarBolt} aria-hidden><BoltIcon /></span>
            </button>
          )
        })}
      </div>
      <div className={styles.energyLabels}>
        {levels.map((l, i) => (
          <button
            key={l.v}
            type="button"
            className={`${styles.eL} ${sel === i ? styles.eLOn : ''}`}
            onClick={() => onPick(l.v)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* Journey trail (experience question). Five nodes laid left→right; the
   connecting line fills up to the picked node, which springs to a mint dot.
   A caption under the trail names where the user landed. Tapping a node
   picks its Experience value and auto-advances like the other single-selects.
   The whole trail gets one block entrance (matches the meter + sliders). */
function JourneyTrail({
  nodes, value, onPick, entranceClass, entranceStyle,
}: {
  nodes: Array<{ v: Experience; label: string; cap: string; Icon: React.FC }>
  value?: Experience
  onPick: (v: Experience) => void
  entranceClass?: string
  entranceStyle?: React.CSSProperties
}) {
  const sel = value ? nodes.findIndex(n => n.v === value) : -1
  const pct = sel < 0 ? 0 : (sel / (nodes.length - 1)) * 100
  return (
    <div className={`${styles.trail} ${entranceClass ?? ''}`} style={entranceStyle}>
      <div className={styles.trailRow}>
        <div className={styles.trailLine} aria-hidden>
          <div className={styles.trailLineFill} style={{ width: `${pct}%` }} />
        </div>
        {nodes.map((n, i) => (
          <button
            key={n.v}
            type="button"
            className={`${styles.node} ${sel === i ? styles.nodeSel : ''}`}
            onClick={() => onPick(n.v)}
            aria-pressed={sel === i}
            aria-label={n.label}
          >
            <span className={styles.dot} aria-hidden><n.Icon /></span>
            <span className={styles.nodeLabel}>{n.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.trailCap}>{sel < 0 ? 'Tap where you are.' : nodes[sel].cap}</div>
    </div>
  )
}

/* Body muscle picker (priorities question). Front + back silhouettes with
   tappable muscle regions, wired to the same togglePriority as the chip list
   beside them. The engine only has five muscle groups (no separate glutes),
   so the back's glute region folds into `legs`. Pure presentation. */
const REGION_VALUE: Record<string, Priority> = {
  Shoulders: 'shoulders',
  Chest: 'chest',
  Arms: 'arms',
  Legs: 'legs',
  Back: 'back',
  Glutes: 'legs',
}
const BODY_SILHOUETTE = 'M54,30 C50,38 46,40 40,42 C33,43 28,47 27,55 L25,104 C25,116 27,124 30,128 C32,131 35,130 36,126 C38,118 38,110 38,100 L40,66 C41,60 43,56 45,52 C47,70 46,95 45,110 C44,116 43,120 44,126 L45,176 C46,200 48,224 50,238 C50,242 56,242 56,238 C57,224 58,200 58,176 L59,130 C59,128 60,127 60,127 C60,127 61,128 61,130 L61,176 C62,200 64,224 64,238 C64,242 70,242 70,238 C72,224 74,200 75,176 L76,126 C77,120 76,116 75,110 C74,95 73,70 75,52 C77,56 79,60 80,66 L82,100 C82,110 82,118 84,126 C85,130 88,131 90,128 C93,124 95,116 95,104 L93,55 C92,47 87,43 80,42 C74,40 70,38 66,30 Z'
const FRONT_REGIONS: Array<[string, string]> = [
  ['Shoulders', 'M31,47 Q30,43 36,42 Q44,42 47,49 Q48,55 42,57 Q34,57 31,52 Z'],
  ['Shoulders', 'M89,47 Q90,43 84,42 Q76,42 73,49 Q72,55 78,57 Q86,57 89,52 Z'],
  ['Chest', 'M48,54 Q60,52 72,54 Q75,62 71,71 Q66,75 60,73 Q54,75 49,71 Q45,62 48,54 Z'],
  ['Arms', 'M30,52 Q25,54 24,63 L26,103 Q27,117 31,126 Q34,128 36,125 Q38,115 37,103 L39,65 Q39,57 35,53 Z'],
  ['Arms', 'M90,52 Q95,54 96,63 L94,103 Q93,117 89,126 Q86,128 84,125 Q82,115 83,103 L81,65 Q81,57 85,53 Z'],
  ['Legs', 'M49,121 Q43,125 43,137 L45,182 Q46,205 49,228 Q50,240 54,240 Q58,239 58,225 L59,178 Q60,148 59,127 Q58,121 53,120 Z'],
  ['Legs', 'M71,121 Q77,125 77,137 L75,182 Q74,205 71,228 Q70,240 66,240 Q62,239 62,225 L61,178 Q60,148 61,127 Q62,121 67,120 Z'],
]
const BACK_REGIONS: Array<[string, string]> = [
  ['Shoulders', 'M31,47 Q30,43 36,42 Q44,42 47,49 Q48,55 42,57 Q34,57 31,52 Z'],
  ['Shoulders', 'M89,47 Q90,43 84,42 Q76,42 73,49 Q72,55 78,57 Q86,57 89,52 Z'],
  ['Back', 'M47,45 Q60,42 73,45 Q77,60 74,86 Q67,94 60,92 Q53,94 46,86 Q43,60 47,45 Z'],
  ['Arms', 'M30,52 Q25,54 24,63 L26,103 Q27,117 31,126 Q34,128 36,125 Q38,115 37,103 L39,65 Q39,57 35,53 Z'],
  ['Arms', 'M90,52 Q95,54 96,63 L94,103 Q93,117 89,126 Q86,128 84,125 Q82,115 83,103 L81,65 Q81,57 85,53 Z'],
  ['Glutes', 'M48,90 Q60,96 72,90 Q76,103 72,117 Q60,124 48,117 Q44,103 48,90 Z'],
  ['Legs', 'M49,118 Q43,124 43,137 L45,182 Q46,205 49,228 Q50,240 54,240 Q58,239 58,225 L59,178 Q60,148 59,124 Q58,118 53,117 Z'],
  ['Legs', 'M71,118 Q77,124 77,137 L75,182 Q74,205 71,228 Q70,240 66,240 Q62,239 62,225 L61,178 Q60,148 61,124 Q62,118 67,117 Z'],
]

function BodyMap({ priorities, onRegion }: {
  priorities: Priority[]
  onRegion: (v: Priority) => void
}) {
  const renderFig = (face: 'front' | 'back', regions: Array<[string, string]>) => (
    <svg className={styles.fig} viewBox="0 0 120 250" role="img" aria-label={`${face} muscle map`}>
      <path className={styles.figBase} d={BODY_SILHOUETTE} />
      <circle className={styles.figBase} cx="60" cy="18" r="13" />
      {regions.map(([name, d], i) => {
        const v = REGION_VALUE[name]
        const sel = priorities.includes(v)
        return (
          <path
            key={`${name}-${i}`}
            className={`${styles.region} ${sel ? styles.regionSel : ''}`}
            d={d}
            onClick={() => onRegion(v)}
            role="button"
            aria-label={name}
            aria-pressed={sel}
          />
        )
      })}
      <text className={styles.figcap} x="60" y="247" textAnchor="middle">{face}</text>
    </svg>
  )
  return (
    <div className={styles.figs}>
      {renderFig('front', FRONT_REGIONS)}
      {renderFig('back', BACK_REGIONS)}
    </div>
  )
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z" />
    </svg>
  )
}

/* Journey-trail node glyphs (experience question). Flat stroke icons sized
   for the 46px dots — new=sprout, some=ascending steps, seasoned=peak,
   coming back=cycle, starting over=refresh. */
function ExpNewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21 V11" />
      <path d="M12 12 C12 8.5 9.2 6.2 5.5 6 C5.3 9.7 8.1 12 12 12 Z" />
      <path d="M12 13 C12 10 14.2 8 17.5 8 C17.7 11 15.3 13 12 13 Z" />
    </svg>
  )
}
function ExpSomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20 H7 V15 H12 V10 H17 V5 H21" />
    </svg>
  )
}
function ExpSeasonedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 19 L9 7 L13 14 L16 9 L21 19 Z" />
    </svg>
  )
}
function ExpComingBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="17 3 17 7 13 7" />
      <path d="M20 12 a8 8 0 0 1 -14 5.3" />
      <polyline points="7 21 7 17 11 17" />
      <path d="M4 12 a8 8 0 0 1 14 -5.3" />
    </svg>
  )
}
function ExpStartingOverIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11 a8 8 0 1 1 -2.3 -5" />
      <polyline points="20 3 20 7 16 7" />
    </svg>
  )
}

function Choice({
  icon, label, sub, active, justPicked, onClick,
  entranceClass, entranceStyle, iconClass, iconStyle,
}: {
  icon?: React.ReactNode
  label: string
  sub?: string
  active: boolean
  /** True for the single render right after a click — drives the
   *  mint check-mark scale-in animation. Cleared on screen swap. */
  justPicked?: boolean
  onClick: () => void
  entranceClass?: string
  entranceStyle?: React.CSSProperties
  iconClass?: string
  iconStyle?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={`${styles.choice} ${entranceClass ?? ''} ${active ? styles.choiceActive : ''} ${justPicked ? styles.choiceJustPicked : ''} ${icon ? styles.choiceWithIcon : ''}`}
      style={entranceStyle}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon && <span className={`${styles.choiceIcon} ${iconClass ?? ''}`} aria-hidden style={iconStyle}>{icon}</span>}
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {sub && <span className={styles.choiceSub}>{sub}</span>}
      </span>
      <span className={styles.choiceCheck} aria-hidden>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 3 8.5 L 7 12 L 13 4.5" />
        </svg>
      </span>
    </button>
  )
}

function Chip({
  icon, label, active, onClick, disabled = false,
  entranceClass, entranceStyle, iconClass, iconStyle,
}: {
  icon?: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
  entranceClass?: string
  entranceStyle?: React.CSSProperties
  iconClass?: string
  iconStyle?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${entranceClass ?? ''} ${active ? styles.chipActive : ''} ${disabled ? styles.chipDisabled : ''}`}
      style={entranceStyle}
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
    >
      {icon && <span className={`${styles.chipIcon} ${iconClass ?? ''}`} aria-hidden style={iconStyle}>{icon}</span>}
      {active && !icon && <span className={styles.chipCheck} aria-hidden>✓</span>}
      {label}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Inline SVG icon library
   ────────────────────────────────────────────────────────────────── */

const sx = (extra: Record<string, string | number> = {}) => ({
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...extra,
})

function GoalStrengthIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="6" y1="9" x2="6" y2="15" />
      <line x1="18" y1="9" x2="18" y2="15" />
      <line x1="3" y1="11" x2="3" y2="13" />
      <line x1="21" y1="11" x2="21" y2="13" />
    </svg>
  )
}
function GoalMuscleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <path d="M 4 13 Q 5 9, 9 9 L 14 9 Q 19 9, 19 14 Q 19 17, 15 17 Q 11 17, 10 14 Q 9 12, 4 13 Z" />
      <path d="M 11 11 Q 12 13, 12 15" />
    </svg>
  )
}
function GoalFatLossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <path d="M 3 7 L 8 11 L 12 9 L 17 15 L 21 18" />
      <path d="M 21 18 L 21 14" />
      <path d="M 21 18 L 17 18" />
    </svg>
  )
}
function GoalRecompIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <path d="M 4 10 A 7 6 0 0 1 17 8" />
      <path d="M 17 8 L 17 5" />
      <path d="M 17 8 L 20 8" />
      <path d="M 20 14 A 7 6 0 0 1 7 16" />
      <path d="M 7 16 L 7 19" />
      <path d="M 7 16 L 4 16" />
    </svg>
  )
}
function GoalHealthIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <path d="M 3 12 L 8 12 L 10 7 L 13 17 L 15 12 L 21 12" />
    </svg>
  )
}

function StyleOneBodyPartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}
function StylePPLIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <circle cx="5.5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="18.5" cy="12" r="2.2" />
    </svg>
  )
}
function StyleUpperLowerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx()}>
      <rect x="4" y="4" width="16" height="7" rx="1.5" />
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
    </svg>
  )
}
function StyleFullBodyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <circle cx="8"  cy="8"  r="2.2" />
      <circle cx="16" cy="8"  r="2.2" />
      <circle cx="8"  cy="16" r="2.2" />
      <circle cx="16" cy="16" r="2.2" />
    </svg>
  )
}
function StyleSurpriseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <path d="M 12 3 L 13.5 10.5 L 21 12 L 13.5 13.5 L 12 21 L 10.5 13.5 L 3 12 L 10.5 10.5 Z" />
    </svg>
  )
}

function PriChestPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...sx({ strokeWidth: 1.3 })}>
      <path d="M 2 6 Q 4 4, 8 5 Q 12 4, 14 6 Q 13 11, 8 11 Q 3 11, 2 6 Z" />
    </svg>
  )
}
function PriBackPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...sx({ strokeWidth: 1.4 })}>
      <path d="M 3 3 L 8 13 L 13 3" />
    </svg>
  )
}
function PriShoulderPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...sx({ strokeWidth: 1.3 })}>
      <path d="M 2 12 Q 4 4, 8 5 Q 12 4, 14 12" />
    </svg>
  )
}
function PriArmsPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...sx({ strokeWidth: 1.3 })}>
      <path d="M 3 11 Q 5 5, 9 5 Q 12 5, 13 11" />
    </svg>
  )
}
function PriLegsPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...sx({ strokeWidth: 1.3 })}>
      <line x1="6" y1="3" x2="5" y2="13" />
      <line x1="10" y1="3" x2="11" y2="13" />
    </svg>
  )
}
function PriBalancedPic() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M 8 2 L 9 7 L 14 8 L 9 9 L 8 14 L 7 9 L 2 8 L 7 7 Z" />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Form confidence — barbell-readiness ladder
   ────────────────────────────────────────────────────────────────── */

function FormRockSolidIcon() {
  // Solid barbell, plates loaded heavy, anchor line — "locked in".
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <rect x="2" y="10.5" width="20" height="3" rx="0.5" />
      <rect x="3" y="7" width="3" height="10" rx="0.5" />
      <rect x="18" y="7" width="3" height="10" rx="0.5" />
    </svg>
  )
}
function FormGettingThereIcon() {
  // Barbell with medium plates — competent but still building.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.8 })}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <rect x="5" y="9" width="2.5" height="6" rx="0.5" fill="currentColor" />
      <rect x="16.5" y="9" width="2.5" height="6" rx="0.5" fill="currentColor" />
    </svg>
  )
}
function FormStillLearningIcon() {
  // Empty bar — skill work, no plates yet.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="5"  y1="10.5" x2="5"  y2="13.5" />
      <line x1="19" y1="10.5" x2="19" y2="13.5" />
    </svg>
  )
}
function FormSkipThemIcon() {
  // Barbell with a diagonal "no" line — opting out of barbell entirely.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="5"  y1="10" x2="5"  y2="14" />
      <line x1="19" y1="10" x2="19" y2="14" />
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Movement preference — which implement family
   ────────────────────────────────────────────────────────────────── */

function MoveBarbellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <rect x="2" y="11" width="20" height="2" rx="0.5" />
      <rect x="4" y="8" width="2.5" height="8" rx="0.5" />
      <rect x="17.5" y="8" width="2.5" height="8" rx="0.5" />
    </svg>
  )
}
function MoveDumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <rect x="9" y="11" width="6" height="2" rx="0.4" />
      <rect x="5" y="8" width="3" height="8" rx="0.5" />
      <rect x="16" y="8" width="3" height="8" rx="0.5" />
    </svg>
  )
}
function MoveMachineIcon() {
  // Stylized pin-loaded stack — frame with horizontal plates.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <rect x="6" y="4" width="12" height="16" rx="1.5" />
      <line x1="8" y1="8"  x2="16" y2="8" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </svg>
  )
}
function MoveCableIcon() {
  // Pulley + cable down — cable column.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <circle cx="12" cy="6" r="2.5" />
      <line x1="12" y1="8.5" x2="12" y2="18" />
      <path d="M 9 18 Q 12 21, 15 18" />
    </svg>
  )
}
function MoveMixIcon() {
  // Three small shapes — variety.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <circle cx="14" cy="12" r="3" />
      <path d="M 18 8 L 22 12 L 18 16 L 17 12 Z" />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Failure tolerance — how hard each set gets pushed
   ────────────────────────────────────────────────────────────────── */

function FailureAllInIcon() {
  // Flame — burn every set.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <path d="M 12 3 Q 8 9, 9 13 Q 6 14, 7 18 Q 9 21, 12 21 Q 15 21, 17 18 Q 18 14, 15 13 Q 16 9, 12 3 Z" />
    </svg>
  )
}
function FailureOneTwoIcon() {
  // Two reps left — two short bars below a full bar.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 2 })}>
      <line x1="4" y1="8"  x2="20" y2="8" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  )
}
function FailureThreePlusIcon() {
  // Three reps left — three short bars below the bar.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 2 })}>
      <line x1="4" y1="7"  x2="20" y2="7" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
      <line x1="10.5" y1="20" x2="13.5" y2="20" />
    </svg>
  )
}
function FailureSplitIcon() {
  // Two halves, one shaded full + one shaded partial — depends on the lift.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <rect x="3" y="6" width="8" height="12" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="8" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="15" y1="14" x2="19" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Cardio and outside training — the week's load outside lifting
   ────────────────────────────────────────────────────────────────── */

function COdeskIcon() {
  // Laptop / desk.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <rect x="5" y="6" width="14" height="9" rx="1.2" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
function COwalksIcon() {
  // Two simple footprints.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <ellipse cx="8"  cy="8"  rx="2.4" ry="3" />
      <circle  cx="6"  cy="13" r="0.9" />
      <circle  cx="10" cy="13" r="0.9" />
      <ellipse cx="16" cy="15" rx="2.4" ry="3" />
      <circle  cx="14" cy="20" r="0.9" />
      <circle  cx="18" cy="20" r="0.9" />
    </svg>
  )
}
function COsportIcon() {
  // Ball with seam — generic sport.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <circle cx="12" cy="12" r="8" />
      <path d="M 4 12 Q 12 6, 20 12" />
      <path d="M 4 12 Q 12 18, 20 12" />
    </svg>
  )
}
function COrunningIcon() {
  // Forward-leaning chevrons — speed.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 2 })}>
      <path d="M 4 6  L 10 12 L 4 18" />
      <path d="M 12 6 L 18 12 L 12 18" />
    </svg>
  )
}
function COcyclingIcon() {
  // Two wheels.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden {...sx({ strokeWidth: 1.6 })}>
      <circle cx="6"  cy="15" r="4" />
      <circle cx="18" cy="15" r="4" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="14" y1="11" x2="18" y2="15" />
    </svg>
  )
}
function COcardioFirstIcon() {
  // Heart — cardio is the priority.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor">
      <path d="M 12 20 Q 4 14, 4 9 Q 4 5, 8 5 Q 11 5, 12 8 Q 13 5, 16 5 Q 20 5, 20 9 Q 20 14, 12 20 Z" />
    </svg>
  )
}
