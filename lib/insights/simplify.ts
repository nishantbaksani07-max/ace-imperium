/**
 * simplifyLead — the "simple" read for the "Vitality noticed" card (the detailed/simple
 * toggle Alex loved in public/vee-noticed-rarity-demo.html). Detailed keeps the real
 * numbers (the personal sauce); simple strips them so the insight scans in a second.
 *
 * It works by dropping the number-heavy sentence (the receipts read aloud) and keeping
 * the human hook plus the "do this" move, which is where the highlighted key phrase
 * lives, so the highlight still lands. Mechanical + general: it simplifies ANY seam's
 * lead, not a per-insight hand-written copy. Pure + IO-free + unit-tested.
 */

/** Strip the numeric detail from a lead, keeping the meaning. The card shows this in
 *  "simple" mode (and hides the numeric chips alongside it). */
export function simplifyLead(lead: string): string {
  const sentences = lead.match(/[^.!?]+[.!?]*/g) ?? [lead]
  const numberFree = sentences.filter((s) => !/\d/.test(s))
  // keep the number-free sentences (the hook + the move); never return empty.
  const kept = numberFree.length > 0 ? numberFree : sentences.slice(0, 1)
  return kept
    .map((s) => s.replace(/\s*\([^)]*\)/g, '')) // drop any parenthetical asides
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
}
