'use client'

import { useRouter } from 'next/navigation'
import Quiz, { type QuizChapter, type QuizQuestion, type QuizAnswers } from '@/components/Quiz'
import { saveVitalsQuiz } from '@/app/app/quiz/actions'
import { createVitalsGoal } from '@/app/app/vitals/goalActions'
import { SleepRhythmWidget, DayArcWidget, FocusRingWidget, PinChipsWidget } from './widgets'
import type {
  VitalsSleepConsistency, VitalsCaffeineCutoff, VitalsLimiter, VitalsHealthFlag,
} from '@/lib/preferences'

/**
 * Vitals onboarding quiz — the 3 research-backed, non-duplicate questions
 * (Q1 split into two single-selects: sleep consistency + caffeine cutoff).
 * Answer VALUES are exact — the downstream advice engine routes on them.
 * Built on the shared Quiz engine (cozy entrances, chapter stepper).
 */

const I = (d: string): React.FC => function Icon() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}
const Moon = I('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')
const Calendar = I('M7 3v3M17 3v3M3.5 9h17M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z')
const Shuffle = I('M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M21 16v5h-5M14 14l7 7')
const Sun = I('M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z')
const Coffee = I('M4 9h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9zM16 10h2a2 2 0 0 1 0 4h-2M7 4v2M11 4v2')
const Spark = I('M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2')
const Brain = I('M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V4a1 1 0 0 0-1-1zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0')
const Muscle = I('M7 11V7a3 3 0 0 1 6 0c0 2 1 3 3 3h2a2 2 0 0 1 2 2c0 4-3 7-8 7-4 0-7-2-7-6 0-2 1-3 2-2z')
const Flag = I('M5 21V4M5 4h11l-1.5 3L16 10H5')
const Target = I('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01')
const Heart = I('M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3 1.3 4 2.5 1-1.2 2-2.5 4-2.5 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z')
const Gauge = I('M4 15a8 8 0 0 1 16 0M12 15l3.5-3')
const Pill = I('M3 8h18v8H3zM12 8v8')
const Cycle = I('M5 12a7 7 0 0 1 12-4.5M19 12a7 7 0 0 1-12 4.5M17 4v3.5h-3.5M7 20v-3.5h3.5')
const Plus = I('M12 6v12M6 12h12')
const Dash = I('M6 12h12')

const CHAPTERS: QuizChapter[] = [
  { id: 1, title: 'your nights' },
  { id: 2, title: 'your focus' },
  { id: 3, title: 'guardrails' },
]

const questions: (QuizQuestion & { chapter: number })[] = [
  {
    chapter: 1, id: 'sleepConsistency', kind: 'single', layout: 'tiles', tilesGrid: true,
    prompt: 'how steady is your sleep?',
    hint: 'be honest, it shapes what i tell you.',
    custom: (ctx) => <SleepRhythmWidget {...ctx} />,
    options: [
      { value: 'steady', label: 'steady', sub: 'about the same time', Icon: Moon },
      { value: 'workday_consistent', label: 'workday steady', sub: 'later on weekends', Icon: Calendar },
      { value: 'irregular', label: 'all over', sub: 'or shift work', Icon: Shuffle },
    ],
  },
  {
    chapter: 1, id: 'caffeineCutoff', kind: 'single', layout: 'tiles', tilesGrid: true,
    prompt: "when's your last caffeine?",
    custom: (ctx) => <DayArcWidget {...ctx} />,
    options: [
      { value: 'morning', label: 'morning', sub: 'done early', Icon: Sun },
      { value: 'early_afternoon', label: 'early afternoon', sub: 'before 2pm', Icon: Coffee },
      { value: 'late', label: 'late', sub: 'into the evening', Icon: Spark },
      { value: 'none', label: 'none', sub: 'no caffeine', Icon: Moon },
    ],
  },
  {
    chapter: 2, id: 'biggestLimiter', kind: 'single', layout: 'tiles', tilesGrid: true,
    prompt: "what's holding you back most?",
    hint: 'pick one.',
    custom: (ctx) => <FocusRingWidget {...ctx} />,
    options: [
      { value: 'sleep', label: 'sleep', sub: 'not enough', Icon: Moon },
      { value: 'energy', label: 'energy', sub: 'always tired', Icon: Spark },
      { value: 'soreness', label: 'soreness', sub: 'beat up', Icon: Muscle },
      { value: 'stress', label: 'stress', sub: 'wired', Icon: Brain },
      { value: 'plateau', label: 'stuck', sub: 'no progress', Icon: Flag },
      { value: 'optimize', label: 'optimize', sub: 'all good', Icon: Target },
    ],
  },
  {
    chapter: 3, id: 'healthFlags', kind: 'multi', layout: 'tiles', exclusiveOption: 'none',
    otherOption: 'other', otherPlaceholder: 'tell me in a few words…',
    prompt: 'anything i should factor in?',
    hint: 'optional. helps me give better advice.',
    custom: (ctx) => <PinChipsWidget {...ctx} />,
    options: [
      { value: 'injury', label: 'injury', sub: 'working around one', Icon: Heart },
      { value: 'condition', label: 'hr or sleep condition', sub: 'thyroid, apnea, afib', Icon: Gauge },
      { value: 'medication', label: 'meds or supplements', sub: 'that change hr or sleep', Icon: Pill },
      { value: 'cycle', label: 'menstrual cycle', sub: 'i track one', Icon: Cycle },
      { value: 'other', label: 'something else', sub: 'tell me in your words', Icon: Plus },
      { value: 'none', label: 'none of these', sub: 'nothing to flag', Icon: Dash },
    ],
  },
]

export default function VitalsQuizClient() {
  const router = useRouter()

  async function onComplete(answers: QuizAnswers) {
    const raw = Array.isArray(answers.healthFlags) ? answers.healthFlags : []
    const otherText = (typeof answers['healthFlags__other'] === 'string' ? answers['healthFlags__other'] : '').trim()
    // Drop 'none', and drop a bare 'other' with no text (a meaningless flag).
    const flags = raw
      .filter((f): f is VitalsHealthFlag => f !== 'none')
      .filter(f => f !== 'other' || otherText.length > 0)
    await saveVitalsQuiz({
      v: 1,
      sleepConsistency: answers.sleepConsistency as VitalsSleepConsistency,
      caffeineCutoff: answers.caffeineCutoff as VitalsCaffeineCutoff,
      biggestLimiter: answers.biggestLimiter as VitalsLimiter,
      healthFlags: flags,
      ...(otherText ? { healthFlagsOther: otherText } : {}),
    })
    // saving the quiz unlocks the section; deriving the goal makes it real.
    // non-fatal if it hiccups: createVitalsGoal upserts safely (never strands a
    // half-state), and the user can re-derive by retaking the quiz.
    try {
      await createVitalsGoal()
    } catch {
      // intentionally swallowed
    }
    router.push('/app/vitals/quiz/goal')
  }

  return (
    <Quiz
      chapters={CHAPTERS}
      questions={questions}
      onComplete={onComplete}
      onCancel={() => router.push('/app')}
      finishLabel="done"
      flourishes
      manualAdvance
    />
  )
}
