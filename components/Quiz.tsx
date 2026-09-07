'use client'

import { useEffect, useRef, useState } from 'react'
import styles from '@/app/app/fitness/setup/intakeQuiz.module.css'

/**
 * Generic tailoring-quiz engine. Same look + feel as the 11-question
 * fitness intake (one question at a time, mint check burst on pick,
 * auto-advance for single-select, manual Continue for multi-select,
 * back preserves answers, 4-dot chapter progress, dialog overlay,
 * editorial canvas inside).
 *
 * Takes a Question[] manifest so each new quiz is a small data file,
 * not a new component. The fitness IntakeQuiz keeps its bespoke
 * implementation untouched — that one has too much split-recommendation
 * logic to abstract cleanly.
 *
 * Used by every tailoring quiz under /app/quiz/[id].
 */

export interface QuizOption {
  value: string
  label: string
  sub?: string
  /** Optional inline SVG component for the choice's leading icon. */
  Icon?: React.FC
  /** 'meter' layout only: how many of 4 pips are lit (e.g. reps left in the tank). */
  meter?: number
  /** 'tiles' layout only: how many of 4 level bars are lit (e.g. experience). */
  level?: number
}

export type QuizQuestionKind = 'single' | 'multi' | 'text' | 'scale'

export interface QuizQuestion {
  /** Stable key used as the field name in the resulting answer object. */
  id: string
  prompt: string
  /** Optional helper line under the prompt (e.g. "pick up to 3"). */
  hint?: string
  kind: QuizQuestionKind
  /** For single/multi. Ignored for text. */
  options?: QuizOption[]
  /** Multi-select only. */
  maxSelections?: number
  /** Text questions: a short placeholder, value stored as string. */
  textPlaceholder?: string
  /** Text questions only: allow Continue with the field left empty. */
  optional?: boolean
  /** Multi only: a value mutually exclusive with the rest — picking it clears
   *  the others, and picking any other clears it (e.g. 'none'). */
  exclusiveOption?: string
  /** Multi + layout:'tiles' only: the option value that, when selected, reveals a
   *  free-text field so a user can describe something the presets don't cover
   *  (the "no holes" escape). The typed text is stored under `${id}__other`. */
  otherOption?: string
  /** Placeholder for the otherOption free-text field. */
  otherPlaceholder?: string
  /** Branching: show this question only when the predicate passes. Omit = always
   *  shown. Hidden questions are skipped on advance/back and dropped from the
   *  progress trail + count. Backward-compatible (existing quizzes omit it). */
  visibleWhen?: (answers: QuizAnswers) => boolean
  /** single-select only: 'tiles' = big centered icon tiles; 'meter' = full-width
   *  rows with a 4-pip meter on the right (option.meter sets the lit count). */
  layout?: 'tiles' | 'meter'
  /** single 'tiles' only: render the tiles as a 2-column grid (instead of the
   *  default stacked rows). An odd count centres the last tile. Opt-in so other
   *  quizzes keep the stacked look. */
  tilesGrid?: boolean
  /** single 'tiles' only: a contextual strip rendered under the grid that reacts
   *  to the current pick (e.g. "recomp window open"). Return null to hide it. */
  tileNote?: (value: string | undefined) => { tag: string; text: string; Icon?: React.FC } | null
  /** scale only: 0..scaleMax integer picker (drag a dot on a line). */
  scaleMax?: number
  scaleDefault?: number
  /** scale only: lower bound (default 0). The track maps scaleMin..scaleMax. */
  scaleMin?: number
  /** scale only: unit label shown next to the big number, given the value. */
  scaleUnit?: (n: number) => string
  /** scale only: snap increment (e.g. 0.5 for in-between slots). Default 1. */
  scaleStep?: number
  /** scale only: rich formatter for the big number + unit (e.g. "4–5" + "days a week"). */
  scaleFormat?: (n: number) => { value: string; unit: string }
  /** scale only: evenly-spaced category labels under the track (e.g.
   *  ['lean','average','higher']) instead of the numeric 0..max ticks. */
  scaleTickLabels?: string[]
  /** scale only: allow leaving it blank via a skip button. Skipped = '' answer
   *  (still "answered" so the user can continue). */
  scaleSkippable?: boolean
  /** scale only: label on the skip button (default "skip"). */
  scaleSkipLabel?: string
  /** scale only: a short kind word under the big number for the current value
   *  (e.g. 'athletic'), so the number means something. */
  scaleDescriptor?: (n: number) => string
  /** scale only: reveal an "I know my exact number" precise input. An exact
   *  value is stored with a trailing 'm' marker (e.g. '12m') so the consumer
   *  can treat it as measured (vs a rough drag). */
  scaleExact?: boolean
  /** scale only: the exact-entry toggle label (default 'I know my exact number'). */
  scaleExactLabel?: string
  /** Bespoke per-question widget. When present it OWNS the question body
   *  (rendered in place of the standard tiles/choices/chips). The engine still
   *  drives state, progress, entrance title, footer + advance — the widget just
   *  reads `ctx.value`/`ctx.values` and calls `ctx.pick`/`ctx.toggle`. Single
   *  questions auto-advance via pick(); multi use the footer Continue button.
   *  See app/app/vitals/quiz/widgets.tsx. */
  custom?: (ctx: QuizCustomCtx) => React.ReactNode
}

