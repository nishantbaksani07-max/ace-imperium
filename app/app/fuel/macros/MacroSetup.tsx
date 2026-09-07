'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Quiz, { type QuizAnswers, type QuizChapter, type QuizOption, type QuizQuestion } from '@/components/Quiz'
import NutritionIcon, { type NutritionIconName } from '@/components/NutritionIcon'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import CoachGem from '@/components/CoachGem'
import {
  computeMacros,
  recommendApproach,
  defaultRate,
  type Sex,
  type ActivityLevel,
  type Intensity,
  type Experience,
  type Pace,
  type Goal,
  type FollowUp,
  type Approach,
  type MacroTarget,
} from '@/lib/nutrition/macroCalc'
import { saveMacroPlan, saveSkippedSetup } from './setupActions'
import { loadMacroAnswers, saveMacroAnswers, type MacroPick } from '@/lib/nutrition/macroAnswers'
import { type DietStyle, wantsMacroTargets, DIET_STYLE_LABEL, recommendMicroGoals } from '@/lib/nutrition/dietStyle'
import styles from './macroSetup.module.css'

/**
 * Macro setup — the goal + maintenance quiz. Runs on the shared Vitality Quiz
 * engine (same canvas, chapter trail, icon cards, mint burst), with branching
 * (blunt goal -> a follow-up tailored to it) and a pace question shown in real
 * numbers. Computes the recommended approach (incl. an explicit lean bulk) +
 * the user's numbers, shows them honestly as a starting point, saves to
 * nutrition_goals. Phase 3 corrects maintenance from the user's logged data.
 */

export interface MacroSetupProfile {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  units: 'metric' | 'imperial'
}

const icon = (name: NutritionIconName) => function QuizIcon() {
  return <NutritionIcon name={name} />
}

// A short, kind word for a body-fat value, so the number means something on the
// slider. Sex-aware (healthy ranges differ). Always warm, never judgy.
function bfWord(sex: 'M' | 'F', n: number): string {
  if (sex === 'F') {
    if (n < 16) return 'very lean'
    if (n < 21) return 'lean and defined'
    if (n < 26) return 'athletic'
    if (n < 32) return 'fit and healthy'
    if (n < 38) return 'average, healthy'
    return 'carrying a bit more'
  }
  if (n < 9) return 'very lean'
  if (n < 13) return 'lean and defined'
  if (n < 18) return 'athletic'
  if (n < 23) return 'fit and healthy'
  if (n < 30) return 'average, healthy'
  return 'carrying a bit more'
}

// Trend marks for the goal tiles: down / flat / up.
function TrendDown() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 16 L20 28 L28 20 L40 32" /><path d="M40 32 L40 22 M40 32 L30 32" /></svg>
}
function TrendFlat() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M8 24 L40 24" /></svg>
}
function TrendUp() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M8 32 L20 20 L28 28 L40 16" /><path d="M40 16 L40 26 M40 16 L30 16" /></svg>
}

const CHAPTERS: QuizChapter[] = [
  { id: 1, title: 'What you’re after' },
  { id: 2, title: 'Your goal' },
  { id: 3, title: 'Your body' },
]

// Warm, target-free framing for the non-macro dietStyles, so a "drink more
// water" or "cut sugar" user never ends on a macro-target card that reads like
// pressure. They still get a gentle calorie floor underneath (for logging
// context); this copy just leads with their focus, not the numbers.
const LIGHT_RESULT: Record<'cut_sugar' | 'quit_fastfood' | 'hydrate' | 'eat_better', { reason: string; cardLabel: string; note: string; cta: string }> = {
  cut_sugar: {
    reason: 'No numbers to chase. Log what you eat and I’ll flag where sugar hides, warmly.',
    cardLabel: 'A gentle daily ceiling',
    note: 'This is a soft floor, not a target. The real work is noticing the sweet stuff, and I’ll help.',
    cta: 'start logging',
  },
  quit_fastfood: {
    reason: 'No macros to hit. Log your meals and I’ll spot the fast food and cheer the real ones.',
    cardLabel: 'A gentle daily ceiling',
    note: 'A soft floor for context, not a target. What matters is cooking more, and I’m watching with you.',
    cta: 'start logging',
  },
  hydrate: {
    reason: 'Hydration first. Track your water and I’ll help the habit stick, day by day.',
    cardLabel: 'A gentle daily ceiling',
    note: 'A soft calorie floor if you log food too. No pressure, water is the point.',
    cta: 'start logging',
  },
  eat_better: {
    reason: 'No rules yet. Log what you eat and I’ll quietly notice patterns and nudge, never nag.',
    cardLabel: 'A gentle daily ceiling',
    note: 'A soft floor for context, not a target. Better, day by day, is the whole goal.',
    cta: 'start logging',
  },
}

