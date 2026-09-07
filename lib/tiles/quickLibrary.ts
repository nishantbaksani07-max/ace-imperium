/**
 * quickLibrary - the Quick Tile builder's LIBRARY (BUILD80, showcased BUILD81).
 *
 * The bar on /app/create FINDS, it never generates: every result here is a
 * hand-curated preset whose `prompt` is a sentence the deterministic engine
 * (mcp infer -> renderTile) is PROVEN to resolve exactly (kind/unit/target
 * verified through the real dist pipeline before ship - see BUILD80). Typing
 * filters this list; no match means the ask is bigger than the library, and
 * the Claude card rises instead. That is the whole honesty model: search a
 * candy store, not a genie.
 *
 * BUILD81 gave every piece a PERSONALITY: `desc` is its one-line voice (serif
 * italic on the card, lowercase, warm, never an em dash) and `foot` is its
 * honest spec line (mono, uppercase, "what shape · what unit · what goal"),
 * both locked by the jest suite. The matching micro-visual lives in
 * lib/tiles/presetViz.tsx, keyed by the same id (coverage-tested).
 *
 * Pure data + a pure matcher. No IO, no React. Jest: __tests__/quickLibrary.test.ts
 */

export type LifeArea = 'body' | 'mind' | 'money' | 'fuel' | 'habits'

export interface QuickPreset {
  id: string
  /** Card title, exactly as shown on the shelf. */
  label: string
  area: LifeArea
  /** Lowercase words the finder matches besides the label. */
  keywords: string[]
  /** The PROVEN build sentence + explicit overrides (never free text). */
  prompt: string
  name?: string
  unit?: string
  target?: number
  /** Explicit stream direction when the prompt's words cannot carry it ("did i
   *  make my bed" says nothing about which way is good). Pinned into the tile's
   *  report identity so goal binding and the pill logic know more-is-the-win. */
  goalDirection?: 'up' | 'down'
  /** The piece's voice: one lowercase serif line on the card. No em dashes. */
  desc: string
  /** The honest spec: mono uppercase "SHAPE · UNIT · EXTRA" under the desc. */
  foot: string
}

export const AREA_LABEL: Record<LifeArea, string> = {
  body: 'Body',
  mind: 'Mind',
  money: 'Money',
  fuel: 'Fuel',
  habits: 'Habits',
}

export const AREA_ORDER: LifeArea[] = ['body', 'mind', 'money', 'fuel', 'habits']

