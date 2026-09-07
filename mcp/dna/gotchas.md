# Gotchas

Vitality's hard-won rules, so a tile is right the first time. A tile is ONE sealed
HTML file: no libraries, no CDN, no React, no fonts fetched at runtime. Inline all
HTML, CSS, vanilla JS, and SVG. Each rule reads "Do X, not Y (because Z)." These are
bugs Alex already fixed. Do not re-discover them.

> This is the full rulebook (~9.5K tokens). For the common tile you do NOT need it:
> the 20 highest-leverage rules live in the `gotchas-top` digest (~1.4K tokens), which
> is what the kit's base look and orientation already serve. Read this full file only
> for a rule's reasoning or the overlay / chart / form / input / honesty-of-state rules
> the digest omits. Either way, `check_tile` enforces the whole hard floor on the
> finished HTML, so nothing is lost by reading the digest first.

## The non-negotiables

1. Build date keys from local parts, not `toISOString().slice(0,10)` (because UTC drift jumps the day east of UTC and sticks it west). Use `getFullYear/getMonth/getDate` zero-padded, format `YYYY-MM-DD`.
2. Never animate or drag the `transform` of a `backdrop-filter: blur` element, kill the blur for the motion's duration instead (because the phone GPU re-rasterizes everything behind it every frame: smooth on a laptop, badly laggy on a phone).
3. Use mint or azure for good and on-track, amber for caution, never red for a non-destructive state (because red reads as shame and alarm). Red only for a genuine destructive action that confirms first.
4. Draw glyphs as inline SVG, never emoji or unicode checkmarks (because emoji render inconsistently and read as unpolished). The plain `->` arrow glyph is fine.
5. No em dashes anywhere in copy, use periods, commas, colons (because em dashes read as machine-written).
6. Wrap every `localStorage` read and write in try/catch with an in-memory fallback, not a bare call (because a sandboxed or sealed iframe can throw or be cleared, and a storage failure must never crash the tile).
7. Save continuously on each interaction, not at an end-of-session submit (because a closed tab or refresh must never lose data).
8. Confirm before any destructive action, prefer soft-delete or undo (because a hard delete with no path back loses real work).
9. Default the resting state to `opacity:1` with `animation-fill-mode: both`, never depend on the entrance animation to reveal (because if the animation gets dropped, an `opacity:0` base renders invisible: space reserved, nothing shown).
10. Verify motion and scroll on an actual or emulated touch device, not just desktop (because nearly every jank bug here only showed on a phone).

## Dates and time

- Build local date keys with local getters, never `toISOString().split('T')[0]` (because UTC drift shows yesterday's or tomorrow's date). Format all keys `YYYY-MM-DD`.
- Re-derive the active day on a ~60s timer, not once on load (because a tile left open across midnight or the rollover hour keeps writing to the stale day).
- If "the day" should not flip at midnight, subtract a rollover hour first (because people log late-night events against the day they just finished). Vitality rolls supplements at 6am, food and macros at 4am. Default with no late-night meaning is plain midnight.
- Pick ONE rollover rule per concept and use the same key for the write, the cache, and the read, do not mix (because two views with different rollovers disagree between midnight and the cutoff).
- For "last N days" math, step with noon-UTC dates, not by adding 86400000 ms (because DST days are 23 or 25 hours, so ms stepping drifts a day twice a year). Build each key from `new Date(Date.UTC(y, m-1, d - i, 12))`.
- Date each record by the user's own offset, carrying the offset with the data, not server-local time (because server-local is not the user's calendar day).

```js
function dayKey(d = new Date()) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function dayKeyRollover(hour, d = new Date()) {
  const x = new Date(d.getTime() - hour * 3600 * 1000);
  return dayKey(x);
}
```

## Animation and motion

