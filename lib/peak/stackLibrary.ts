/**
 * Peak Stack substance library (BUILD70) — the canonical catalog ported from the
 * `peak-stack.html` standalone ("Peak Stack — stimulants, meds & timing"). This
 * is the richer successor to app/app/peak/substances.ts: it adds ADHD meds,
 * antidepressants (steady-state), nicotine and nootropics, and carries the
 * pharmacokinetic inputs (t½, tmax) the Bateman engine in ./stackEngine.ts needs.
 *
 * Pure data, no IO — shared by the (coming) /app/peak/stack page AND Peak's
 * curve, so the two never drift. `mode: 'steady'` substances (SSRIs, atomoxetine)
 * have no acute "peak feel" (peakFeel 0); they work from steady-state levels.
 *
 * NOT medical advice — `caution`/`pair` are educational, ported verbatim.
 */

export type StackCat = 'stim' | 'adhd' | 'anti' | 'nic' | 'other'
export type StackMode = 'acute' | 'steady'

export interface StackSubstance {
  id: string
  name: string
  cat: StackCat
  icon: string
  mode: StackMode
  /** Elimination half-life, hours. */
  t12: number
  /** Time to peak concentration, hours. */
  tmax: number
  /** Explicit onset (hours); derived from the curve when omitted. */
  onset?: number
  /** Human dose-range label, e.g. "100–200 mg". */
  dose: string
  /** Representative dose in mg — the default for a quick log. */
  doseMg: number
  /** Subjective peak "feel" 0–100 (0 = no acute lift, e.g. steady meds). */
  peakFeel: number
  /** Prescription-only. */
  rx?: boolean
  /** Metabolized by CYP1A2 → smokers clear it faster. */
  cyp1a2?: boolean
  serotonergic?: boolean
  sedating?: boolean
  calm?: boolean
  activating?: boolean
  helps: string
  aliases?: string[]
  /** Stacking / timing tip. */
  pair?: string
  /** Safety note. */
  caution?: string
}