/** Every sentence below is locked by the BUILD80 proof harness (render+lint 0 errors). */
export const PRESETS: QuickPreset[] = [
  // ── Body ──────────────────────────────────────────────────────────────────
  {
    id: 'steps',
    label: 'Steps',
    area: 'body',
    keywords: ['walk', 'walking', '10000'],
    prompt: '10,000 steps a day',
    desc: 'ten thousand honest steps, walked into a filling ring.',
    foot: 'TALLY · STEPS · GOAL 10,000',
  },
  {
    id: 'pushups',
    label: 'Pushups',
    area: 'body',
    keywords: ['push ups', 'exercise'],
    prompt: 'how many pushups i do',
    goalDirection: 'up',
    desc: 'drop and count. the tally climbs with you.',
    foot: 'TALLY · REPS',
  },
  {
    id: 'workouts',
    label: 'Workouts',
    area: 'body',
    keywords: ['gym', 'sessions', 'training'],
    prompt: 'how many workouts this week',
    desc: 'a week of sessions, stacked like proof.',
    foot: 'TALLY · SESSIONS',
  },
  {
    id: 'weight',
    label: 'Weight',
    area: 'body',
    keywords: ['bodyweight', 'scale', 'kg', 'lb'],
    prompt: 'my bodyweight',
    name: 'Weight',
    desc: 'a slow number, tracked gently, trending true.',
    foot: 'MEASURE · KG / LB',
  },
  {
    id: 'waist',
    label: 'Waist',
    area: 'body',
    keywords: ['measurement', 'cm', 'inches'],
    prompt: 'my waist',
    name: 'Waist',
    desc: 'the tape does not flatter. that is the point.',
    foot: 'MEASURE · CM / IN',
  },
  {
    id: 'coldplunge',
    label: 'Cold Plunges',
    area: 'body',
    keywords: ['ice bath', 'cold shower'],
    prompt: 'cold plunges',
    goalDirection: 'up',
    desc: 'every icy dip goes on the board.',
    foot: 'TALLY · PLUNGES',
  },
  {
    id: 'sleep',
    label: 'Sleep',
    area: 'body',
    keywords: ['hours', 'rest', 'bed'],
    prompt: 'hours i sleep',
    name: 'Sleep',
    goalDirection: 'up',
    desc: 'eight quiet hours, kept like a promise.',
    foot: 'TIMER · HOURS · GOAL 8',
  },
  // ── Mind ──────────────────────────────────────────────────────────────────
  {
    id: 'mood',
    label: 'Mood',
    area: 'mind',
    keywords: ['feeling', 'happiness', 'rate'],
    prompt: 'rate my mood out of 10',
    desc: 'one to ten, how the day actually felt.',
    foot: 'DIAL · 1 TO 10',
  },
  {
    id: 'stress',
    label: 'Stress',
    area: 'mind',
    keywords: ['anxiety', 'level'],
    prompt: 'rate my stress out of 10',
    name: 'Stress',
    desc: 'name the pressure and watch it loosen.',
    foot: 'DIAL · 1 TO 10',
  },
  {
    id: 'meditation',
    label: 'Meditation',
    area: 'mind',
    keywords: ['mindfulness', 'breathe', 'calm'],
    prompt: 'minutes i meditate',
    name: 'Meditation',
    desc: 'ten still minutes, one soft ring.',
    foot: 'TIMER · MIN · GOAL 10',
  },
  {
    id: 'reading',
    label: 'Reading',
    area: 'mind',
    keywords: ['books', 'pages'],
    prompt: 'read 20 pages a day',
    name: 'Reading',
    unit: 'pages',
    desc: 'twenty pages a day quietly becomes a library.',
    foot: 'TALLY · PAGES · GOAL 20',
  },
  {
    id: 'gratitude',
    label: 'Gratitude',
    area: 'mind',
    keywords: ['thankful', 'grateful'],
    prompt: 'did i practice gratitude today',
    name: 'Gratitude',
    goalDirection: 'up',
    desc: 'one thankful yes, every single day.',
    foot: 'STREAK · YES / NO',
  },
  {
    id: 'screentime',
    label: 'Screen Time',
    area: 'mind',
    keywords: ['phone', 'scrolling', 'doom'],
    prompt: 'screen time',
    name: 'Screen Time',
    desc: 'the hours your phone keeps. fewer is the win.',
    foot: 'TIMER · MIN · LESS IS THE WIN',
  },
  {
    id: 'journaling',
    label: 'Journaling',
    area: 'mind',
    keywords: ['write', 'diary', 'notes'],
    prompt: 'did i journal today',
    name: 'Journal',
    goalDirection: 'up',
    desc: 'did the pen move today? the streak knows.',
    foot: 'STREAK · YES / NO',
  },
  // ── Money ─────────────────────────────────────────────────────────────────
  {
    id: 'spend',
    label: 'Daily Spend',
    area: 'money',
    keywords: ['spending', 'expenses', 'budget'],
    prompt: 'what I spend each day',
    name: 'Spend',
    desc: 'what left the wallet today, kept honest.',
    foot: 'LEDGER · $ · LESS IS THE WIN',
  },
  {
    id: 'savings',
    label: 'Savings',
    area: 'money',
    keywords: ['save', 'saving'],
    prompt: 'money i save each week',
    name: 'Savings',
    goalDirection: 'up',
    desc: 'money that stays. watch the pile grow.',
    foot: 'LEDGER · $',
  },
  {
    id: 'nobuy',
    label: 'No-Buy Streak',
    area: 'money',
    keywords: ['no spend', 'frugal'],
    prompt: 'my no-buy streak',
    name: 'No-Buy',
    desc: 'days without buying, strung into a streak.',
    foot: 'STREAK · YES / NO',
  },
  // ── Fuel ──────────────────────────────────────────────────────────────────
  {
    id: 'water',
    label: 'Water',
    area: 'fuel',
    keywords: ['hydration', 'glasses', 'drink'],
    prompt: 'a glass of water, every day',
    name: 'Water',
    desc: 'eight glasses, one ring that fills as you do.',
    foot: 'TALLY · GLASSES · GOAL 8',
  },
  {
    id: 'coffee',
    label: 'Coffee',
    area: 'fuel',
    keywords: ['caffeine', 'cups', 'espresso'],
    prompt: 'cups of coffee',
    desc: 'every cup counted, steam and all.',
    foot: 'TALLY · CUPS',
  },
  {
    id: 'protein',
    label: 'Protein',
    area: 'fuel',
    keywords: ['grams', 'macros'],
    prompt: 'grams of protein',
    name: 'Protein',
    desc: 'grams of the good stuff, filling daily.',
    foot: 'TALLY · GRAMS',
  },
  {
    id: 'calories',
    label: 'Calories',
    area: 'fuel',
    keywords: ['kcal', 'energy', 'food'],
    prompt: 'my calories',
    name: 'Calories',
    desc: 'the whole day of eating, one honest number.',
    foot: 'TALLY · KCAL',
  },
  {
    id: 'creatine',
    label: 'Creatine',
    area: 'fuel',
    keywords: ['supplement', 'scoop'],
    prompt: 'creatine supplement',
    name: 'Creatine',
    desc: 'the daily scoop, never skipped, never guessed.',
    foot: 'TALLY · GRAMS',
  },
  {
    id: 'alcohol',
    label: 'Alcohol',
    area: 'fuel',
    keywords: ['beer', 'drinks', 'wine'],
    prompt: 'alcoholic drinks',
    name: 'Alcohol',
    desc: 'drinks counted straight. fewer is the win.',
    foot: 'TALLY · DRINKS · LESS IS THE WIN',
  },
  {
    id: 'cigarettes',
    label: 'Cigarettes',
    area: 'fuel',
    keywords: ['smoking', 'quit', 'vape'],
    prompt: 'cigarettes a day',
    desc: 'counting down to none, one honest day at a time.',
    foot: 'TALLY · LESS IS THE WIN',
  },
  // ── Habits ────────────────────────────────────────────────────────────────
  {
    id: 'gymstreak',
    label: 'Gym Streak',
    area: 'habits',
    keywords: ['workout streak', 'consistency'],
    prompt: 'my gym streak',
    desc: 'show up, tap yes, keep the flame.',
    foot: 'STREAK · YES / NO',
  },
  {
    id: 'wakeearly',
    label: 'Wake Early',
    area: 'habits',
    keywords: ['morning', 'early rise', 'alarm'],
    prompt: 'did i wake up early',
    name: 'Wake Early',
    goalDirection: 'up',
    desc: 'the alarm won. tell the streak.',
    foot: 'STREAK · YES / NO',
  },
  {
    id: 'novaping',
    label: 'No Vaping',
    area: 'habits',
    keywords: ['quit', 'nicotine'],
    prompt: 'my no vaping streak',
    name: 'No Vaping',
    desc: 'clean days, strung together, breathing easy.',
    foot: 'STREAK · CLEAN DAYS',
  },
  {
    id: 'madebed',
    label: 'Made My Bed',
    area: 'habits',
    keywords: ['bed', 'tidy', 'morning'],
    prompt: 'did i make my bed',
    name: 'Made My Bed',
    goalDirection: 'up',
    desc: 'the first win of the day, made neat.',
    foot: 'STREAK · YES / NO',
  },
]

/**
 * The finder. Case-insensitive substring over label + keywords + area word.
 * Word-start bias: matches that BEGIN a label rank before mid-word hits, so
 * "co" puts Coffee and Cold Plunges ahead of "No-Buy". Pure.
 */
export function findPresets(query: string): QuickPreset[] {
  const q = query.trim().toLowerCase()
  if (!q) return PRESETS
  const scored: Array<[number, QuickPreset]> = []
  for (const p of PRESETS) {
    const label = p.label.toLowerCase()
    const hay = [label, ...p.keywords, p.area]
    let score = -1
    for (const h of hay) {
      if (h === q) score = Math.max(score, 3)
      else if (h.startsWith(q)) score = Math.max(score, 2)
      else if (h.includes(q)) score = Math.max(score, 1)
    }
    // multi-word queries: every word must land somewhere
    if (score < 0 && q.includes(' ')) {
      const words = q.split(/\s+/)
      if (words.every((w) => hay.some((h) => h.includes(w)))) score = 1
    }
    if (score >= 0) scored.push([score, p])
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, p]) => p)
}
