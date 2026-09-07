import type { Briefing, Nudge, Severity } from './nudges.js';

// ── Lead-insight selection ────────────────────────────────────────────────────
// The daily briefing returns every nudge sorted by raw severity. The greeting
// leads with exactly ONE. A pure severity-sort would always bury an emotionally-
// present reach-out (a low-mood check-in, a goal follow-up) behind the generic
// "today's call". This scorer lets a real, caring, cross-tile insight win the
// headline — the thing a single-domain app can't produce and a companion leads with.

// 'coverage' is always-present plumbing context — never a fresh headline.
const NEVER_LEAD = new Set<Nudge['domain']>(['coverage']);

// Severity is the spine of urgency.
const URGENCY: Record<Severity, number> = { urgent: 100, suggest: 40, info: 10 };

// Cross-tile / in-your-corner domains earn a headline boost. Mind is weighted so
// a genuine low-mood reach-out (only fired when the signal is real — see
// moodNudges' gate) leads over a routine training 'suggest' — being in someone's
// corner comes before the deload reminder. A true 'urgent' (100) still wins.
const CARE_BOOST: Partial<Record<Nudge['domain'], number>> = {
  mind: 40,       // a low-mood reach-out — Vitality's emotional core
  nutrition: 12,  // the tired→eating cross-tile pattern surfaces here
  finance: 12,    // a renewal / large debit worth a word
  peak: 8,        // the caffeine→recovery seam — a cross-tile steer leads over a routine suggest, but stays under a low-mood reach-out
  sleep: 8,       // the sleep→mood seam — same cross-tile weighting as peak; still under a low-mood reach-out
  goals: 8,       // a deadline or a follow-up
};

// The synthesis "today's call" is the canonical headline on an otherwise calm
// day — a small bias so it leads when nothing more pressing exists.
const SYNTHESIS_BIAS: Partial<Record<Nudge['domain'], number>> = { today: 5 };

export function scoreInsight(n: Nudge): number {
  return URGENCY[n.severity] + (CARE_BOOST[n.domain] ?? 0) + (SYNTHESIS_BIAS[n.domain] ?? 0);
}

/** Pick the single best nudge to headline the greeting, or null if none qualify. */
export function selectLeadInsight(nudges: Nudge[]): Nudge | null {
  let best: Nudge | null = null;
  let bestScore = -Infinity;
  for (const n of nudges) {
    if (NEVER_LEAD.has(n.domain)) continue;
    const s = scoreInsight(n);
    if (s > bestScore) {
      bestScore = s;
      best = n;
    }
  }
  return best;
}

// ── The greeting shaper (Vee's voice/format contract) ─────────────────────────
// Domains worth a one-line readout, in scan order. The lead insight is pulled OUT
// so it isn't said twice.
// 'mind' is included so a low-mood reach-out never silently vanishes: when it
// doesn't win the headline (an urgent signal led), it still shows in the readout.
const READOUT_ORDER: Nudge['domain'][] = [
  'today', 'sleep', 'training', 'nutrition', 'peak', 'hydration', 'goals', 'finance', 'supplements', 'mind',
];

/** One short scannable line per key domain, excluding the lead + coverage. The
 *  lead's WHOLE domain is skipped so nothing is mentioned twice — e.g. when the
 *  caffeine→recovery seam leads, the (same-domain) caffeine-load line is suppressed. */
export function readoutLines(nudges: Nudge[], lead: Nudge | null): string[] {
  const lines: string[] = [];
  for (const domain of READOUT_ORDER) {
    if (lead && lead.domain === domain) continue;
    const hit = nudges.find((x) => x.domain === domain && x !== lead);
    if (hit) lines.push(`• ${hit.title}`);
  }
  return lines;
}

// A real, one-tap follow-up — mapped ONLY to existing write tools so we never
// offer something Claude can't actually do.
const OFFER: Partial<Record<Nudge['domain'], string>> = {
  hydration: 'Want me to log a glass of water for you?',
  nutrition: 'Want me to log your next meal as you eat it?',
  supplements: "Want me to mark today's supplements as taken?",
  mind: "Want to talk it through? I'm right here.",
};

/**
 * Shape the briefing into the Start-My-Day greeting in Vee's voice contract:
 * a warm "Howdy", a 3-second scannable readout, the ONE insight that matters
 * most, and an optional one-tap offer. Returns finished text; the connected
 * Claude delivers it warmly as Vee (per the Project instruction).
 */
export function shapeStartMyDay(b: Briefing): string {
  const name = b.greetingName?.trim() || 'there';
  const lead = selectLeadInsight(b.nudges);
  const readout = readoutLines(b.nudges, lead);

  const out: string[] = [];
  out.push(
    "[Deliver the below warmly, in Vee's voice — in their corner, honest, no shame. " +
      'Lead with the greeting, keep it scannable, end on the one insight + offer.]',
  );
  out.push('');
  out.push(`Howdy, ${name}.`);

  if (readout.length) {
    out.push('');
    out.push('Your day at a glance:');
    out.push(...readout);
  }

  if (lead) {
    out.push('');
    out.push(`The one thing that matters most today — ${lead.title}`);
    out.push(lead.detail);
    const offer = OFFER[lead.domain];
    if (offer) {
      out.push('');
      out.push(offer);
    }
  } else {
    out.push('');
    out.push("Nothing's flashing for action today — that's a good place to be.");
  }

  return out.join('\n');
}