export const STACK_DB: StackSubstance[] = [
  { id: 'caffeine', name: 'Caffeine', cat: 'stim', icon: '☕', mode: 'acute', t12: 5, tmax: 0.75, onset: 0.25, dose: '100–200 mg', doseMg: 120, peakFeel: 52, cyp1a2: true, helps: 'Coffee, tea, energy drinks. Blocks adenosine → alertness.', aliases: ['coffee', 'espresso', 'tea', 'energy drink', 'red bull', 'monster'], pair: 'Stack 100–200 mg L-theanine 2:1 for focus without jitter.' },
  { id: 'preworkout', name: 'Pre-workout', cat: 'stim', icon: '🥤', mode: 'acute', t12: 5, tmax: 1, onset: 0.25, dose: '150–300 mg caf', doseMg: 250, peakFeel: 70, cyp1a2: true, helps: 'Caffeine + beta-alanine blend. Big spike, big crash.', aliases: ['pre workout', 'c4', 'gfuel'], pair: "Don't dose after 2 PM — that much caffeine wrecks sleep." },
  { id: 'nicotine', name: 'Nicotine', cat: 'nic', icon: '🚬', mode: 'acute', t12: 2, tmax: 0.25, onset: 0.05, dose: '2–6 mg', doseMg: 4, peakFeel: 34, helps: 'Pouch, gum, vape. Fast, sharp, short — most addictive.', aliases: ['vape', 'zyn', 'velo', 'velos', 'on!', 'lyft', 'pouch', 'gum', 'cigarette', 'nic'], pair: 'Short half-life → frequent re-dosing. The crash drives the next hit.', caution: 'Highly addictive. Raises heart rate & BP.' },
  { id: 'theacrine', name: 'Theacrine', cat: 'stim', icon: '🌿', mode: 'acute', t12: 20, tmax: 1.5, onset: 0.5, dose: '100–200 mg', doseMg: 150, peakFeel: 40, helps: 'Caffeine-like but slower, less tolerance build. (TeaCrine.)', aliases: ['teacrine'], pair: 'Long half-life — mornings only or it lingers into the night.' },
  { id: 'ltheanine', name: 'L-theanine', cat: 'other', icon: '🍵', mode: 'acute', t12: 1.2, tmax: 0.75, onset: 0.5, dose: '100–200 mg', doseMg: 150, peakFeel: 0, calm: true, helps: "Not a stimulant — smooths caffeine's edge. Calm focus.", aliases: ['theanine', 'suntheanine'], pair: 'Take alongside caffeine 2:1 (theanine:caffeine).' },
  { id: 'adderall-ir', name: 'Adderall IR', cat: 'adhd', icon: '⚡', mode: 'acute', t12: 10, tmax: 3, onset: 0.5, dose: '5–30 mg', doseMg: 20, peakFeel: 80, rx: true, helps: 'Amphetamine salts, immediate-release. Peaks ~3 h, fades ~4–6 h.', aliases: ['adderall', 'amphetamine', 'addy'], pair: "A late dose costs sleep — poor sleep wrecks tomorrow's focus.", caution: "Raises HR & BP. Don't stack with other stimulants. Eat." },
  { id: 'adderall-xr', name: 'Adderall XR', cat: 'adhd', icon: '⚡', mode: 'acute', t12: 11, tmax: 7, onset: 1, dose: '10–30 mg', doseMg: 20, peakFeel: 78, rx: true, helps: 'Extended-release amphetamine. Peaks ~7 h, lasts 10–12 h.', aliases: ['adderall xr'], pair: "Take at wake — dose past ~10 AM and it's active at bedtime.", caution: 'Cardiovascular load. Single morning dose by design.' },
  { id: 'vyvanse', name: 'Vyvanse', cat: 'adhd', icon: '⚡', mode: 'acute', t12: 11, tmax: 3.5, onset: 1.5, dose: '30–70 mg', doseMg: 40, peakFeel: 76, rx: true, helps: 'Lisdexamfetamine prodrug — gentle ramp. Lasts 10–14 h.', aliases: ['lisdexamfetamine', 'elvanse'], pair: 'Smoother curve, long tail. Morning only.', caution: 'Long duration — afternoon doses hurt sleep.' },
  { id: 'ritalin-ir', name: 'Ritalin IR', cat: 'adhd', icon: '⚡', mode: 'acute', t12: 3, tmax: 2, onset: 0.5, dose: '5–20 mg', doseMg: 10, peakFeel: 62, rx: true, helps: 'Methylphenidate IR. Sharp, short — 3–4 h.', aliases: ['methylphenidate', 'ritalin'], pair: 'Short — many split a small early-afternoon dose.', caution: "Don't combine with other stimulants." },
  { id: 'concerta', name: 'Concerta', cat: 'adhd', icon: '⚡', mode: 'acute', t12: 3.5, tmax: 8, onset: 1, dose: '18–54 mg', doseMg: 36, peakFeel: 64, rx: true, helps: 'Methylphenidate ER (osmotic). Slow ramp, 10–12 h.', aliases: ['methylphenidate er'], pair: 'Designed for a single early dose.', caution: 'Late dosing pushes the tail into the night.' },
  { id: 'modafinil', name: 'Modafinil', cat: 'adhd', icon: '🧠', mode: 'acute', t12: 13, tmax: 2.5, onset: 0.75, dose: '100–200 mg', doseMg: 150, peakFeel: 66, rx: true, helps: 'Wakefulness promoter. Long & flat — t½ ~13 h.', aliases: ['provigil', 'modalert'], pair: 'Very long half-life — dose before 10 AM.', caution: 'Reduces effectiveness of hormonal birth control.' },
  { id: 'armodafinil', name: 'Armodafinil', cat: 'adhd', icon: '🧠', mode: 'acute', t12: 14, tmax: 2.5, onset: 0.75, dose: '150 mg', doseMg: 150, peakFeel: 68, rx: true, helps: 'R-enantiomer of modafinil. Even longer tail.', aliases: ['nuvigil'], pair: 'Morning only — the tail runs past midnight.', caution: 'Same birth-control interaction as modafinil.' },
  { id: 'atomoxetine', name: 'Atomoxetine', cat: 'adhd', icon: '🧩', mode: 'steady', t12: 5, tmax: 2, dose: '40–100 mg', doseMg: 60, peakFeel: 0, rx: true, helps: 'Strattera — non-stimulant ADHD. Builds over weeks.', aliases: ['strattera'], pair: 'Consistent timing. Effect is from steady levels, not a peak.', caution: 'Can take 4–6 weeks for full effect.' },
  { id: 'sertraline', name: 'Sertraline', cat: 'anti', icon: '💊', mode: 'steady', t12: 26, tmax: 6, dose: '50–200 mg', doseMg: 100, peakFeel: 0, rx: true, serotonergic: true, helps: 'Zoloft — SSRI. Daily, steady-state in ~1 week.', aliases: ['zoloft'], pair: 'Activating for many — take in the morning.', caution: 'Serotonin syndrome risk with 5-HTP, tramadol, other serotonergics.' },
  { id: 'escitalopram', name: 'Escitalopram', cat: 'anti', icon: '💊', mode: 'steady', t12: 30, tmax: 5, dose: '5–20 mg', doseMg: 10, peakFeel: 0, rx: true, serotonergic: true, helps: 'Lexapro — SSRI. Long half-life, very stable.', aliases: ['lexapro', 'cipralex'], pair: 'AM or PM — pick one and stay consistent.', caution: 'Avoid stacking with other serotonergics.' },
  { id: 'fluoxetine', name: 'Fluoxetine', cat: 'anti', icon: '💊', mode: 'steady', t12: 96, tmax: 6, dose: '20–60 mg', doseMg: 20, peakFeel: 0, rx: true, serotonergic: true, helps: 'Prozac — SSRI. ~4-day half-life + active metabolite.', aliases: ['prozac'], pair: 'Activating — mornings. Missing a dose barely moves levels.', caution: 'Very long washout. Serotonergic interactions.' },
  { id: 'venlafaxine', name: 'Venlafaxine', cat: 'anti', icon: '💊', mode: 'steady', t12: 11, tmax: 6, dose: '75–225 mg', doseMg: 150, peakFeel: 0, rx: true, serotonergic: true, helps: 'Effexor — SNRI. Can be activating.', aliases: ['effexor'], pair: 'Morning if it energizes you.', caution: 'Rough discontinuation — never stop abruptly.' },
  { id: 'bupropion', name: 'Bupropion', cat: 'anti', icon: '💊', mode: 'steady', t12: 21, tmax: 5, dose: '150–300 mg', doseMg: 150, peakFeel: 0, rx: true, activating: true, helps: 'Wellbutrin — NDRI. Activating, not serotonergic.', aliases: ['wellbutrin', 'zyban'], pair: 'Morning. Late doses disrupt sleep.', caution: 'Lowers seizure threshold; adds to stimulant activation.' },
  { id: 'mirtazapine', name: 'Mirtazapine', cat: 'anti', icon: '🌙', mode: 'steady', t12: 30, tmax: 2, dose: '7.5–45 mg', doseMg: 15, peakFeel: 0, rx: true, sedating: true, helps: 'Remeron — sedating. Lower doses are MORE sedating.', aliases: ['remeron'], pair: 'Take at bedtime — it helps you sleep.', caution: 'Daytime grogginess; appetite/weight gain common.' },
  { id: 'trazodone', name: 'Trazodone', cat: 'anti', icon: '🌙', mode: 'steady', t12: 7, tmax: 1.5, dose: '25–100 mg', doseMg: 50, peakFeel: 0, rx: true, sedating: true, serotonergic: true, helps: 'Sedating — low doses used off-label for sleep.', aliases: ['desyrel'], pair: '30–60 min before bed.', caution: 'Morning grogginess if dosed too late.' },
  { id: 'propranolol', name: 'Propranolol', cat: 'other', icon: '🫀', mode: 'acute', t12: 4, tmax: 1.5, onset: 0.5, dose: '10–40 mg', doseMg: 20, peakFeel: 0, rx: true, calm: true, helps: 'Beta-blocker — blunts the physical side of anxiety.', aliases: ['inderal', 'beta blocker'], pair: "Situational — 1 h before the thing you're nervous about.", caution: "Don't casually combine with stimulants; lowers HR & BP." },
  { id: 'melatonin', name: 'Melatonin', cat: 'other', icon: '🌙', mode: 'acute', t12: 1, tmax: 0.75, onset: 0.5, dose: '0.3–1 mg', doseMg: 0.5, peakFeel: 0, calm: true, helps: 'Shifts your clock — not a sedative. Low dose works best.', aliases: ['melatonin'], pair: '30–60 min before target bedtime.' },
]