- Animate only `transform` and `opacity`, never `width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, or `box-shadow` in a loop or transition (because those trigger layout and paint every frame and drop below 60fps on a phone, while `transform` and `opacity` are GPU-composited). A width becomes `scaleX`, a position becomes `translate`, a glow pulse becomes `opacity` on a pre-blurred layer.
- Put the entrance animation on a wrapper and keep the moving element's `transform` free, not both on one element (because a finished `animation: ... forwards` pins the transform and overrides your inline `translateX`).
- Use `animation-fill-mode: backwards` on a rounded `overflow:hidden` box, not `forwards` (because a lingering transform re-rasterizes its edge every scroll frame, so the card top "acts up"). Settle to `transform: none`.
- Compute per-item stagger delay as a concrete inline value via the `--enter-delay` recipe (set `style="--enter-delay: 0.32s"` per item and reference `var(--enter-delay)` in the `animation-delay`), not `calc(.5s + var(--i)*.08s)` (because an unset var makes the `calc()` fail and silently drops the entire `animation` shorthand, while a resolved inline value cannot).
- Cross-fade glyph and state swaps through near-zero with an ease, not a hard binary opacity cut (because a binary cut reads as a strobe or flash). Dim to ~0, swap at the trough, ease back up.
- Anchor loop time to the phase start, not a global wall clock (because a wall-clock loop appears mid-cycle or restarts halfway).
- Keep real content mounted through a reveal and only unmount items that leave, not re-fade the whole list on settle (because a second settle fade makes the reveal "blink" right after it finishes).
- Show a cheap placeholder during the entrance and mount expensive init only after the cascade settles (~900ms), not during it (because a long main-thread task like WebGL or shader compile stalls frames mid-cascade).
- Honor `prefers-reduced-motion: reduce` by killing transitions and freezing or hiding decorative loops, scoped to your real selectors not a bare nested `*` (because some users get motion sick or have it off by policy).

```css
@media (prefers-reduced-motion: reduce) {
  .page, .card, .chip { animation: none !important; transition: none !important; }
  .ring, .spark, .particles { display: none; }
}
```

- Put an entrance `scale` or `translate` on an inner wrapper, never on the rounded `overflow:hidden` box that clips full-bleed art (because a `scale(0.97)` on the clip box momentarily shrinks it and exposes the hard cut edge of any art set to `inset:0` or `inset:-10%`, so the reveal looks bordered off on load and refresh).
- Reserve room for the largest value an animated number will ever reach and align it with `tabular-nums`, not size the box to the resting value (because a count-up from 1 digit to 3 digits widens each frame and an `overflow:hidden` or fit-width container clips the widest frames at the far edge mid-animation).
- Paint the destination screen in its final position before unmounting the intro and animate one shared element between them, not remove the first screen then mount the second (because an unmount-then-mount leaves a one-frame gap so the handoff reads as a glitchy cut instead of a continuation).

## Mobile and phone performance

- If a glass element must move, drop its blur for the motion and add `will-change:transform`, do not keep the blur live (because a plain composited translate is cheap and the glass look survives on gradient, border, and shadow). The blur returns at rest free.
- Write the live drag transform straight to the DOM node with `transition:none`, not through state (because routing per-pointermove through a re-render or a transition makes the dragged element trail the finger). Let state own only the committed toggle.
- Use a short transform transition (~80ms) WHILE dragging, not pure `transition:none` (because iOS emits only a couple of coarse pointermove events on a flick, so no transition renders as teleporting jumps). Switch to a longer ease for the commit glide.
- Play the commit glide (~200ms) to completion, THEN run the action, not on the same frame as the move (because firing on the move frame means nothing animates).
- Drive cursor parallax by writing `el.style.transform` directly, not per-frame state (because re-rendering on every mouse move thrashes). Keep movement subtle (~8px), set the art layer `inset:-10%` so edges never reveal, reset to `translate3d(0,0,0)` on pointer-leave.

```css
.glass.is-dragging {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  will-change: transform;
}
```

## Layout and CSS

- Add the safe-area inset to top and bottom padding when using `viewport-fit=cover`, not a bare base (because the title or back button otherwise hides under the iOS status bar or notch). Top `calc(<base> + env(safe-area-inset-top))`, bottom `calc(<base> + env(safe-area-inset-bottom))`, plus `<meta name="viewport" content="...,viewport-fit=cover">`.
- Set `align-items: start` on a grid, not the default stretch (because a grid row stretches all cells to the tallest, so expanding one card drags its neighbour into a tall empty tile).
- Add `min-width:0` and `overflow-wrap:anywhere` to grid and flex track children, not the default (because they default to `min-width:auto` and a long unbreakable string like a URL blows out the track).
- Make a swipe-reveal action `opacity:0` at rest and show it only while dragging, not rely on the card covering it (because at rest it bleeds through every card). Keep the card opaque and on top, clip the row with `overflow:hidden`.
- Let labels wrap and give every tappable control a real >=44px hit area, not assume desktop width (because text clips on narrow cards and tap targets get too small).
- Center the remainder on a last grid row explicitly, not auto-fill (because auto-fill leaves a lone orphan card left-aligned).
- Bleed decorative art ~10% past the card with `inset:-10%` so its faded edges fall outside the rounded clip, not flush to `inset:0` (because art that fades or ends exactly at the border shows a hard seam, and any breathing scale or parallax drags the art's real edge into view at the corner).
- Give a card that paints full-bleed art its own opaque background layer beneath the art, not a translucent card fill (because wherever the art fades or the clip box cuts it, a see-through card lets the page background or fixed particles bleed through the gap).
- Lock a container to `100vh` or a fixed height only when its content is guaranteed to fit, not on a shared shell that taller views reuse (because a hard height with `overflow:hidden` silently clips a taller borrowed view and gives it no scroll). Gate the fixed height behind a class only the short layout sets.
- Write the desktop layout as the base rules and put phone-only changes inside `@media (max-width: ...)`, not the reverse (because editing a base rule to fix the phone silently changes desktop too, and the ask is usually mobile only). Keep `min-width` queries rare.
- Paint the `html` element the page background and set `overscroll-behavior-y:none`, not leave the document default (because rubber-band overscroll past the top or bottom on a phone otherwise exposes a bare white or black band behind the tile).
- On a hover or active state inside an `overflow:hidden` container, lift with a `box-shadow` glow, not `transform:translateY(-4px)` (because the upward translate pushes the card's top edge into the clip so it reads as cut off). Reserve the translate for elements whose parent does not clip.
- Browser support floor: target evergreen mobile Safari and Chrome, and prefer pre-mixed `rgba()` tokens over computed color. If you use `color-mix`, `:has`, `field-sizing`, or `dvh`, declare a plain fallback first (because an unsupported property silently drops, leaving the value unset). Follow the existing `dvh` model: write `max-height:94vh` then `max-height:94dvh` on the next line, so the plain value lands and the modern one upgrades it where supported.

## State and data

- Clamp every numeric input to a sane ceiling and warn on out-of-range, do not accept unbounded values (because a typo like "99999" silently corrupts a chart or max). For example weight <=1000, reps <=100.
- Clamp a selected or scrub index to `Math.min(sel, rows.length - 1)`, not leave it free (because the active index outlives a shrinking array and blanks the readout mid-interaction).
- Make committing an edit an explicit separate button, not tapping the row or pressing Enter (because that doubles as save and silently logs the value). Let people edit freely, save only when they mean to.
- Add an explicit neutral state and require real data for the positive state, do not let empty fall through to "on track" (because testing only the bad branch reads falsely positive on an empty state).
- Gate any "done today" badge on the entry's date equalling today, not a bare completion flag (because a flag with no date check shows stale success on a fresh day). Otherwise revert to neutral.
- Persist via the host bridge `Vitality.save` on each discrete action and fold unconfirmed local work back in additively on mount, not rely on in-flight async writes (because an installed or standalone page frozen on app-switch loses the last edits). `localStorage` is only a standalone fallback, wrapped in try/catch. Never delete what is already persisted.
- Stamp saved data with an owner id and wipe your keys before hydrating if a DIFFERENT owner is present, not trust that storage is yours (because `localStorage` survives sign-out and shows the previous person's data on a shared device). An ABSENT stamp means pre-existing own data: never wipe it. After a real owner-switch wipe, force one reload.
- Store cross-references by key and resolve the value live at render, do not duplicate the value into two places (because duplicates drift). Keep one source of truth.
- Make first render deterministic, then randomize on mount, not pick randomly during the initial paint (because a random value at first paint causes a hydration mismatch flash). Render index 0 first, shuffle after mount.
- Build the whole multi-field record in memory and write it once, not one storage write per field as it is filled (because a tab-away or crash between writes lands some fields and drops the rest, so the record reloads half-empty). Every logged thing in the tile, including a capstone or after-section (a closing note, a final mood tap, a cardio add-on), shares one persisted shape saved in the same write.
- Read each persisted field back from storage on mount and bind it, never re-seed a field from its placeholder, a random pick, or a hardcoded starter when saved data exists (because re-initializing from the default on return overwrites what the user logged). A default is only for a key that has never been written.
- Hold every save behind a "loaded" flag until the initial load resolves, or hydrate synchronously before wiring any save, not save freely from first paint (because the tile renders empty defaults before stored data arrives, and the first interaction then persists those empties over the real data).
- On delete, splice the item from the single source array, persist that array, and re-render from it in one path, not flip a UI state while leaving the stored record or the reverse (because the two diverge and the item shows stuck as logged and stops responding). One mutation, one write, one render off the same source.
- Persist and reopen the user's place too, not just the data: the active tab, the open day or item, any half-open editor (because dropping someone back at the default view after a refresh feels like the work was lost even when it was saved). Stamp the last view in storage and restore it on mount.
- Make a slider, scrubber, or dot-picker write its live value to the visible readout on every move, not only on release or a separate commit (because a control that does not update what it controls feels dead and the user assumes their input did not register).

## Text, color, and copy

- Style `::selection` and `::-moz-selection` to a mint wash, never leave OS blue (because the default blue highlight reads as a raw browser default).
- Set `caret-color` and `accent-color` to mint and kill the tap-highlight, not leave system defaults (because the iOS caret, grab-handles, and tap flash otherwise show system blue or grey).
- Set `body { user-select: none }` then opt inputs and a `.selectable` class back in, not leave selection global (because dragging a slider or double-tapping a label otherwise selects UI text as a blue block).
- Focus an input with `.focus()`, never `.select()` (because auto-selecting highlights the value as a blue block, and the caret line is the wanted state). Rejected twice by Alex.
- Use mint as the primary accent and azure as the secondary good and steady tone, not red or other hues (because the brand is dark night-sky with luminous mint glass). Mint `#6EE7B7`, glow `rgba(110,231,183,0.4)`.
- Reserve amber for one deliberate caution spot, do not sprinkle it (because reserving it makes it land, scattering kills the signal). Amber `#F59E0B`.
- Keep a near-black background and near-white text, not a lighter scheme (because the aesthetic is Apple Health darkness crossed with a niche magazine). `--bg: #000` (the host paints it, the tile body stays transparent), text `#e9efe9`, dim `rgba(233,239,233,0.62)`, faint meta `rgba(233,239,233,0.34)`.
- Make every text element earn its place, cut anything whose removal would not change understanding (because noise dilutes meaning).