// The eater-type opener (below) sets the user's dietStyle, which decides how
// short the rest of the quiz is (a water or eat-better answer skips every
// training + body question) and how the coach talks to them afterwards. The
// type + helpers live in lib/nutrition/dietStyle.ts so the server coach shares
// them. This branch predicate reads the live quiz answer.
const wantsMacros = (a: QuizAnswers) => wantsMacroTargets(a.eaterType as DietStyle)

const APPROACH_LABEL: Record<Approach, string> = {
  CUT: 'Fat loss',
  CUT_HP: 'Fat loss, muscle kept',
  RECOMP: 'Recomp, build and lean out',
  LEAN_BULK: 'Lean bulk',
  FAST_BULK: 'Faster bulk',
  MAINTAIN: 'Maintain',
  RECOMP_MAINTAIN: 'Maintain and recompose',
}

interface Result {
  approach: Approach
  reason: string
  base: MacroTarget
  training: MacroTarget
  rest: MacroTarget
  lifestyle: ActivityLevel
  trainingDaysPerWeek: number
  dietStyle: DietStyle
  bodyFatPct: number | null
  micros: { fiberTarget: number; sugarLimitG: number; sodiumLimitMg: number }
}

export default function MacroSetup({ profile, configured = false }: { profile: MacroSetupProfile; configured?: boolean }) {
  const router = useRouter()
  const { sex, age, heightCm, weightKg, units } = profile

  const [result, setResult] = useState<Result | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Pre-fill the quiz with the user's last answers on a redo. Loaded after mount
  // (localStorage) so SSR + first client render match; the quiz waits for it.
  const [booted, setBooted] = useState(false)
  const [initialAnswers, setInitialAnswers] = useState<QuizAnswers | undefined>(undefined)
  const answersRef = useRef<QuizAnswers | null>(null)
  useEffect(() => {
    const saved = loadMacroAnswers()?.answers
    // Don't restore a previously-skipped body fat as the starting state — a
    // skipped scale renders static (dot pinned left, no sweep). Drop it so the
    // slider re-enters fresh at the default ("average") and plays its entrance
    // sweep; the user can still skip again.
    if (saved && saved.bodyFat === '') {
      const rest = { ...saved }
      delete rest.bodyFat
      setInitialAnswers(rest)
    } else {
      setInitialAnswers(saved)
    }
    setBooted(true)
  }, [])

  // The Vitality gem celebrates when the plan lands. Mostly the dumbbell
  // (on-theme for a training plan), with occasional variety from the other
  // best-fitting celebratory moves so it doesn't feel canned on repeat visits.
  const gemCtrl = useRef<((move: string) => void) | null>(null)
  useEffect(() => {
    if (!result) return
    const CELEBRATIONS = ['lift', 'lift', 'lift', 'lift', 'lift', 'win', 'levelup', 'celebrate', 'proud']
    const pick = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)]
    const t = setTimeout(() => gemCtrl.current?.(pick), 420)
    return () => clearTimeout(t)
  }, [result])

  // Pace options shown in the user's real numbers ("about 1.2 lb a week").
  const paceOptions = useMemo(() => {
    const label = (rateFrac: number) => {
      const kgWk = rateFrac * weightKg
      const v = units === 'imperial' ? kgWk * 2.20462 : kgWk
      return `about ${v.toFixed(1)} ${units === 'imperial' ? 'lb' : 'kg'} a week`
    }
    const lose: QuizOption[] = [
      { value: 'gentle', label: 'Gentle', sub: `${label(0.005)}, easiest to keep`, Icon: icon('pace_gentle') },
      { value: 'standard', label: 'Steady', sub: `${label(0.007)}, recommended`, Icon: icon('pace_mid') },
      { value: 'aggressive', label: 'Faster', sub: `${label(0.01)}, harder on muscle`, Icon: icon('pace_push') },
    ]
    const gain: QuizOption[] = [
      { value: 'gentle', label: 'Gentle', sub: `${label(0.0015)}, leanest`, Icon: icon('pace_gentle') },
      { value: 'standard', label: 'Steady', sub: `${label(0.0025)}, recommended`, Icon: icon('pace_mid') },
      { value: 'aggressive', label: 'Faster', sub: `${label(0.004)}, more fat`, Icon: icon('pace_push') },
    ]
    return { lose, gain }
  }, [weightKg, units])

  const questions = useMemo<(QuizQuestion & { chapter: number })[]>(() => [
    // ── Chapter 1: what you're after (opens Fuel to everyone) ──
    {
      chapter: 1, id: 'eaterType', kind: 'single', layout: 'tiles', tilesGrid: true,
      prompt: 'What do you want food to do for you?',
      hint: 'This sets your whole experience. You can change it any time.',
      options: [
        { value: 'macros', label: 'Count my macros', sub: 'Hit protein and calorie targets', Icon: icon('count_macros') },
        { value: 'lose_fat', label: 'Lose fat, feel better', sub: 'Eat for my body, no weighing grams', Icon: icon('fat_loss') },
        { value: 'cut_sugar', label: 'Cut sugar', sub: 'Less sweet stuff, show me where it hides', Icon: icon('cut_sugar') },
        { value: 'quit_fastfood', label: 'Quit fast food', sub: 'Eat cleaner, fewer drive-thrus', Icon: icon('fast_food') },
        { value: 'hydrate', label: 'Drink more water', sub: 'Stay hydrated, build the habit', Icon: icon('hydrate') },
        { value: 'eat_better', label: 'Just eat better', sub: 'No rules yet, help me notice', Icon: icon('healthier') },
      ],
      tileNote: (v) => {
        switch (v as DietStyle | undefined) {
          case 'macros': return { tag: 'Full plan', text: 'I’ll build precise protein and calorie targets from your body.', Icon: icon('count_macros') }
          case 'lose_fat': return { tag: 'Body path', text: 'A gentle deficit, tuned as you log your weight.', Icon: icon('fat_loss') }
          case 'cut_sugar': return { tag: 'Sugar radar on', text: 'The coach flags hidden sugar in what you log.', Icon: icon('cut_sugar') }
          case 'quit_fastfood': return { tag: 'Clean-eating watch', text: 'The coach spots fast food and ultra-processed meals.', Icon: icon('fast_food') }
          case 'hydrate': return { tag: 'Hydration first', text: 'Straight to a daily water target, minimal setup.', Icon: icon('hydrate') }
          case 'eat_better': return { tag: 'Gentle mode', text: 'No targets. I notice patterns and nudge, warmly.', Icon: icon('healthier') }
          default: return null
        }
      },
    },
    // ── Chapter 2: goal (macro + lose-fat paths only) ──
    {
      chapter: 2, id: 'goal', kind: 'single', layout: 'tiles',
      visibleWhen: (a) => a.eaterType === 'macros',
      prompt: 'What is your main goal right now?',
      options: [
        { value: 'lose', label: 'Lose weight', Icon: TrendDown },
        { value: 'maintain', label: 'Stay the same', Icon: TrendFlat },
        { value: 'gain', label: 'Gain weight', Icon: TrendUp },
      ],
    },
    {
      chapter: 2, id: 'loseMuscle', kind: 'single',
      visibleWhen: (a) => a.goal === 'lose',
      prompt: 'While you lose, how much do you care about keeping muscle?',
      options: [
        { value: 'lose_muscle_high', label: 'A lot', sub: 'I lift, or I want to look toned, not just smaller', Icon: icon('muscle') },
        { value: 'lose_muscle_some', label: 'Somewhat', sub: 'Keep what I have got', Icon: icon('balanced') },
        { value: 'lose_scale_only', label: 'Not fussed', sub: 'I just want the scale to move', Icon: icon('fat_loss') },
      ],
    },
    {
      chapter: 2, id: 'gainHow', kind: 'single',
      visibleWhen: (a) => a.goal === 'gain',
      prompt: 'How do you want to gain?',
      options: [
        { value: 'gain_lean', label: 'Lean and slow', sub: 'Mostly muscle, minimal fat. A lean bulk', Icon: icon('sprout') },
        { value: 'gain_faster', label: 'Faster', sub: 'I do not mind some fat if I gain quicker', Icon: icon('pace_push') },
      ],
    },
    {
      chapter: 2, id: 'maintainWhat', kind: 'single',
      visibleWhen: (a) => a.goal === 'maintain',
      prompt: 'What does staying the same mean for you?',
      options: [
        { value: 'maintain_build', label: 'Hold weight, slowly improve', sub: 'Build a little muscle or lean out over time', Icon: icon('pace_mid') },
        { value: 'maintain_hold', label: 'Just hold steady', sub: 'I am happy where I am', Icon: icon('balanced') },
      ],
    },
    {
      chapter: 2, id: 'paceLose', kind: 'single',
      // Shown for an explicit "lose" goal AND for the lose-fat dietStyle (which
      // implies a deficit without asking the blunt goal question).
      visibleWhen: (a) => a.goal === 'lose' || a.eaterType === 'lose_fat',
      prompt: 'How fast do you want to go?',
      options: paceOptions.lose,
    },
    {
      chapter: 2, id: 'paceGain', kind: 'single',
      visibleWhen: (a) => a.goal === 'gain',
      prompt: 'How fast do you want to go?',
      options: paceOptions.gain,
    },
    // ── Chapter 3: training + body (macro + lose-fat paths only) ──
    {
      chapter: 3, id: 'frequency', kind: 'scale',
      visibleWhen: wantsMacros,
      prompt: 'How many days a week do you train with weights?',
      hint: 'Land between two numbers for a half, like 4 to 5.',
      scaleMax: 7,
      scaleDefault: 4,
      scaleStep: 0.5,
      scaleFormat: (n) =>
        n === 0
          ? { value: '0', unit: 'I do not lift' }
          : Number.isInteger(n)
          ? { value: String(n), unit: n === 1 ? 'day a week' : 'days a week' }
          : { value: `${Math.floor(n)}–${Math.ceil(n)}`, unit: 'days a week' },
    },
    {
      chapter: 3, id: 'intensity', kind: 'single', layout: 'meter',
      visibleWhen: (a) => wantsMacros(a) && Number(a.frequency) > 0,
      prompt: 'How hard are your sessions?',
      options: [
        // meter = effort (pips climb with difficulty), NOT reps-left. The old
        // mapping lit more pips for Easy (more reps in the tank), which read
        // backwards on a "how hard" question. The sub-text still carries the
        // precise reps-in-reserve meaning.
        { value: 'easy', label: 'Easy', sub: '4+ reps left in the tank', meter: 1 },
        { value: 'moderate', label: 'Moderate', sub: '2 to 3 reps left', meter: 2 },
        { value: 'hard', label: 'Hard', sub: '1 to 2 reps left', meter: 3 },
        { value: 'brutal', label: 'Brutal', sub: 'Nothing left, to failure', meter: 4 },
      ],
    },
    {
      chapter: 3, id: 'experience', kind: 'single', layout: 'tiles',
      visibleWhen: (a) => wantsMacros(a) && Number(a.frequency) > 0,
      prompt: 'Where are you with training?',
      options: [
        { value: 'beginner', label: 'Under a year', sub: 'Newer to lifting. Body grows fast.', Icon: icon('sprout'), level: 1 },
        { value: 'returning', label: 'Coming back', sub: 'Trained before. Muscle comes back quick.', Icon: icon('cycle'), level: 2 },
        { value: 'building', label: 'A year or two', sub: 'In it a while. Still climbing.', Icon: icon('steps'), level: 3 },
        { value: 'experienced', label: 'Years deep', sub: 'Seasoned. Gains come slow now.', Icon: icon('peak'), level: 4 },
      ],
    },
    {
      // Always shown (every dietStyle): gives even the lightest path a real
      // maintenance calorie floor so logged food has context.
      chapter: 3, id: 'lifestyle', kind: 'single', layout: 'tiles',
      prompt: 'How active is your day?',
      hint: 'Your daily life, not the gym.',
      options: [
        { value: 'sedentary', label: 'Mostly sitting', Icon: icon('desk'), level: 1 },
        { value: 'light', label: 'Lightly active', Icon: icon('walk'), level: 2 },
        { value: 'moderate', label: 'On your feet', Icon: icon('run'), level: 3 },
        { value: 'high', label: 'Very physical', Icon: icon('lift'), level: 4 },
      ],
    },
    {
      // Single body-composition question: drag for a rough read (with a kind
      // word so the number means something), or enter an exact measured number,
      // or skip. Replaces the old separate "body type" + "body fat %" pair.
      chapter: 3, id: 'bodyFat', kind: 'scale',
      visibleWhen: wantsMacros,
      scaleMin: 5, scaleMax: 45, scaleStep: 1, scaleDefault: 25,
      scaleSkippable: true, scaleSkipLabel: "I'm not sure, skip",
      scaleExact: true, scaleExactLabel: 'I know my exact number',
      scaleTickLabels: ['lean', 'average', 'higher'],
      scaleFormat: (n) => ({ value: String(n), unit: '%' }),
      scaleDescriptor: (n) => bfWord(sex, n),
      prompt: 'Roughly, your body fat %?',
      hint: 'A rough drag is plenty.',
    },
  ], [paceOptions])

  // Human-readable summary of the picks, for the Targets panel "done" card.
  // Mirrors the 6 chips in the approved design: goal, pace, training, sets,
  // experience, body fat. Looks each value up against its own question's labels.
  function buildPicks(a: QuizAnswers): MacroPick[] {
    const optLabel = (qId: string, value: unknown): string | null => {
      const q = questions.find((q) => q.id === qId)
      return q?.options?.find((o) => o.value === value)?.label ?? null
    }
    const picks: MacroPick[] = []
    const focusL = optLabel('eaterType', a.eaterType)
    if (focusL) picks.push({ label: 'Focus', value: focusL })
    const goalL = optLabel('goal', a.goal)
    if (goalL) picks.push({ label: 'Goal', value: goalL })
    const paceKey = a.goal === 'gain' ? 'paceGain' : a.goal === 'lose' ? 'paceLose' : null
    const paceL = paceKey ? optLabel(paceKey, a[paceKey]) : null
    if (paceL) picks.push({ label: 'Pace', value: paceL })
    const freq = Number(a.frequency)
    if (a.frequency != null && Number.isFinite(freq)) {
      picks.push({ label: 'Training', value: freq > 0 ? `${freq} gym days` : 'No lifting' })
    }
    const intL = optLabel('intensity', a.intensity)
    if (intL) picks.push({ label: 'Sets', value: intL })
    const expL = optLabel('experience', a.experience)
    if (expL) picks.push({ label: 'Experience', value: expL })
    const rawBf = (a.bodyFat as string) || ''
    const enteredBf = (rawBf.endsWith('m') ? rawBf.slice(0, -1) : rawBf).trim()
    const nBf = Number(enteredBf)
    if (enteredBf !== '' && Number.isFinite(nBf)) picks.push({ label: 'Body fat', value: `${Math.round(nBf)}%` })
    return picks
  }

  function handleComplete(a: QuizAnswers) {
    answersRef.current = a
    const dietStyle = (a.eaterType as DietStyle) || 'macros'
    // The lose-fat dietStyle implies a deficit without asking the blunt goal
    // question. Every non-macro style (cut sugar / fast food / water / eat
    // better) falls through to a gentle maintenance floor via the defaults.
    const goal = dietStyle === 'lose_fat' ? 'lose' : ((a.goal as Goal) || 'maintain')
    const followUp = ((goal === 'lose' ? a.loseMuscle : goal === 'gain' ? a.gainHow : a.maintainWhat) as FollowUp) || 'maintain_hold'
    const pace = ((goal === 'lose' ? a.paceLose : a.paceGain) as Pace) || 'standard'
    const trainingDaysPerWeek = Math.max(0, Math.min(7, Number(a.frequency) || 0))
    const lifts = trainingDaysPerWeek > 0
    const intensity = (a.intensity as Intensity) || 'moderate'
    // "building" (consistent but still newish) is still in newbie gains -> treat
    // as recomp-eligible like a beginner.
    const experience: Experience = a.experience === 'building' ? 'beginner' : ((a.experience as Experience) || 'beginner')
    const lifestyle = (a.lifestyle as ActivityLevel) || 'moderate'
    // Body composition (single slider question). The answer is a rough drag
    // value ('18'), an exact measured entry ('12m', trailing marker), or '' when
    // skipped. An exact entry is treated as measured (enables Katch BMR); a
    // rough drag is not. Skipped falls back to a sex-typical average so the plan
    // still has a sensible starting point. Either way it sharpens the FFM-based
    // protein + approach call.
    const raw = (a.bodyFat as string) || ''
    const measured = raw.endsWith('m')
    const entered = (measured ? raw.slice(0, -1) : raw).trim()
    const n = Number(entered)
    const hasBf = entered !== '' && Number.isFinite(n) && n > 3 && n < 70
    const bf = hasBf ? n : (sex === 'M' ? 18 : 26)
    const bfMeasured = measured && hasBf

    const rec = recommendApproach({ sex, goal, followUp, lifts, bodyFatPct: bf, experience })
    const rate = defaultRate(rec.approach, pace)
    const macros = computeMacros({ sex, age, heightCm, weightKg, lifestyle, trainingDaysPerWeek, intensity, approach: rec.approach, rate, bodyFatPct: bf, bfMeasured })
    // Recommended micronutrient goals from the plan, so the quiz hands the user
    // a starting fiber / sugar-cap / sodium-cap they can later edit.
    const micros = recommendMicroGoals({ kcal: macros.base.kcal, sex: sex === 'F' ? 'F' : 'M', dietStyle })
    const built: Result = {
      approach: rec.approach,
      reason: rec.reason,
      base: macros.base,
      training: macros.training,
      rest: macros.rest,
      lifestyle,
      trainingDaysPerWeek,
      dietStyle,
      bodyFatPct: hasBf ? Math.round(bf) : null,
      micros,
    }
    // The plan computes instantly, so reveal it straight away — the gem
    // celebration on arrival carries the warm moment. No artificial wait.
    setResult(built)
  }

  async function save() {
    if (!result) return
    setSaving(true)
    setErr(null)
    const res = await saveMacroPlan({
      activity: result.lifestyle,
      approach: result.approach,
      trainingDaysPerWeek: result.trainingDaysPerWeek,
      base: result.base,
      training: result.training,
      rest: result.rest,
      dietStyle: result.dietStyle,
      bodyFatPct: result.bodyFatPct,
      fiberTarget: result.micros.fiberTarget,
      sugarLimitG: result.micros.sugarLimitG,
      sodiumLimitMg: result.micros.sodiumLimitMg,
    })
    if (!res.ok) {
      setErr('Could not save. Please try again.')
      setSaving(false)
      return
    }
    // Cache the raw answers + readable picks so the Targets panel can show what
    // was chosen and a redo pre-fills. Only on a committed plan (not a preview).
    if (answersRef.current) {
      saveMacroAnswers({ answers: answersRef.current, picks: buildPicks(answersRef.current) })
    }
    router.push('/app/fuel')
    router.refresh()
  }

  // Skip the whole quiz: unlock Fuel with the DB default targets + an untailored
  // coach (the deliberate softening of the old hard wall). We still pass any
  // eater-type the user picked before skipping, so even a skipper keeps a little
  // tailoring. Falls through to the dashboard on a rare save failure.
  async function handleSkip() {
    const picked = answersRef.current?.eaterType as DietStyle | undefined
    setSaving(true)
    const res = await saveSkippedSetup(picked)
    if (!res.ok) {
      setSaving(false)
      router.push(configured ? '/app/fuel' : '/app')
      return
    }
    router.push('/app/fuel')
    router.refresh()
  }

  if (!result) {
    // Wait for the localStorage pre-fill load before mounting the quiz, so a
    // redo opens on the user's prior answers (Quiz seeds initialAnswers once).
    if (!booted) return null
    return (
      <Quiz
        chapters={CHAPTERS}
        questions={questions}
        initialAnswers={initialAnswers}
        onComplete={handleComplete}
        // Cancel/X/Escape: a redo (already configured) returns to Fuel, where
        // the user came from. A first-timer exits to the dashboard, NEVER into
        // the Fuel tracker — it's hard-walled until the quiz is finished (see
        // /app/fuel/page.tsx) so an unconfigured section stays unreachable.
        onCancel={() => router.push(configured ? '/app/fuel' : '/app')}
        onSkip={handleSkip}
        skipLabel="skip for now, I’ll just log"
        finishLabel="see my plan"
      />
    )
  }

  const cycled = result.training.kcal !== result.rest.kcal
  // Non-macro styles get warm, target-free framing (they still keep a gentle
  // calorie floor underneath for logging context).
  const light = !wantsMacroTargets(result.dietStyle) && result.dietStyle !== 'macros'
  const lightCopy = light && result.dietStyle in LIGHT_RESULT
    ? LIGHT_RESULT[result.dietStyle as keyof typeof LIGHT_RESULT]
    : null

  return (
    <div className={styles.resultShell}>
      <WelcomeBackdrop />
      <div className={styles.result}>
        <div className={styles.gemStage}>
          <CoachGem preset="sage" size={220} controlRef={gemCtrl} />
        </div>
        <span className={styles.resultEyebrow}>
          <span className={styles.resultRule} aria-hidden /> {lightCopy ? 'your focus' : 'your plan'}
        </span>
        <h2 className={styles.resultTitle}>
          <em>{lightCopy ? DIET_STYLE_LABEL[result.dietStyle] : APPROACH_LABEL[result.approach]}</em>
        </h2>
        <p className={styles.resultReason}>{lightCopy ? lightCopy.reason : result.reason}</p>

        <div className={styles.cards}>
          {cycled && !lightCopy ? (
            <>
              <TargetCard label="Training day" t={result.training} highlight />
              <TargetCard label="Rest day" t={result.rest} />
            </>
          ) : (
            <TargetCard label={lightCopy ? lightCopy.cardLabel : 'Every day'} t={result.base} highlight />
          )}
        </div>

        <p className={styles.note}>
          {lightCopy
            ? lightCopy.note
            : `${cycled ? 'Tap gym or rest day on the tracker. ' : ''}As you log your food and weight, Vitality dials this in to your real numbers.`}
        </p>
        {err && <p className={styles.err}>{err}</p>}
        <button className={styles.save} onClick={save} disabled={saving}>
          {saving ? 'saving…' : <>{lightCopy ? lightCopy.cta : 'use this plan'} <span aria-hidden>→</span></>}
        </button>
        <button className={styles.redo} onClick={() => setResult(null)} disabled={saving}>
          start over
        </button>
      </div>
    </div>
  )
}

function TargetCard({ label, t, highlight }: { label: string; t: MacroTarget; highlight?: boolean }) {
  return (
    <div className={`${styles.target} ${highlight ? styles.targetHi : ''}`}>
      <span className={styles.targetLabel}>{label}</span>
      <span className={styles.targetKcal}>
        {t.kcal}
        <span className={styles.targetUnit}>kcal</span>
      </span>
      <div className={styles.macros}>
        <span><b>{t.protein}g</b> protein</span>
        <span><b>{t.carbs}g</b> carbs</span>
        <span><b>{t.fat}g</b> fat</span>
      </div>
    </div>
  )
}
