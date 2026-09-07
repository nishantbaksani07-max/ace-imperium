/*
 * Vee ask-card glyph registry.
 *
 * The whitelist of line icons Vee may attach to an answer chip. Each value is
 * the INNER markup of a 24x24 line SVG (the renderer wraps it with the shared
 * stroke styling, so paths here carry no stroke/fill of their own). This single
 * file is what keeps the ask-card system "automatic": the chat route validates
 * the model's glyph choice against ASK_GLYPH_NAMES and feeds the same list into
 * the system prompt, while AskCard renders ASK_GLYPHS[name]. To support a new
 * question domain, add a glyph here and nothing else changes.
 *
 * Kept emoji-free on purpose (see the "no emojis, use SVG icons" rule). When a
 * model picks an unknown name we fall back to DEFAULT_ASK_GLYPH rather than
 * render nothing.
 */

export const ASK_GLYPHS: Record<string, string> = {
  // pain / sensation
  sharp: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  dull: '<path d="M2 12c3-5 6-5 8 0s5 5 8 0"/>',
  swelling: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
  stiff: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sore: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',

  // time / when
  duringSession: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  before: '<path d="M3 7h18M3 12h12M3 17h7"/>',
  today: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4M15 3v4"/>',

  // yes / no
  yes: '<path d="M5 12l5 5L19 7"/>',
  no: '<path d="M6 6l12 12M18 6L6 18"/>',

  // energy / readiness / recovery
  energyLow: '<path d="M3 17h4l3-9 4 14 3-7h4"/>',
  energyHigh: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  steady: '<path d="M3 12h6l2-5 2 10 2-5h6"/>',
  rested: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  restless: '<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',

  // generic / fuel / mood
  up: '<path d="M5 16l5-6 4 4 5-7"/><path d="M16 7h3v3"/>',
  down: '<path d="M5 8l5 6 4-4 5 7"/><path d="M16 17h3v-3"/>',
  food: '<path d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18M16 3c-2 1-3 3-3 6s1 4 3 4v8"/>',
  water: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  good: '<path d="M7 11v8H4v-8zM7 11l4-7a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2l-1 5a2 2 0 0 1-2 2H7"/>',
  bad: '<path d="M17 13V5h3v8zM17 13l-4 7a2 2 0 0 1-3-2l1-5H6a2 2 0 0 1-2-2l1-5a2 2 0 0 1 2-2h10"/>',
}

export const ASK_GLYPH_NAMES = Object.keys(ASK_GLYPHS)

/** Fallback when the model picks a glyph name not in the registry. */
export const DEFAULT_ASK_GLYPH = 'dull'

/** Normalize an arbitrary glyph name to a known one. */
export function resolveAskGlyph(name: unknown): string {
  return typeof name === 'string' && name in ASK_GLYPHS ? name : DEFAULT_ASK_GLYPH
}