export const STACK_BY_ID: Record<string, StackSubstance> = Object.fromEntries(
  STACK_DB.map((s) => [s.id, s]),
)

export const STACK_CATS: { key: StackCat | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stim', label: 'Stimulants' },
  { key: 'adhd', label: 'ADHD' },
  { key: 'anti', label: 'Antidepressants' },
  { key: 'nic', label: 'Nicotine' },
  { key: 'other', label: 'Other' },
]

export const CAT_NAME: Record<StackCat, string> = {
  stim: 'Stimulant',
  adhd: 'ADHD med',
  anti: 'Antidepressant',
  nic: 'Nicotine',
  other: 'Other',
}

/** Resolve a free-text query (name / id / alias, case-insensitive) to a
 *  substance — powers quick-add ("zyn" → nicotine) and the importer. */
export function findSubstance(query: string): StackSubstance | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  for (const s of STACK_DB) {
    if (s.id === q || s.name.toLowerCase() === q) return s
  }
  for (const s of STACK_DB) {
    if (s.aliases?.some((a) => a.toLowerCase() === q)) return s
  }
  // Loose contains as a last resort (e.g. "addy xr").
  for (const s of STACK_DB) {
    if (s.name.toLowerCase().includes(q) || s.aliases?.some((a) => a.toLowerCase().includes(q))) return s
  }
  return null
}