/** Handed to a question's `custom` widget so it can read state + drive the quiz
 *  without re-implementing engine internals. */
export interface QuizCustomCtx {
  /** single-select: the current value (undefined until picked). */
  value: string | undefined
  /** multi-select: the current values (empty array until something is on). */
  values: string[]
  /** single-select: select a value and auto-advance (like a tile tap). */
  pick: (value: string) => void
  /** multi-select: toggle a value (honours the question's exclusive option). */
  toggle: (value: string) => void
  /** free-text companion field (stored under `${id}__other`). */
  otherText: string
  setOther: (text: string) => void
  /** whether the quiz is in signature-flourish mode (Vitals). */
  flourishes: boolean
}

/** Per-question chapter grouping for the 4-dot progress trail. Each
 *  question carries its chapter index (1..N). Use 1 to put every
 *  question under a single chapter. */
export interface QuizChapter {
  id: number
  title: string
  sub?: string
}

export interface QuizAnswers {
  [questionId: string]: string | string[]
}

interface QuizProps {
  /** Visible chapters for the progress trail. */
  chapters: QuizChapter[]
  /** Per-question metadata; each question references its chapter via
   *  `chapter` (1-indexed matching chapters[].id). */
  questions: (QuizQuestion & { chapter: number })[]
  /** Pre-fill on retake — keys map to question ids. */
  initialAnswers?: QuizAnswers
  /** Returns when the user clicks "Done" on the last question. */
  onComplete: (answers: QuizAnswers) => void | Promise<void>
  /** Cancel closes the dialog without saving anything. */
  onCancel: () => void
  /** Opt-in: when set, a subtle "skip for now" link shows on the FIRST question.
   *  Distinct from cancel — the consumer decides what skipping means (e.g. unlock
   *  a section with an untailored default instead of leaving). */
  onSkip?: () => void
  /** Label for the skip link (default "skip for now"). */
  skipLabel?: string
  /** Verb on the final-question button ("save" / "done" / "see my plan"). */
  finishLabel?: string
  /** Opt-in "signature" flourishes (used by Vitals): a drifting aurora wash, a
   *  sonar ping on pick, a shimmer on the active progress segment, and a
   *  word-by-word title on every question. Off by default so other quizzes keep
   *  the standard look. */
  flourishes?: boolean
  /** When set, single-select questions DON'T auto-advance on pick — picking
   *  highlights the tile and plays its animation, and the user taps the
   *  grey→green Continue button to move on (same as multi-select). Lets the
   *  bespoke per-question widgets be seen before the question swaps. */
  manualAdvance?: boolean
}

