/**
 * TILE_SPEC - the ONE public rulebook for hand-authoring a Vitality tile.
 *
 * Served verbatim at GET /tile-spec (app/tile-spec/route.ts) AND appended to
 * the Forge build brief's clipboard copy, so an AI with no web access still
 * holds the whole rulebook after one paste. Keep it in LOCKSTEP with the
 * enforcing code (mcp/src/tiles/lintTile.ts + reportContract) - the gate is
 * authoritative; this text is the courtesy map. When a lint rule changes,
 * change this in the same commit.
 *
 * It also carries the DESIGN DNA (tokens, type recipe, signature layout) so
 * a tile built from it looks like Vitality, not generic AI output.
 */

export const TILE_SPEC = `VITALITY TILE SPEC v2
=====================

WHAT YOU ARE BUILDING
A "tile" is ONE complete, sealed, self-contained .html file. It runs inside a
sandboxed iframe on the user's Vitality dashboard (dark, premium, minimal) and
talks to the dashboard ONLY through the Vitality bridge (below). When you
finish, hand the user the single .html file. They upload it on Vitality's
Forge page; a server gate re-checks every rule here and returns a fix list if
anything fails. If the user pastes that fix list back to you, correct the file
and return it again.

Build full-grade, not a stub: a real interface someone would use every day.

THE HARD FLOOR (gate errors; any one of these blocks the upload)
1. Sealed. No external anything: no external <script src>, no CDN, no external
   CSS or fonts (@import/link), no fetch/XHR/WebSocket, no framework runtime.
   Inline all CSS and JS. System font stacks only.
2. One complete document: <!doctype html>, <html>, <head>, <body>. Balanced
   <script> tags. No inline event handlers in HTML attributes (onclick="...");
   use addEventListener in a script.
3. Do NOT declare color-scheme anywhere (no CSS color-scheme property, no
   <meta name="color-scheme">). The host controls it; a dark declaration makes
   the browser paint an opaque white canvas behind the tile. Just give body an
   explicit near-black background.
4. Motion: animate transform and opacity ONLY (no keyframed width/height/top/
   left, no transitioned layout properties, no animated filter or
   backdrop-filter). Include an @media (prefers-reduced-motion: reduce) block
   that calms motion.
5. Dates: local time, formatted YYYY-MM-DD. Never toISOString().split('T')[0]
   (UTC drift). Derive keys from new Date() local getters.
6. Storage: never touch localStorage/sessionStorage directly (the sandbox has
   none); persist ONLY through the bridge, and wrap any storage probe in
   try/catch.

Everything else about how the tile LOOKS is the user's freedom. The design
DNA below is what makes a tile feel native to Vitality; follow it unless the
user asks for their own style. Style choices only ever produce warnings on
the receipt, never rejections.

THE BRIDGE (your only link to the dashboard)
Call the injected API; define nothing yourself. Guard with
if (window.Vitality) { ... }.
  Vitality.save(data)          persist the tile's whole state (any JSON value)
  Vitality.load().then(d => …) restore it (null on first run)
  Vitality.report({ key, label, value, date, kind, goalDirection? })
    the tile's honest headline number for a day. ONE report call site in the
    file, invoked whenever the day's value changes.
      key           short stable slug, e.g. 'bb_accuracy'
      label         short human name, e.g. 'Bb Accuracy'
      value         a number
      date          the local YYYY-MM-DD the value belongs to
      kind          one of: intake | count | duration | rating | measure |
                    money | done
      goalDirection 'up' | 'down' | 'neutral' (which way is good)

PICKING kind (the 7 shapes; this is how Vee reads the tile)
  intake    stuff consumed toward a daily target (water glasses, beers)
  count     how many times today (shots fired, pushups, pages)
  duration  minutes/hours of a thing (reading, meditation, practice)
  rating    a 1-N self-score (mood 1-5)
  measure   a measured level where the number IS the state (accuracy %,
            weight kg, typing wpm)
  money     an amount of currency (saved today, spent today)
  done      a yes/no day mark (value 1 when done)
A tile that tracks a number or a done-mark MUST emit its Vitality.report().
A pure note/journal tile may skip report() entirely.

THE DESIGN DNA (recommended - what makes it look native, never a blocker)
Voice: no emoji, no em dashes (use " - "), glyphs drawn as inline SVG, a mint
::selection style (::selection { background: rgba(110,231,183,.28); }).
Palette - use these exact values:
  background      #050505 (page)   cards: rgba(9,13,12,0.72)
  card border     1px solid rgba(148,163,158,0.16); radius 16-20px
  text            #E7ECEA          muted #94A39E   faint #5C6B66
  accent          mint #6EE7B7 (primary actions, the good direction, glow)
  caution         amber #FCD34D ONLY (over-limit, warnings). NEVER red.
Type recipe - three voices, never more:
  hero number     serif (Georgia, 'Times New Roman', serif), 44-64px,
                  weight 400, the ONE big number that matters today
  eyebrow/labels  monospace (ui-monospace, SFMono-Regular, Menlo, monospace),
                  9.5-11px, UPPERCASE, letter-spacing 0.14-0.18em, muted
  body/buttons    system sans (-apple-system, Inter, sans-serif), 13-15px
Signature layout, top to bottom:
  1. a small mono eyebrow (what this tile is)
  2. the serif hero number + its unit, with a quiet status pill beside it
     (pill: 999px radius, 1px mint-tinted border, tiny mono text)
  3. ONE primary action: a pill button, mint background, near-black text,
     instant press feedback (transform: scale(0.97))
  4. ONE supporting section fed by saved data: a 7-day bar chart (thin
     rounded bars, rgba(110,231,183,0.5), today solid mint), a streak grid,
     or a short history list. Honest empty state in muted text ("no data
     yet"), never fake numbers.
Feel: generous space (24px+ card padding), calm entrance (one rise-in of
opacity+translateY, 0.5-0.8s ease), touch targets 40px+, safe-area insets
respected (env(safe-area-inset-*)). No clutter: every text element earns its
place or gets cut.

FINISH LINE
Return ONE .html file. The user drops it on Vitality > Forge. Green means it
lands in their Library (with the Vee mark when it reports a stream); a fix
list means correct every item and hand back the corrected file.
`
