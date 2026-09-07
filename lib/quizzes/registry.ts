/**
 * Quiz registry — every tailoring quiz lives here as a small data file.
 * Adding a new quiz: write its manifest, register it in QUIZZES, and
 * the dynamic route picks it up automatically.
 *
 * Each manifest declares:
 *   - id            (the URL slug AND the preferences slice key)
 *   - title         (eyebrow above the dialog title — e.g. "your goal")
 *   - chapters      (4-dot progress trail entries)
 *   - questions     (single-select / multi-select / text)
 *   - toPayload     (shape the freshly-answered map into the slice
 *                    payload the server action expects)
 *   - fromPayload   (hydrate the quiz from a previously-saved slice
 *                    so retakes feel "you already told me this")
 */
import { createElement } from 'react'

import type { QuizQuestion, QuizChapter, QuizAnswers } from '@/components/Quiz'
import NutritionIcon, { type NutritionIconName } from '@/components/NutritionIcon'
import type { GlyphKey } from './glyphs'
import type {
  QuizSliceKey,
  UserPreferences,
  MentorPreferences,
  NutritionPreferences,
  NutritionFix,
  NutritionSkin,
  NutritionRestriction,
} from '@/lib/preferences'

/** Tailored celebration copy shown after the user submits the last
 *  question and the save completes. Renders inside <QuizComplete>. */
export interface QuizCompletion {
  /** Small overline above the headline. Default: "one step closer". */
  eyebrow?: string
  /** Punchy headline — the "you did it" line for this quiz. */
  headline: string
  /** Optional supporting line under the headline. */
  sub?: string
  /** Continue CTA label. Default: "let's go". */
  ctaLabel?: string
  /** Per-quiz mark shown on the crystal at the start of the
   *  celebration sequence — flickers out and the CHECK glyph flickers
   *  in to mark the moment. When unset, the screen jumps straight to
   *  the check (no flicker sequence). */
  glyph?: GlyphKey
  /** Where to push the user when they hit the celebration CTA — the
   *  module their answers now power (mentor chat, water page, goals).
   *  Overrides the QuizPage's default `returnPath` so the user lands
   *  on the result of what they just did instead of bouncing back to
   *  the welcome checklist. When unset, falls through to returnPath. */
  destinationHref?: string
}

export interface QuizManifest<K extends QuizSliceKey = QuizSliceKey> {
  id: K
  title: string         // e.g. "Tune your Mentor"
  finishLabel: string   // verb on the final-question CTA
  chapters: QuizChapter[]
  questions: (QuizQuestion & { chapter: number })[]
  /** Per-quiz "you're set" payoff copy, shown after the answers save. */
  completion: QuizCompletion
  /** Convert a fresh QuizAnswers map into the typed slice payload that
   *  the server action will stamp + save. Throws if required fields
   *  are missing — caller should validate via the engine's
   *  per-question isAnswered check before calling. */
  toPayload: (answers: QuizAnswers) => Omit<NonNullable<UserPreferences[K]>, 'completed_at'>
  /** Hydrate the quiz with previously-saved answers (retake). */
  fromPayload: (slice: NonNullable<UserPreferences[K]>) => QuizAnswers
}

// ── Mentor ──────────────────────────────────────────────────────────

const mentorManifest: QuizManifest<'mentor'> = {
  id: 'mentor',
  title: 'Tune your Mentor',
  finishLabel: 'save',
  chapters: [
    { id: 1, title: 'the way you want to be coached', sub: '' },
  ],
  questions: [
    {
      id: 'tone',
      chapter: 1,
      kind: 'single',
      prompt: 'How should I talk to you?',
      options: [
        { value: 'direct',       label: 'Direct',       sub: 'cut the fluff, just tell me' },
        { value: 'encouraging',  label: 'Encouraging',  sub: 'warm, in your corner' },
        { value: 'data_driven',  label: 'Data-driven',  sub: 'numbers + reasoning' },
        { value: 'socratic',     label: 'Socratic',     sub: 'ask me questions back' },
      ],
    },
    {
      id: 'focus',
      chapter: 1,
      kind: 'multi',
      prompt: 'What do you want me focused on?',
      hint: 'pick anything that matters to you',
      maxSelections: 5,
      options: [
        { value: 'fitness',  label: 'Fitness' },
        { value: 'business', label: 'Business' },
        { value: 'habits',   label: 'Habits' },
        { value: 'life',     label: 'Life decisions' },
        { value: 'recovery', label: 'Recovery + stress' },
      ],
    },
    {
      id: 'memory_notes',
      chapter: 1,
      kind: 'text',
      prompt: 'Anything I should always remember about you?',
      hint: 'free text. Context, constraints, things I shouldn\'t forget. Skip if nothing comes to mind.',
      textPlaceholder: 'e.g. "in a cut so don\'t suggest mass-gain advice" or "I work nights, schedule around that"',
    },
  ],
  completion: {
    eyebrow: 'mentor tuned',
    headline: "Now I know how you like it.",
    sub: 'Every chat from here is shaped by what you just told me.',
    ctaLabel: 'open mentor',
    glyph: 'dot',
    destinationHref: '/app/mentor',
  },
  toPayload: (a) => ({
    tone: a.tone as MentorPreferences['tone'],
    focus: (a.focus as MentorPreferences['focus']) ?? [],
    memory_notes: typeof a.memory_notes === 'string' ? a.memory_notes.trim() : '',
  }),
  fromPayload: (s) => ({
    tone: s.tone,
    focus: s.focus,
    memory_notes: s.memory_notes,
  }),
}