export default function Quiz({
  chapters,
  questions,
  initialAnswers,
  onComplete,
  onCancel,
  onSkip,
  skipLabel = 'skip for now',
  finishLabel = 'done',
  flourishes = false,
  manualAdvance = false,
}: QuizProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers ?? {})
  const [justPicked, setJustPicked] = useState<string | null>(null)
  // Flourishes: the value most-recently turned ON in a multi question, so its
  // tile fires a one-shot sonar ping (single-select reuses justPicked).
  const [justToggled, setJustToggled] = useState<string | null>(null)
  const toggleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [exactOpen, setExactOpen] = useState(false)
  // Entrance gate. `entered` is true only while a question's entrance animation
  // is meant to be playing; once it's over (a timer, or the moment the user
  // picks) we DROP every entrance class so nothing is left carrying a
  // `fill: both` "from opacity:0" animation. A sibling's pick-bounce can cause
  // the browser to re-rasterize such an animation back to its hidden first
  // frame (the icon "flicker") — removing the class entirely makes that
  // impossible, for this question type and every other. (entranceIdx tracks
  // which question the gate is armed for, reset synchronously below.)
  const [entered, setEntered] = useState(true)
  const [entranceIdx, setEntranceIdx] = useState(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const particlesRef = useRef<HTMLDivElement | null>(null)
  const scaleDrag = useRef(false)

  const q = questions[currentIdx]
  const currentChapter = chapters.find(c => c.id === q.chapter) ?? chapters[0]

  // Visibility (branching): a question may declare visibleWhen(answers).
  const isVisible = (idx: number, snap: QuizAnswers = answers): boolean => {
    const qq = questions[idx]
    return !qq.visibleWhen || qq.visibleWhen(snap)
  }
  const visibleIdxs = questions.map((_, i) => i).filter((i) => isVisible(i))
  const posInVisible = Math.max(0, visibleIdxs.indexOf(currentIdx))
  const totalVisible = visibleIdxs.length
  const isLast = posInVisible === totalVisible - 1
  const nextVisible = (from: number, snap: QuizAnswers): number => {
    for (let i = from + 1; i < questions.length; i++) if (isVisible(i, snap)) return i
    return -1
  }
  const prevVisible = (from: number): number => {
    for (let i = from - 1; i >= 0; i--) if (isVisible(i)) return i
    return -1
  }

  // Section stepper: named chapters that fill as the user advances, instead of
  // a global "X of Y" count that grows as branch questions unlock (a short
  // quiz then reads like it ballooned). Chapters with no currently-visible
  // questions are dropped so the trail stays honest.
  const chapterOrder = chapters.findIndex(c => c.id === currentChapter.id)
  const stepperSegs = chapters
    .map((c, ci) => ({ id: c.id, title: c.title, ci, qs: visibleIdxs.filter(qi => questions[qi].chapter === c.id) }))
    .filter(s => s.qs.length > 0)

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Lock body scroll while the quiz overlay is up (same idiom as the sheets).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Cleanup auto-advance on unmount.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (toggleTimer.current) clearTimeout(toggleTimer.current)
  }, [])

  // Drop the entrance classes once the question's entrance has settled, so the
  // resting DOM never holds a `fill: both` animation that a later repaint could
  // flash back to its hidden first frame. The gate is computed from the actual
  // choreography (title cascade + last option's stagger + icon spring + the
  // animation length itself, worst case) so long prompts / many options never
  // get cut mid-flight; 1100ms stays the floor. A pick ends it sooner.
  useEffect(() => {
    const settleMs = Math.max(
      1100,
      ((q.prompt.split(' ').length * 0.055 + 0.14) + (q.options?.length ?? 1) * 0.075 + 0.16 + 0.65) * 1000,
    )
    const t = setTimeout(() => setEntered(false), settleMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx])

  // Drift particles — same recipe as IntakeQuiz.
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

  // Seed a scale question the first time it is shown at its default value so the
  // dot sweeps in from the start, the same cozy slider entrance on every scale.
  // Skippable scales seed the default too: skip is an explicit tap, no longer the
  // silent starting state (that rendered a dead, pinned-left dot with no sweep).
  // The skip button still clears to '' on demand.
  useEffect(() => {
    setExactOpen(false)
    if (q.kind === 'scale' && answers[q.id] == null) {
      setAnswer(q.id, String(q.scaleDefault ?? Math.round((q.scaleMax ?? 7) / 2)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx])

  // ── Helpers ──────────────────────────────────────────────────

  function setAnswer(id: string, value: string | string[]) {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  // One-shot sonar ping when a multi tile is turned on (flourishes only).
  function flashToggle(value: string) {
    if (toggleTimer.current) clearTimeout(toggleTimer.current)
    setJustToggled(value)
    toggleTimer.current = setTimeout(() => setJustToggled(null), 950)
  }

  function toggleMulti(id: string, value: string, cap?: number, exclusive?: string) {
    setAnswers(prev => {
      const current = (prev[id] as string[] | undefined) ?? []
      const has = current.includes(value)
      if (has) return { ...prev, [id]: current.filter(v => v !== value) }
      if (exclusive && value === exclusive) return { ...prev, [id]: [exclusive] }
      const base = exclusive ? current.filter(v => v !== exclusive) : current
      if (cap && base.length >= cap) return prev
      return { ...prev, [id]: [...base, value] }
    })
  }

  function pickAndAdvance(id: string, value: string) {
    setAnswer(id, value)
    setJustPicked(value)
    // End the entrance immediately on pick so no option still carries an
    // entrance animation while the pick-bounce repaints — that pairing is what
    // flickered the untouched siblings' icons.
    setEntered(false)
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    // manualAdvance: hold on the question so the bespoke widget + pick animation
    // are seen; the user taps Continue. Only end the one-shot ping.
    if (manualAdvance) {
      advanceTimer.current = setTimeout(() => setJustPicked(null), 520)
      return
    }
    advanceTimer.current = setTimeout(() => {
      setJustPicked(null)
      const finalAnswers = { ...answers, [id]: value }
      const nxt = nextVisible(currentIdx, finalAnswers)
      if (nxt === -1) finish(finalAnswers)
      else setCurrentIdx(nxt)
      // ~520ms so the swift pick pop (tilePop/choicePop ~0.3s) fully plays and
      // is seen before the question swaps, without a long dead hold.
    }, 520)
  }

  function isAnswered(idx: number, snapshot: QuizAnswers = answers): boolean {
    const question = questions[idx]
    const value = snapshot[question.id]
    if (question.kind === 'text') {
      if (question.optional) return true
      return typeof value === 'string' && value.trim().length > 0
    }
    if (question.kind === 'multi') {
      return Array.isArray(value) && value.length > 0
    }
    if (question.kind === 'scale') return value != null
    return typeof value === 'string' && value.length > 0
  }

  const canContinue = isAnswered(currentIdx)

  async function finish(snapshot: QuizAnswers = answers) {
    if (submitting) return
    setSubmitting(true)
    try {
      await onComplete(snapshot)
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    if (!canContinue || submitting) return
    const nxt = nextVisible(currentIdx, answers)
    if (nxt === -1) finish()
    else setCurrentIdx(nxt)
  }

  function back() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    setJustPicked(null)
    const prv = prevVisible(currentIdx)
    if (prv === -1) onCancel()
    else setCurrentIdx(prv)
  }

  // ── Entrance choreography ────────────────────────────────────
  // One cozy "personality" per question, varied across the flow, replayed on
  // every question change (title + body are keyed on currentIdx so the CSS
  // animations rerun). Deterministic per question so forward + back match.
  // Reduced-motion safe — every ent* class degrades to instant in the module.
  //
  // Arm the gate synchronously when the question changes, so the very first
  // paint of a new question already has its entrance classes (no late-frame
  // flash). After it settles we drop them (see the timer effect below).
  if (currentIdx !== entranceIdx) { setEntranceIdx(currentIdx); setEntered(true) }
  // Seven cozy personalities, cycled by question index. cascade + ripple animate
  // the title per word; flip/swing/pop/bloom/rise animate it as one block. All
  // de-blur as they settle (premium "focus pull").
  const ENTRANCES = ['cascade', 'deal', 'bloom', 'rise', 'ripple', 'flip', 'swing'] as const
  // Flourishes (Vitals): one consistent, clean entrance everywhere — the title
  // animates per-word via entWordVitals (below), options + icons use the even
  // 'cascade' family. No alternating, so nothing reads jittery.
  const entrance: typeof ENTRANCES[number] =
    q.kind === 'scale' || q.kind === 'text' ? 'rise'
    : flourishes ? 'cascade'
    : ENTRANCES[currentIdx % ENTRANCES.length]
  const perWord = entrance === 'cascade' || entrance === 'ripple'
  // When the entrance is over (`!entered`) every class below is '' / undefined,
  // so the resting DOM holds NO animation that a repaint could flash.
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
  // an option's icon springs in a beat after the option itself lands. 'bloom'
  // traces the icon stroke (uses --d), the others animate the icon element.
  const icoStyle = (i: number): React.CSSProperties | undefined =>
    !entered ? undefined : entrance === 'bloom'
      ? ({ ['--d' as string]: `${optDelay(i) + 0.16}s` } as React.CSSProperties)
      : { animationDelay: `${optDelay(i) + 0.16}s` }
  // Entrance delay rides on a custom property the entrance animation consumes,
  // NOT the generic animation-delay — otherwise it also delays the pick bounce
  // (tilePop), which then gets cut off by auto-advance and the tile just
  // vanishes with no feedback.
  const optStyle = (i: number): React.CSSProperties | undefined =>
    !entered ? undefined : entrance === 'deal'
      ? ({ ['--enter-delay' as string]: `${optDelay(i)}s`, ['--rot' as string]: i % 2 ? '2deg' : '-2deg' } as React.CSSProperties)
      : ({ ['--enter-delay' as string]: `${optDelay(i)}s` } as React.CSSProperties)

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="quiz-title">
      <div className={`${styles.dialog} ${flourishes ? styles.flourish : ''}`}>
        <div className={styles.atmosphere} aria-hidden />
        {flourishes && (
          <div className={styles.aurora} aria-hidden><b className={styles.auroraA} /><b className={styles.auroraB} /></div>
        )}
        <div className={styles.particles} ref={particlesRef} aria-hidden />
        <button type="button" className={styles.closeIcon} onClick={onCancel} aria-label="Cancel quiz">×</button>

        <div className={styles.dialogShell}>
          {/* Section stepper — one named segment per chapter, filling as the
              user advances within it. Replaces the global "X of Y" count,
              which grew as branch questions unlocked and made a short quiz
              feel like it ballooned. */}
          <div className={styles.stepper} aria-label={`${currentChapter.title}, question ${posInVisible + 1} of ${totalVisible}`}>
            {stepperSegs.map(({ id, title, ci, qs }) => {
              const done = ci < chapterOrder
              const active = ci === chapterOrder
              const pct = done ? 100 : active ? ((qs.indexOf(currentIdx) + 1) / qs.length) * 100 : 0
              return (
                <div
                  key={id}
                  className={`${styles.stepperSeg} ${done ? styles.stepperDone : ''} ${active ? styles.stepperActive : ''}`}
                >
                  <span className={styles.stepperName}>{title}</span>
                  <span className={styles.stepperTrack} aria-hidden>
                    <span className={`${styles.stepperFill} ${flourishes && active ? styles.stepperShimmer : ''}`} style={{ width: pct + '%' }} />
                  </span>
                </div>
              )
            })}
          </div>

          <h2 id="quiz-title" className={styles.title} key={`t-${currentIdx}`}>
            {flourishes
              ? titleWords.map((w, i) => (
                  // Vitals: one clean, even per-word reveal (rise + de-blur),
                  // matching the standalone preview exactly.
                  <span key={i} className={entered ? styles.entWordVitals : ''} style={entered ? { animationDelay: `${0.04 + i * 0.055}s` } : undefined}>{w} </span>
                ))
              : perWord
              ? titleWords.map((w, i) => (
                  <span key={i} className={entered ? (entrance === 'ripple' ? styles.entWordRipple : styles.entWord) : ''} style={entered ? { animationDelay: `${i * 0.055}s` } : undefined}>{w} </span>
                ))
              : <span className={titleCls}>{q.prompt}</span>}
          </h2>

          {/* Body — re-mounted on idx change so check anim replays */}
          <div className={styles.body} key={currentIdx}>
            {q.hint && (
              <p className={styles.qHint}><em>{q.hint}</em></p>
            )}
            {renderQuestion()}
          </div>

          {/* Opt-in whole-quiz skip, shown on EVERY question so the user can bail
              at any point and never feels trapped (Alex: "as avoidable as
              possible"). Sits ABOVE the footer in normal flow so it never dangles
              below the footer's margin-top:auto. */}
          {onSkip && (
            <button type="button" className={styles.footSkip} onClick={onSkip}>
              {skipLabel}
            </button>
          )}

          {/* Footer */}
          <div className={styles.foot}>
            <button type="button" className={styles.footBack} onClick={back}>
              {prevVisible(currentIdx) === -1 ? 'cancel' : '← back'}
            </button>
            {q.kind === 'single' && !manualAdvance ? (
              <span className={styles.footHint} aria-hidden>
                {isLast ? `pick to ${finishLabel}` : 'pick to continue'}
              </span>
            ) : (
              <button
                type="button"
                className={styles.footNext}
                onClick={next}
                disabled={!canContinue || submitting}
              >
                {isLast
                  ? <>{submitting ? 'saving…' : finishLabel} <span aria-hidden>→</span></>
                  : <>continue <span aria-hidden>→</span></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  function renderQuestion(): React.ReactNode {
    if (q.custom) {
      return q.custom({
        value: answers[q.id] as string | undefined,
        values: (answers[q.id] as string[] | undefined) ?? [],
        pick: (value: string) => pickAndAdvance(q.id, value),
        toggle: (value: string) => toggleMulti(q.id, value, q.maxSelections, q.exclusiveOption),
        otherText: (answers[`${q.id}__other`] as string | undefined) ?? '',
        setOther: (text: string) => setAnswer(`${q.id}__other`, text),
        flourishes,
      })
    }
    if (q.kind === 'text') {
      const value = (answers[q.id] as string | undefined) ?? ''
      return (
        <textarea
          className={styles.textArea}
          value={value}
          onChange={e => setAnswer(q.id, e.target.value)}
          placeholder={q.textPlaceholder ?? ''}
          rows={4}
        />
      )
    }
    if (q.kind === 'scale') {
      const min = q.scaleMin ?? 0
      const max = q.scaleMax ?? 7
      const step = q.scaleStep ?? 1
      const raw = answers[q.id]
      const skipped = q.scaleSkippable === true && raw === ''
      const val = Math.max(min, Math.min(max,
        raw != null && raw !== '' ? parseFloat(raw as string) : (q.scaleDefault ?? Math.round((min + max) / 2))))
      const pct = ((val - min) / (max - min)) * 100
      const fmt = q.scaleFormat ? q.scaleFormat(val) : { value: String(val), unit: q.scaleUnit ? q.scaleUnit(val) : '' }
      return (
        <ScaleField
          q={q} min={min} max={max} step={step} val={val} pct={pct}
          skipped={skipped} fmt={fmt} wrapClass={optCls} wrapStyle={optStyle(0)}
          setAnswer={setAnswer} scaleDrag={scaleDrag}
          exactOpen={exactOpen} setExactOpen={setExactOpen}
        />
      )
    }
    if (q.kind === 'multi') {
      const opts = q.options ?? []
      const current = (answers[q.id] as string[] | undefined) ?? []
      // tiles layout: the same centered icon cards as single-select, but
      // selectable many-at-once (check badge + breathing halo). An optional
      // `otherOption` reveals a free-text field so nothing falls through.
      if (q.layout === 'tiles') {
        const four = opts.length === 4
        const otherSel = q.otherOption != null && current.includes(q.otherOption)
        const otherText = (answers[`${q.id}__other`] as string | undefined) ?? ''
        return (
          <>
            <div className={`${styles.tiles} ${styles.tilesMulti} ${four ? styles.tiles4 : ''}`}>
              {opts.map((o, i) => {
                const isActive = current.includes(o.value)
                const atCap = !isActive && q.maxSelections != null && current.length >= q.maxSelections
                const isSolo = o.value === q.otherOption && opts.length % 2 === 1
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`${styles.tile} ${optCls} ${isActive ? styles.tileOn : ''} ${isSolo ? styles.tileSolo : ''}`}
                    style={optStyle(i)}
                    onClick={atCap ? undefined : () => { const wasOn = current.includes(o.value); toggleMulti(q.id, o.value, q.maxSelections, q.exclusiveOption); if (!wasOn && flourishes) flashToggle(o.value) }}
                    aria-pressed={isActive}
                    aria-disabled={atCap || undefined}
                  >
                    <span className={styles.tileCheck} aria-hidden>
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M 3 8.5 L 7 12 L 13 4.5" /></svg>
                    </span>
                    {o.Icon && <span className={`${styles.tileIcon} ${icoCls}`} aria-hidden style={icoStyle(i)}>{flourishes && justToggled === o.value && <><span className={styles.tilePing} /><span className={`${styles.tilePing} ${styles.tilePing2}`} /></>}<o.Icon /></span>}
                    <span className={styles.tileLabel}>{o.label}</span>
                    {o.sub && <span className={styles.tileSub}>{o.sub}</span>}
                  </button>
                )
              })}
            </div>
            {q.otherOption != null && (
              <div className={`${styles.tileMore} ${otherSel ? styles.tileMoreOpen : ''}`}>
                <textarea
                  className={styles.textArea}
                  value={otherText}
                  onChange={e => setAnswer(`${q.id}__other`, e.target.value)}
                  placeholder={q.otherPlaceholder ?? 'tell me in a few words…'}
                  rows={2}
                />
              </div>
            )}
          </>
        )
      }
      return (
        <div className={styles.chips}>
          {opts.map(o => {
            const isActive = current.includes(o.value)
            const atCap = !isActive && q.maxSelections != null && current.length >= q.maxSelections
            return (
              <Chip
                key={o.value}
                label={o.label}
                icon={o.Icon ? <o.Icon /> : undefined}
                active={isActive}
                disabled={atCap}
                onClick={() => toggleMulti(q.id, o.value, q.maxSelections, q.exclusiveOption)}
              />
            )
          })}
        </div>
      )
    }
    // single
    const opts = q.options ?? []
    const current = answers[q.id] as string | undefined
    if (q.layout === 'tiles') {
      const four = opts.length === 4
      const note = q.tileNote ? q.tileNote(current) : null
      // opt-in 2-col grid (single-select). With an odd count, the last tile is
      // centred so the grid stays symmetrical (matches the Vitals preview).
      const grid = q.tilesGrid === true
      const oddLast = (i: number) => grid && opts.length % 2 === 1 && i === opts.length - 1
      return (
        <>
          <div className={`${styles.tiles} ${four ? styles.tiles4 : ''} ${grid ? styles.tilesGrid : ''}`}>
            {opts.map((o, i) => (
              <button
                key={o.value}
                type="button"
                className={`${styles.tile} ${justPicked === o.value ? styles.tileJust : optCls} ${current === o.value ? styles.tileOn : ''} ${oddLast(i) ? styles.tileSolo : ''}`}
                style={optStyle(i)}
                onClick={() => pickAndAdvance(q.id, o.value)}
                aria-pressed={current === o.value}
              >
                {o.Icon && <span className={`${styles.tileIcon} ${justPicked === o.value ? '' : icoCls}`} aria-hidden style={justPicked === o.value ? undefined : icoStyle(i)}>{flourishes && justPicked === o.value && <><span className={styles.tilePing} /><span className={`${styles.tilePing} ${styles.tilePing2}`} /></>}<o.Icon /></span>}
                <span className={styles.tileLabel}>{o.label}</span>
                {o.sub && <span className={styles.tileSub}>{o.sub}</span>}
                {o.level != null && (
                  <span className={styles.tileLvl} aria-hidden>
                    {[0, 1, 2, 3].map(i => (
                      <b key={i} className={`${styles.tileLvlBar} ${i < o.level! ? styles.tileLvlOn : ''}`} />
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
          {note && (
            <div className={styles.tileNote}>
              {note.Icon && <span className={styles.tileNoteDot} aria-hidden><note.Icon /></span>}
              <p><span className={styles.tileNoteTag}>{note.tag}</span>{note.text}</p>
            </div>
          )}
        </>
      )
    }
    if (q.layout === 'meter') {
      return (
        <div className={styles.qChoicesMeter}>
          {opts.map((o, i) => (
            <Choice
              key={o.value}
              label={o.label}
              sub={o.sub}
              meter={o.meter}
              active={current === o.value}
              justPicked={justPicked === o.value}
              entranceClass={justPicked === o.value ? '' : optCls}
              entranceStyle={optStyle(i)}
              onClick={() => pickAndAdvance(q.id, o.value)}
            />
          ))}
        </div>
      )
    }
    return (
      <div className={styles.qChoices}>
        {opts.map((o, i) => (
          <Choice
            key={o.value}
            label={o.label}
            sub={o.sub}
            icon={o.Icon ? <o.Icon /> : undefined}
            active={current === o.value}
            justPicked={justPicked === o.value}
            entranceClass={justPicked === o.value ? '' : optCls}
            entranceStyle={optStyle(i)}
            iconClass={justPicked === o.value ? '' : icoCls}
            iconStyle={justPicked === o.value ? undefined : icoStyle(i)}
            onClick={() => pickAndAdvance(q.id, o.value)}
          />
        ))}
      </div>
    )
  }
}

/* ────────────────────────────────────────────────────────
   Primitives — mirror the IntakeQuiz Choice/Chip exactly.
   ──────────────────────────────────────────────────────── */

// The scale question (drag a dot on a line). On entrance the dot springs across
// the track and the number counts up to the value (the "slider sweep" from the
// preview lab); after that, or on any interaction, dragging tracks the cursor
// exactly. The body remounts per question, so this runs once per appearance.
function ScaleField({
  q, min, max, step, val, pct, skipped, fmt, wrapClass, wrapStyle,
  setAnswer, scaleDrag, exactOpen, setExactOpen,
}: {
  q: QuizQuestion
  min: number; max: number; step: number; val: number; pct: number
  skipped: boolean
  fmt: { value: string; unit: string }
  wrapClass: string
  wrapStyle?: React.CSSProperties
  setAnswer: (id: string, value: string) => void
  scaleDrag: React.MutableRefObject<boolean>
  exactOpen: boolean
  setExactOpen: (v: boolean) => void
}) {
  // Default state = the sweep's START (dot at 0, number at min). This is what
  // SSR renders too, so hydration matches; the mount effect then plays it.
  const [sweeping, setSweeping] = useState(true)
  const [pos, setPos] = useState(0)
  const [count, setCount] = useState(min)
  const [landed, setLanded] = useState(false) // brief "click into place" pop on arrival
  const sweptRef = useRef(false)
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || skipped) { sweptRef.current = true; setSweeping(false); return }
    let raf = 0
    const toTarget = requestAnimationFrame(() => setPos(pct)) // CSS transition glides the dot/fill
    // Count the number up on the SAME curve + duration as the dot's CSS glide
    // (ease-out-soft ≈ this quintic ease-out), so the number lands exactly as
    // the dot does. 1s reads slow + premium.
    const t0 = performance.now(), dur = 1000
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - k, 5)
      setCount(min + (val - min) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
      else {
        sweptRef.current = true; setSweeping(false)
        setLanded(true) // fire the landing pop as the dot settles
        landTimer.current = setTimeout(() => setLanded(false), 520)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(toTarget); if (landTimer.current) clearTimeout(landTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Any interaction ends the entrance so dragging is immediate and accurate.
  const endSweep = () => { if (!sweptRef.current) { sweptRef.current = true; setSweeping(false); setLanded(false); if (landTimer.current) clearTimeout(landTimer.current) } }
  const setFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    setAnswer(q.id, String(Math.round((min + f * (max - min)) / step) * step))
  }

  // While sweeping, format the snapped in-flight value with the question's own
  // formatter so the number passes through the real in-between labels (e.g.
  // "3–4") and lands seamlessly on the final value. Counting raw Math.round()
  // used to flash "4" for a 3.5 target before snapping to "3–4" — a visible jump.
  const showPct = sweeping ? pos : (skipped ? 0 : pct)
  const sweepVal = sweeping ? Math.round(count / step) * step : val
  const shownVal = sweepVal
  const sweepFmt = sweeping && q.scaleFormat ? q.scaleFormat(sweepVal) : fmt
  const numText = skipped ? '—' : sweepFmt.value

  return (
    <div className={`${styles.scaleWrap} ${wrapClass} ${sweeping ? styles.scaleSweep : ''}`} style={wrapStyle}>
      <div className={styles.scaleRead}>
        <span className={`${styles.scaleN} ${skipped ? styles.scaleNMuted : ''}`}>{numText}</span>
        {!skipped && <span className={styles.scaleU}>{sweepFmt.unit}</span>}
      </div>
      {q.scaleDescriptor && !skipped && (
        <div className={styles.scaleDescr}>{q.scaleDescriptor(shownVal)}</div>
      )}
      <div
        className={styles.scaleLine}
        onPointerDown={e => { endSweep(); e.currentTarget.setPointerCapture(e.pointerId); scaleDrag.current = true; setFromX(e.clientX, e.currentTarget) }}
        onPointerMove={e => { if (scaleDrag.current) setFromX(e.clientX, e.currentTarget) }}
        onPointerUp={() => { scaleDrag.current = false }}
      >
        <div className={styles.scaleFill} style={{ width: showPct + '%' }} />
        <div className={`${styles.scaleDot} ${landed ? styles.scaleDotLand : ''}`} style={{ left: showPct + '%', opacity: skipped ? 0.4 : 1 }} />
      </div>
      {q.scaleTickLabels ? (
        <div className={styles.scaleTicks}>
          {q.scaleTickLabels.map((t, i) => (
            <span key={i} className={styles.scaleTick}>{t}</span>
          ))}
        </div>
      ) : (
        <div className={styles.scaleTicks}>
          {Array.from({ length: max - min + 1 }, (_, i) => {
            const tv = min + i
            return <span key={i} className={`${styles.scaleTick} ${tv <= shownVal && !skipped ? styles.scaleTickOn : ''}`}>{tv}</span>
          })}
        </div>
      )}
      {(q.scaleExact || q.scaleSkippable) && (
        <div className={styles.scaleActions}>
          {q.scaleExact && (exactOpen ? (
            <span className={styles.scaleExactInput}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                autoFocus
                placeholder={String(q.scaleDefault ?? Math.round((min + max) / 2))}
                onChange={e => {
                  const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                  e.target.value = digits
                  const n = parseInt(digits, 10)
                  if (Number.isFinite(n) && n >= min && n <= max) setAnswer(q.id, String(n) + 'm')
                }}
              />
              <span className={styles.scaleExactPct} aria-hidden>%</span>
            </span>
          ) : (
            <button type="button" className={styles.scaleExactLink} onClick={() => setExactOpen(true)}>
              {q.scaleExactLabel ?? 'I know my exact number'} <span aria-hidden>→</span>
            </button>
          ))}
          {q.scaleSkippable && (
            <button
              type="button"
              className={`${styles.scaleSkip} ${skipped ? styles.scaleSkipOn : ''}`}
              onClick={() => setAnswer(q.id, '')}
            >
              {q.scaleSkipLabel ?? 'skip'} <span aria-hidden>→</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Choice({
  icon, label, sub, meter, active, justPicked, onClick,
  entranceClass, entranceStyle, iconClass, iconStyle,
}: {
  icon?: React.ReactNode
  label: string
  sub?: string
  meter?: number
  active: boolean
  justPicked?: boolean
  onClick: () => void
  entranceClass?: string
  entranceStyle?: React.CSSProperties
  iconClass?: string
  iconStyle?: React.CSSProperties
}) {
  const hasMeter = meter != null
  return (
    <button
      type="button"
      className={`${styles.choice} ${entranceClass ?? ''} ${active ? styles.choiceActive : ''} ${justPicked ? styles.choiceJustPicked : ''} ${icon ? styles.choiceWithIcon : ''} ${hasMeter ? styles.choiceMeter : ''}`}
      style={entranceStyle}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon && <span className={`${styles.choiceIcon} ${iconClass ?? ''}`} aria-hidden style={iconStyle}>{icon}</span>}
      <span className={styles.choiceText}>
        <span className={styles.choiceLabel}>{label}</span>
        {sub && <span className={styles.choiceSub}>{sub}</span>}
      </span>
      {hasMeter ? (
        <span className={styles.choicePips} aria-hidden>
          {[0, 1, 2, 3].map(i => (
            <b key={i} className={`${styles.choicePip} ${i < meter! ? styles.choicePipOn : ''}`} />
          ))}
        </span>
      ) : (
        <span className={styles.choiceCheck} aria-hidden>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 3 8.5 L 7 12 L 13 4.5" />
          </svg>
        </span>
      )}
    </button>
  )
}

function Chip({
  icon, label, active, onClick, disabled = false,
}: {
  icon?: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.chipActive : ''} ${disabled ? styles.chipDisabled : ''}`}
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
    >
      {icon && <span className={styles.chipIcon} aria-hidden>{icon}</span>}
      {active && !icon && <span className={styles.chipCheck} aria-hidden>✓</span>}
      {label}
    </button>
  )
}
