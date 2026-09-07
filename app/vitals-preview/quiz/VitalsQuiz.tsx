'use client'

import { useRouter } from 'next/navigation'
import Quiz, { type QuizChapter, type QuizQuestion } from '@/components/Quiz'

/**
 * Vitals setup quiz — NO-LOGIN PREVIEW (Chrome demo). Same engine + the real
 * research questions/values as the live /app/vitals/quiz, but routes to the
 * connect screen instead of saving. For showing the look without auth.
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

const CHAPTERS: QuizChapter[] = [
  { id: 1, title: 'your nights' },
  { id: 2, title: 'your focus' },
  { id: 3, title: 'guardrails' },
]

const questions: (QuizQuestion & { chapter: number })[] = [
  {
    chapter: 1, id: 'sleepConsistency', kind: 'single', layout: 'tiles',
    prompt: 'two quick things so i can read your numbers right. first, when do you usually sleep and wake, and does it stay steady or bounce around?',
    options: [
      { value: 'steady', label: 'steady', sub: 'within about 30 min most nights', Icon: Moon },
      { value: 'workday_consistent', label: 'consistent on workdays', sub: 'later on weekends', Icon: Calendar },
      { value: 'irregular', label: 'all over the place', sub: 'or shift work', Icon: Shuffle },
    ],
  },
  {
    chapter: 1, id: 'caffeineCutoff', kind: 'single', layout: 'tiles',
    prompt: 'second, when is your last caffeine of the day, usually?',
    options: [
      { value: 'morning', label: 'morning only', Icon: Sun },
      { value: 'early_afternoon', label: 'early afternoon', sub: 'before about 2pm', Icon: Coffee },
      { value: 'late', label: 'late afternoon or evening', Icon: Spark },
      { value: 'none', label: 'i do not use caffeine', Icon: Moon },
    ],
  },
  {
    chapter: 2, id: 'biggestLimiter', kind: 'single', layout: 'tiles',
    prompt: 'if one thing is holding you back right now, what is it? be honest, there is no wrong answer.',
    options: [
      { value: 'sleep', label: 'sleep', sub: 'not enough, or quality', Icon: Moon },
      { value: 'energy', label: 'energy', sub: 'always tired', Icon: Spark },
      { value: 'soreness', label: 'soreness', sub: 'sore or beat up', Icon: Muscle },
      { value: 'stress', label: 'stress', sub: 'cannot switch off', Icon: Brain },
      { value: 'plateau', label: 'stuck', sub: 'not progressing', Icon: Flag },
      { value: 'optimize', label: 'nothing, i just want to optimize', Icon: Target },
    ],
  },
  {
    chapter: 3, id: 'healthFlags', kind: 'multi', exclusiveOption: 'none',
    prompt: 'last one, and it just helps me not give you dumb advice. anything that affects your heart rate, sleep, or recovery?',
    hint: 'optional, pick any',
    options: [
      { value: 'injury', label: 'a current injury i am working around' },
      { value: 'condition', label: 'a condition that affects HR or sleep', sub: 'thyroid, afib, sleep apnea, anxiety' },
      { value: 'medication', label: 'meds or supplements that change HR or sleep', sub: 'beta-blockers, stimulants, ssris, melatonin' },
      { value: 'cycle', label: 'i track a menstrual cycle' },
      { value: 'none', label: 'none of these' },
    ],
  },
]

export default function VitalsQuiz() {
  const router = useRouter()
  return (
    <Quiz
      chapters={CHAPTERS}
      questions={questions}
      onComplete={() => router.push('/vitals-preview/connect')}
      onCancel={() => router.push('/vitals-preview')}
      finishLabel="connect"
    />
  )
}