```css
::selection { background: rgba(110, 231, 183, 0.25); }
::-moz-selection { background: rgba(110, 231, 183, 0.25); }
input, textarea, select, [contenteditable] { caret-color: #6EE7B7; }
body { accent-color: #6EE7B7; user-select: none; -webkit-user-select: none; }
* { -webkit-tap-highlight-color: transparent; }
input, textarea, select, [contenteditable], .selectable, .selectable * {
  user-select: text; -webkit-user-select: text;
}
```

## Sealed-tile isolation

- Keep everything inline in one file: no external libraries, no CDN, no React, no runtime fonts (because if it is not in the file, assume it will not load).
- Wrap all storage in try/catch with an in-memory fallback, never assume `localStorage` is writable or persistent (because a sealed iframe can throw or clear it).

## Numbers and units

- Round a value to its unit's valid increment, not to a whole number (because rounding 47.5kg to 48 invents a weight that cannot be loaded on the bar). Pick the real step per unit and snap with `Math.round(v/step)*step`: 0.5kg or 0.25 for plates, 0.1 for bodyweight, 5g for food, 15min for time.
- Show a recommended or last-used number as the field's placeholder, not as prefilled content the user must delete (because prefilled text saves verbatim as a choice the user never confirmed, and forces them to clear a literal "0" or stale value before typing). An empty field with a faint suggested value reads as a hint, a filled field reads as committed data.
- Compute a recommended or auto-tuned default from the latest data at the moment the control opens, not from a value captured earlier (because a default frozen at an old reading shows a stale number after the user already logged something fresher today). Read current state on open, never a cached snapshot.
- Grow a numeric input's or slider's ceiling when a real entry exceeds it, do not hard-block at a fixed max (because a legitimate large value gets silently clamped down and logged wrong). Still reject typos far past any plausible value, but for a value just over the range raise the max to fit it.