// ── Nutrition ───────────────────────────────────────────────────────
//
// The "eat better" food-story quiz. The body-goal screen ("what are you
// working toward?") was removed — the goal is set once in the macro quiz, and
// skin/digestion have their own questions here, so it was asked twice. `fix`
// now holds the "feel" goals only; restrictions still split allergens + diet
// into two themed pages that merge at save. Every option carries a
// NutritionIcon. Feeds the Food Coach (see lib/coach/collectors).
const FIX_FEEL: NutritionFix[] = ['energy', 'sleep', 'focus', 'mood', 'cravings']
const ALLERGENS: NutritionRestriction[] =
  ['gluten_free', 'lactose', 'peanut', 'tree_nut', 'egg', 'soy', 'fish', 'shellfish', 'sesame']
const DIET: NutritionRestriction[] = ['vegetarian', 'vegan', 'halal', 'kosher', 'pork_free']

/** Drop 'none' when any real value is present; keep a lone 'none'. */
const dropNone = <T extends string>(arr: T[]): T[] => {
  const real = arr.filter((v) => v !== 'none')
  if (real.length) return real
  return arr.includes('none' as T) ? ['none' as T] : []
}
/** Build an Icon FC for a NutritionIcon name (registry is .ts, so no JSX). */
const icon = (name: NutritionIconName) => () => createElement(NutritionIcon, { name })