## Inputs and forms

- Set a numeric field's `step`, `inputmode`, and stepper buttons to the increment people actually enter for that quantity, not a generic step of 1 (because a 1-unit stepper on a half-kg weight or a quarter-hour time forces many taps and tempts invalid in-between values).
- Offer reset-to-recommended as its own small labelled control, never by tapping the value again (because tapping the same target to both edit and reset makes one misfire silently wipe a deliberate edit). Keep edit and reset as separate visible affordances.
- Let the user pick from a searched list of real options rather than auto-filling one guessed default when the field has a known set of valid choices (because a single pre-chosen value commits as the user's pick and a wrong guess is worse than no guess). Show results only as they type, starting from nothing selected.
- Auto-grow a multi-line text field to fit its content instead of a fixed small box with an inner scrollbar (because a tiny scrolling box hides what was written and walls off longer notes). Set `rows` to 1 and on input set `height` to `scrollHeight`, or use an expanding `min-height`.

## Honesty of state and earned affordances

- Show a success, done, or earned affordance (a check, a star, a completed style) only after the user actually completes the action, not on render or on a partial step like opening an editor or tuning a value (because a check that appears before submit, or a star the user did not earn, trains the user to read every mark as meaningless). Bind the affordance to the committed event.
- Label only what the tile can actually determine from real data, and show a neutral label otherwise, not a confident guess (because asserting a label the tile cannot actually derive, calling a day "on track", a habit "done", or a workout "push", reads as broken the instant it is wrong). If the data does not say it, do not name it.
- Award an automatic badge from the data and let the user clear it, with one plain line of what it means and what clearing it does, not appear or vanish in silence (because a mark that changes for no visible reason erodes trust in every mark). For example a streak flame only after the day is truly logged, or a progress star only after every target in the series was met.
- Keep mutually-exclusive modes (a normal mode and a special one like deload, off, or demo) visibly marked and stored under their own keys, and never let the special mode mutate the normal baseline, not share one record (because shared storage lets the two collide and a low-effort or demo mode silently corrupts the real history). Mark the active mode at the top of the view.
- Start a single-choice selector with no option active and keep dependent steps inactive until the user picks one, not with a default already highlighted (because a pre-highlighted default commits as a real choice the user never made, so a recommended pick silently becomes the wrong one downstream).
- Recompute and show a day's summary and any derived score from its stored entries every time that day is opened, today or in history, not an empty "nothing logged" state when entries exist (because blank over real saved data reads as data loss).

## Overlays, errors, and escape

- When an overlay opens, save and set `document.body.style.overflow = 'hidden'` and restore the saved previous value on close, not leave the body scrollable (because the blurred background otherwise scrolls under the open card, and restoring to `''` would unlock a parent overlay too early). Capture `const prev = body.style.overflow`, set hidden, restore `prev` in cleanup.
- Render an overlay as a direct child of `body` with `position:fixed; inset:0`, not nested inside a scrolled or transformed ancestor (because a transformed ancestor breaks fixed positioning so the card renders stuck at the bottom of the page). Portal it out, then center or bottom-anchor with flex.
- Cap an overlay panel at `max-height:94dvh` with a `94vh` fallback and `overflow-y:auto` so it scrolls inside itself, not let its content run past the viewport (because a tall panel pushes its lower content off-screen on a phone, and `100vh` alone exceeds the visible area under mobile browser chrome). Write `max-height:94vh` then `max-height:94dvh` on the next line.
- Pin an overlay's primary action as a `position:sticky; bottom:0` footer with `padding-bottom:calc(16px + env(safe-area-inset-bottom))`, not at the natural end of a scrolling panel (because on a short screen the one button the user came for scrolls below the fold and clips under the home indicator).
- Make any full-screen loading or scrim overlay self-clearing: clear it on both success and failure, give it a tap-to-dismiss, and time it out after a few seconds to an error-with-retry, never a latch only an unguaranteed callback can lift (because if the resolving event never fires the scrim covers the whole tile and eats every tap underneath, so the tile looks frozen though it is alive).
- Give every error and empty state a visible way out: a back, a retry, or a dismiss that returns to the working view, not a dead-end message (because an "error occurred" screen with no control strands the user with no path back into the tile).
- When async data resolves to empty, swap an explicit empty state into the same frame, do not unmount the screen you just showed (because content that mounts, paints, then vanishes reads as the tile breaking). Keep the frame and show a calm "nothing here yet".

## Charts and series

- Pad the y-axis with rounded "nice" bounds above and below the data so a steady or low series sits mid-card, not an axis floored at zero (because a flat low line pinned to the baseline reads as the metric failing rather than holding steady).
- Render a chart of zero or one point as its own quiet empty or single-dot state with a "log more and your line starts here" hint, not a blank box or a line collapsed onto the floor (because an empty plot looks broken instead of new).

## What the linter enforces as a hard error (a tile that trips one does not ship)

These are the `error` findings in `mcp/src/tiles/lintTile.ts`, run on the final HTML. A tile with any of them is not Vitality-grade and is rejected. Each rule below names the check that catches it.

### Sealed and self-contained
- Ship one `<!doctype html>` document with inline `<style>` and `<script>`, not a fragment or a page that pulls in a stylesheet (because a tile is a sealed file, if it is not in the file assume it will not load). Enforced by `doc-structure`.
- Never point a `<script src>` at anything, inline all JavaScript instead (because a CDN or external file is code the seal cannot audit). Enforced by `sealed-external-script`.
- Never `import(...)` or `from "..."` a remote URL, including a protocol-relative `//host` one, inline every module (because `import("//esm.sh/x")` slips a naive `https?:` check). Enforced by `sealed-external-script`.
- Never build a script at runtime with `createElement('script')` or `document.write(...)`, inline all code (because injected script is unauditable). Fetching DATA with `fetch`/XHR is allowed, that is the deliberate bring-your-own-key capability. Enforced by `sealed-dynamic-script`.
- The only external `<link href>` allowed is `fonts.googleapis.com` or `fonts.gstatic.com`, no other external CSS or asset (because those are the DNA's prescribed webfonts, everything else must be inline). Enforced by `sealed-external-resource`.
- Never `@import` a remote URL in CSS, inline all styles (same seal, CSS side). Enforced by `sealed-external-resource`.
- No React, Vue, or Angular reference (`ReactDOM`, `React.x`, `from "react"`, `Vue.x`, `createApp`, `angular`), use plain DOM APIs only (because tiles are vanilla JS). Enforced by `sealed-framework`.

### No inline handlers, no injection breakout
- Wire every event handler with `addEventListener` in the one audited `<script>`, never an inline `on*` attribute (`onclick=`, `onerror=`, `onload=`, and the rest) in the markup (because an unescaped value landing in an `on*` attribute runs arbitrary JS, and handlers scattered through markup dodge the audit). The scaffolder wires everything with `addEventListener`, so no legit tile has one. Enforced by `inline-event-handler`.
- Escape any free text (a goal, a name, a label) before it touches HTML or a script, never interpolate it raw (because a stray `</script>` or a broken-out tag from user text is the injection tell). A `</script>` before its opener, or an unclosed `<script>`, is a hard error. Enforced by `script-stray-close` and `script-unbalanced`. In the templates this is what `htmlEscape` (five replacements: `& < > " '`) and `jsString` (`<` becomes the escaped form so a value cannot terminate the inline element) exist for, see `mcp/src/tiles/templates.ts`.

### Date safety
- Build date keys from local getters, never `toISOString().slice(...)` or `.split(...)` or `.substr/.substring(...)` (because a UTC key drifts a day). Enforced by `date-utc-drift`. The template core uses `key(d)=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())`.

### Motion (the never-janky law, enforced)
- Never animate a layout or paint property in `@keyframes`, animate only `transform` and `opacity` (because layout props re-flow every frame and drop below 60fps on a phone). The banned set is exactly: `width height top left right bottom margin padding box-shadow backdrop-filter inset gap font-size line-height flex-basis aspect-ratio block-size inline-size min/max-width min/max-height grid-template-columns grid-template-rows`. Enforced by `motion-keyframe-layout`.
- Never animate `filter: blur()` in `@keyframes`, blur a layer once then animate its opacity (because re-blurring re-rasterizes the layer every frame). Note `filter:brightness`/`drop-shadow` are fine, only `blur` is the trap. Enforced by `motion-keyframe-blur`.
- Do not `transition` a layout property or `all`, transition `transform` and `opacity` only (this one is a warning, not a hard error, but fix it). Enforced by `motion-transition-layout`.

### Text hygiene (copy law, enforced)
- No emoji or decorative unicode pictograph anywhere, draw glyphs as inline SVG (because emoji render inconsistently and read as unpolished). The scan covers emoji, symbols, dingbats, arrows, stars, and flag letters. Enforced by `no-emoji`.
- No em dash or en dash anywhere, use a comma, period, or colon (because dashes read as machine-written). Applies to copy, headings, demo text, and visible code comments. Enforced by `no-em-dash`.
- No unicode checkmark or cross (checkmark, heavy-check, ballot-x, cross-mark, and kin), draw the mark as inline SVG (same reason as emoji). A plain `->` arrow glyph is fine. Enforced by `no-unicode-check`.

## What the linter flags as a quality warning (fix these, a clean tile is 0 errors AND 0 warnings)

The worked examples (`exampleMentor.test.ts`, `exampleRecipe.test.ts`) assert the gold tiles are `0 errors, 0 warnings`, so treat every warning as a defect too.

- Wrap every `localStorage` access in a `try/catch` with an in-memory fallback, not a bare call (because a sealed iframe can throw or be cleared). Enforced by `storage-unwrapped`.
- Keep `body { background: transparent }` (or `none`, or an alpha-0 rgba), never an opaque fill (because the host paints the black page and the tile body stays see-through). Enforced by `body-not-transparent`.
- Use the mint accent `#6EE7B7` or `var(--mint...)` somewhere, or the tile reads off-brand. Enforced by `brand-mint-missing`.
- Add a `::selection` rule (a mint wash), never leave the OS blue highlight. Enforced by `selection-style-missing`.
- If the tile animates at all, add a `prefers-reduced-motion` block that disables it. Enforced by `reduced-motion-missing`.
- Focus an input with `.focus()`, never `.select()` (because `.select()` highlights the value as a blue block). Enforced by `select-not-focus`.

## The Vitality host bridge (the only channel out of the sealed iframe)

- Speak to the host through `Vitality.save` / `Vitality.load` (the tile's OWN private data) and `Vitality.report(stream)` (ONE life-stream into Vee), a tile with no bridge call persists nothing and lands nothing on the dashboard. At least one of `Vitality.save/load/report` must appear. Enforced by `bridge-missing` (warning). The bridge posts to `parent` via `postMessage`, see the `BRIDGE` const in `templates.ts`.
- Report is the DEFAULT for a measurable tile, not an optional extra. A tile of a measurable kind (`intake count duration rating measure money`, and `done`, which reports value 1 on the day it is marked) MUST emit one contract-valid `Vitality.report(...)` or it feeds Vee's cross-reference engine nothing, that is the whole point of the tile. Every one of the six templates already injects one report() in its commit path by default (see the `reportLine` helper in `templates.ts`). A measurable tile that emits NO report is refused at the envelope by `assertTileExportable` (error `report-missing`), which is the one place the tile's `kind` is known; `buildUploadEnvelope` and the hand-built `addTile` path both pass it. The only tiles that may legitimately report zero streams are non-metric note/mentor tiles that carry no reporting kind at all (the mentor example asserts exactly zero report calls).
- Report AT MOST ONE stream, one `Vitality.report(...)` call per tile (because a tile owns a single life-number). Enforced by `report-multiple` (warning, on two or more calls).
- Shape the report as `{key, label, value, date, kind}` (goalDirection optional), every one of `key value date kind` must be present (because the noticed engine reads a fixed shape). A `report()` call present but MISSING a required field is now a hard-floor `report-shape` **ERROR** (a broken stream lands nothing and silently poisons priors, worse than none), and a `kind:` literal outside the taxonomy is a `report-kind-invalid` **ERROR**. The dashboard-side `validateReport` (mirrored in `mcp/src/tiles/reportContract.ts`) additionally rejects: `key` over 64 chars, `label` over 120 chars, a non-finite `value` or `abs(value) > 1e9`, a `date` not matching `YYYY-MM-DD`, a `kind` outside the fixed taxonomy `intake count duration rating measure money done`, and a `goalDirection` that is not `up`/`down`/`neutral`.
- Report only a REAL value, never a fabricated zero on an empty tile (because a fake stream pollutes the user's priors). Every kind reports its true today-number and only once data exists.

## The richness floor (a sealed, safe tile can still be too thin, this gate proves it earns a slot)

`mcp/src/tiles/richness.ts` checks seven structural marks, ALL must be present. A bare counter passes the linter but fails here.

- Actually LOAD Instrument Serif via the `fonts.googleapis.com/css2?family=...Instrument+Serif...` link, do not merely name it in a `font-family` stack (because unloaded, every serif title silently falls to Georgia and the tile stops looking like Vitality). Mark `signature-fonts`.
- Give the tile a serif hero NUMBER as its star, an element with `class="bignum"`, not a lone label (because the huge serif number is the Fuel-grade signature). Mark `serif-hero-number`.
- Include a header eyebrow row (`class="eyebrow"`, the `01` serif number plus a mono label). Mark `header-eyebrow`.
- Include a status pill (`class="pill"`) so state reads honestly as idle, good, or caution. Mark `status-pill`.
- Include at least one real section below the hero, an element with `class="section"` wrapping `id="section"`, not just a number and two buttons. Mark `real-section`.
- Put a signature visual in that section: a 7-day chart, a trend line, or a habit grid (`class="bars|grid|spark|ratingrow"` or a `drawBars/drawSpark/drawGrid/drawWeek` function). Mark `signature-visual`.
- Ship an honest empty or idle state that invites the first entry, using a real phrase the gate recognizes ("nothing yet", "not yet", "no days logged", "no check-ins", or "starts here"). Mark `honest-empty-state`.

## Unit correctness (deterministic in `mcp/src/tiles/infer.ts`, never label a value with its own subject)

The builder must never print "2 waters" or "0.2 weights". `inferUnit` resolves a real unit per kind.

- A fluid or uncountable intake gets a serving noun, never the substance's plural: water and juice and milk and wine become "glasses", coffee and tea become "cups", soda becomes "cans", generic alcohol and cocktails become "drinks". From `FLUID_UNITS`.
- A dose-style intake gets mass or energy: calories become "kcal", caffeine becomes "mg", sugar and salt and carbs and fibre become "g". From `DOSE_UNITS`.
- A physical measure gets a unit that FLIPS with the user's `unitSystem` (metric default): weight is kg or lb, height and circumferences are cm or in, distance is km or mi, temperature is degC or degF, body fat is `%`, blood pressure is mmHg, heart rate is bpm. From `MEASURE_UNITS`. An unrecognized measure gets a BLANK unit (honest), never an invented "vo2maxs".
- A money tile prints the user's currency symbol from their profile, never a hardcoded `$`, resolve it via `currencySymbol(currency)`: known ISO codes map to `$ £ € ¥ ₹ ₩ R$` and friends, and an unknown code falls back to printing the code itself plus a space ("CHF 12"), which is always honest. From `CURRENCY_SYMBOLS`.
- A genuinely countable subject (cold plunges, reps, cigarettes) is left to read as a plural of the key, that is correct. From the `key.endsWith('s')` fallback.
- A stable KEY is singularized so ten "cold plunges" tiles and ten "cold plunge" tiles share one key (`deriveKey`/`singularize`), while the LABEL stays human. Do not fight this, let infer own key and label.

## Color law (azure and mint good, amber caution, never red), enforced by discipline not the linter

- Mint `#6EE7B7` is the brand and the good/on-track color, azure `#5E9BFF` is the one data or reading accent used sparingly (Vitals-style), amber `#F59E0B` is the single caution spot, never red for a state (because red reads as shame and alarm). Red only for a genuinely destructive, confirm-first action, which a tile almost never has. `--red` exists in globals but is retired, do not inline it.
- Carry meaning on the word plus a small dot or glyph, never on color alone (colorblind-safe): a caution pill says the word, shows an amber dot, and uses an amber glyph.
- Reserve amber for ONE deliberate caution spot per tile, do not sprinkle it (because scattering kills the signal). Greys are always white at an opacity (`rgba(255,255,255,a)`), never a solid grey hex. Iris `#a78bfa` is Vee-only, never on a general tile.