const nutritionManifest: QuizManifest<'nutrition'> = {
  id: 'nutrition',
  title: 'Your food story',
  finishLabel: 'see my food story',
  chapters: [
    { id: 1, title: 'your food story', sub: '' },
    { id: 2, title: 'what your body needs', sub: '' },
    { id: 3, title: 'how I show up for you', sub: '' },
  ],
  questions: [
    {
      id: 'fix_feel', chapter: 1, kind: 'multi', maxSelections: 2,
      prompt: 'What do you want to feel more of?', hint: 'Pick up to two.',
      options: [
        { value: 'energy',   label: 'More energy',    Icon: icon('energy') },
        { value: 'sleep',    label: 'Better sleep',   Icon: icon('sleep') },
        { value: 'focus',    label: 'Sharper focus',  Icon: icon('focus') },
        { value: 'mood',     label: 'Better mood',    Icon: icon('mood') },
        { value: 'cravings', label: 'Fewer cravings', Icon: icon('cravings') },
      ],
    },
    {
      id: 'skin', chapter: 1, kind: 'multi', exclusiveOption: 'none',
      prompt: 'Any skin stuff food might be feeding?',
      options: [
        { value: 'acne',    label: 'Breakouts or acne', Icon: icon('acne') },
        { value: 'redness', label: 'Redness',           Icon: icon('redness') },
        { value: 'none',    label: 'None',              Icon: icon('none') },
      ],
    },
    {
      id: 'gut', chapter: 1, kind: 'single',
      prompt: 'How does your gut feel after meals?',
      options: [
        { value: 'often',     label: 'Often bloated', Icon: icon('gut_often') },
        { value: 'sometimes', label: 'Sometimes',     Icon: icon('gut_some') },
        { value: 'fine',      label: 'Feels fine',    Icon: icon('gut_fine') },
      ],
    },
    {
      id: 'restrict_allergens', chapter: 2, kind: 'multi', exclusiveOption: 'none',
      prompt: 'Any allergies or intolerances?',
      hint: 'So I never put something unsafe in front of you.',
      options: [
        { value: 'gluten_free', label: 'Celiac or gluten', Icon: icon('gluten') },
        { value: 'lactose',     label: 'Lactose or dairy', Icon: icon('dairy') },
        { value: 'peanut',      label: 'Peanut',           Icon: icon('peanut') },
        { value: 'tree_nut',    label: 'Tree nut',         Icon: icon('tree_nut') },
        { value: 'egg',         label: 'Egg',              Icon: icon('egg') },
        { value: 'soy',         label: 'Soy',              Icon: icon('soy') },
        { value: 'fish',        label: 'Fish',             Icon: icon('fish') },
        { value: 'shellfish',   label: 'Shellfish',        Icon: icon('shellfish') },
        { value: 'sesame',      label: 'Sesame',           Icon: icon('sesame') },
        { value: 'none',        label: 'None of these',    Icon: icon('none') },
      ],
    },
    {
      id: 'restrict_diet', chapter: 2, kind: 'multi', exclusiveOption: 'none',
      prompt: 'Any way of eating you follow?',
      options: [
        { value: 'vegetarian', label: 'Vegetarian', Icon: icon('vegetarian') },
        { value: 'vegan',      label: 'Vegan',      Icon: icon('vegan') },
        { value: 'halal',      label: 'Halal',      Icon: icon('halal') },
        { value: 'kosher',     label: 'Kosher',     Icon: icon('kosher') },
        { value: 'pork_free',  label: 'Pork free',  Icon: icon('pork_free') },
        { value: 'none',       label: 'None',       Icon: icon('none') },
      ],
    },
    {
      id: 'avoid_notes', chapter: 2, kind: 'text', optional: true,
      prompt: "Any foods you already know don't sit right?",
      textPlaceholder: 'dairy, onion, garlic, spicy food, fried food, coffee...',
    },
    {
      id: 'approach', chapter: 3, kind: 'single',
      prompt: 'How should I talk to you about food?',
      options: [
        { value: 'balanced',   label: 'Numbers are fine', sub: 'Show me calories and macros.',    Icon: icon('balanced') },
        { value: 'feel_first', label: 'Skip the numbers', sub: 'Focus on how foods make me feel.', Icon: icon('feel') },
      ],
    },
    {
      id: 'adventurous', chapter: 3, kind: 'single',
      prompt: 'How adventurous are you with food?',
      options: [
        { value: 'high',    label: 'Give me anything', Icon: icon('adv_high') },
        { value: 'simple',  label: 'Keep it simple',   Icon: icon('adv_simple') },
        { value: 'routine', label: 'Same few meals',   Icon: icon('adv_routine') },
      ],
    },
    {
      id: 'pace', chapter: 3, kind: 'single',
      prompt: 'How hard should I push you?',
      hint: "No wrong answer. This is built for you, wherever you're starting.",
      options: [
        { value: 'gentle',   label: 'Go easy on me',        sub: 'Ease me in, keep it kind.',           Icon: icon('pace_gentle') },
        { value: 'balanced', label: 'Somewhere in between', sub: 'Encourage me, nudge me a little.',     Icon: icon('pace_mid') },
        { value: 'driven',   label: 'Push me',              sub: "I'm ready to be challenged.",          Icon: icon('pace_push') },
      ],
    },
  ],
  completion: {
    eyebrow: 'your food story is set',
    headline: 'Now I get your body.',
    sub: 'From here, every meal you log gets read through this.',
    ctaLabel: 'back to my food',
    glyph: 'drop',
    destinationHref: '/app/fuel',
  },
  toPayload: (a): Omit<NutritionPreferences, 'completed_at'> => {
    const feel = (a.fix_feel as NutritionFix[] | undefined) ?? []
    const allergens = (a.restrict_allergens as NutritionRestriction[] | undefined) ?? []
    const diet = (a.restrict_diet as NutritionRestriction[] | undefined) ?? []
    return {
      fix: [...feel],
      skin: dropNone((a.skin as NutritionSkin[] | undefined) ?? []),
      gut: a.gut as NutritionPreferences['gut'],
      restrictions: dropNone(Array.from(new Set([...allergens, ...diet]))),
      avoid_notes: typeof a.avoid_notes === 'string' ? a.avoid_notes.trim() : '',
      adventurous: a.adventurous as NutritionPreferences['adventurous'],
      approach: a.approach as NutritionPreferences['approach'],
      pace: a.pace as NutritionPreferences['pace'],
    }
  },
  fromPayload: (s) => {
    const noneIfEmpty = <T extends string>(arr: T[]): T[] => (arr.length ? arr : ['none' as T])
    return {
      fix_feel: s.fix.filter((v) => FIX_FEEL.includes(v)),
      skin: s.skin,
      gut: s.gut,
      restrict_allergens: noneIfEmpty(s.restrictions.filter((v) => ALLERGENS.includes(v) || v === 'none')),
      restrict_diet: noneIfEmpty(s.restrictions.filter((v) => DIET.includes(v))),
      avoid_notes: s.avoid_notes,
      adventurous: s.adventurous,
      approach: s.approach,
      pace: s.pace,
    }
  },
}

// ── Registry ────────────────────────────────────────────────────────

export const QUIZZES = {
  mentor: mentorManifest,
  nutrition: nutritionManifest,
} as const

export type QuizId = keyof typeof QUIZZES

export function getQuiz<K extends QuizId>(id: K): typeof QUIZZES[K] {
  return QUIZZES[id]
}

export function isQuizId(id: string): id is QuizId {
  return id in QUIZZES
}
