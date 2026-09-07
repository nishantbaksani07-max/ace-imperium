# Lessons from Vitality docs: conventions and traps for a tile

A tile is ONE sealed HTML file: no libraries, no React, no build step. Everything inline:
HTML, CSS, vanilla JS, inline SVG. These rules are mined from the Vitality codebase
(SKILL.md, globals.css, the date helpers, and shipped patch notes). Each is "Rule: why."

## Dates and day boundaries

- **Rule: build date keys from local parts, never from `toISOString().slice(0,10)`.** Because
  `toISOString()` is UTC, so a user east of UTC sees a log jump to "tomorrow" after their
  evening, and a user west sees it stuck on "yesterday." This is the single most-repeated bug.
  Use:
  ```js
  function dayKey(d = new Date()) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  ```

- **Rule: if "the day" should not flip at midnight, subtract the rollover hour first.** Because
  people log late-night events as part of the day they just finished. Vitality uses two
  documented boundaries: supplements roll at 6am ("last night's dose"), food/macros roll at
  4am ("the 2am snack counts toward yesterday"). Pick what fits the tile, then:
  ```js
  function dayKeyRollover(hour, d = new Date()) {
    const x = new Date(d.getTime() - hour * 3600 * 1000); // shift back, then read local parts
    return x.getFullYear() + '-' +
      String(x.getMonth() + 1).padStart(2, '0') + '-' +
      String(x.getDate()).padStart(2, '0');
  }
  ```
  Default (no late-night meaning) = plain midnight `dayKey`.

- **Rule: re-derive the active day on a ~60s timer, do not compute it once on load.** Because a
  tile left open across midnight (or the rollover hour) would keep writing to the stale day.
  A 1-minute tick that recomputes the key handles the rollover live.

- **Rule: for "last N days" math, step with noon-UTC dates, not by adding 86400000 ms.** Because
  DST days are 23 or 25 hours, so millisecond stepping drifts a day twice a year. Build each
  key from `new Date(Date.UTC(y, m-1, d - i, 12))` and read its UTC parts back.

## Text selection and caret (no OS blue, ever)

- **Rule: style `::selection` (and `::-moz-selection`) to a mint wash, never leave OS blue.**
  Because the default blue highlight reads as a raw browser default and breaks the polished look.
  ```css
  ::selection { background: rgba(110, 231, 183, 0.25); }
  ::-moz-selection { background: rgba(110, 231, 183, 0.25); }
  ```

- **Rule: set `caret-color` and `accent-color` to mint; kill the tap-highlight.** Because the iOS
  caret, selection grab-handles, and tap flash otherwise show system blue/grey.
  ```css
  input, textarea, select, [contenteditable] { caret-color: #6EE7B7; }
  body { accent-color: #6EE7B7; }
  * { -webkit-tap-highlight-color: transparent; }
  ```

- **Rule: `body { user-select: none }`, then opt inputs (and a `.selectable` class) back in.**
  Because dragging a slider or double-tapping a label otherwise selects UI text as a blue block.
  ```css
  body { user-select: none; -webkit-user-select: none; }
  input, textarea, select, [contenteditable], .selectable, .selectable * {
    user-select: text; -webkit-user-select: text;
  }
  ```

- **Rule: focus an input with `.focus()`, never `.select()`.** Because auto-selecting highlights
  the value as a blue block; the caret line is the wanted state. (Rejected twice by Alex.)

## Motion and phone performance

- **Rule: never animate or drag the `transform` of an element that has `backdrop-filter: blur`.**
  Because the phone GPU re-rasterizes the blur of everything behind it every frame: smooth on a
  laptop, badly laggy on a phone. This caused recurring "works in the demo, lags on my phone."

- **Rule: if a glass element must move, kill its blur for the duration of the motion.** Because a
  plain composited translate is cheap; the blur returns at rest with no visible cost.
  ```css
  .glass.is-dragging {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    will-change: transform;
  }
  ```

- **Rule: every animation must degrade under `prefers-reduced-motion: reduce`.** Because some
  users get motion sick or have it off by policy; entrances should land instantly-visible, and
  decorative loops (rings, sparks, drifting particles, marquees) should freeze or hide.
  ```css
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
    .ring, .spark, .particles { display: none; }
  }
  ```

- **Rule: drive cursor parallax by writing `el.style.transform` directly, not via per-frame state.**
  Because re-rendering on every mouse move thrashes; reading the cursor offset and mutating the
  transform on the element is smooth and free. Reset to `translate3d(0,0,0)` on pointer-leave.
  Keep movement subtle (~8px max) and set the art layer `inset: -10%` so edges never reveal.

## Icons, emoji, and copy

- **Rule: never put emoji or unicode checkmarks in the UI; draw glyphs as inline SVG.** Because
  emoji render inconsistently across platforms and read as unpolished. A check is an inline
  `<svg><path d="..."/></svg>`; the plain arrow `->` glyph is acceptable for "go" affordances.

- **Rule: no em dashes anywhere in copy.** Because they read as machine-written. Use periods,
  commas, and colons. Em dashes for emphasis only, sparingly, never as the primary device.

- **Rule: every text element must earn its place.** Because noise dilutes meaning: if deleting a
  label would not change what the user understands, cut it.

## Color law

- **Rule: mint is the primary accent; azure is the secondary "good/steady" tone.** Because the
  brand is dark night-sky with luminous mint glass. Mint token: `#6EE7B7` (glow
  `rgba(110, 231, 183, 0.4)`). Use mint liberally, azure for calm positive signals.

- **Rule: amber means caution, and it is rare on purpose.** Because reserving amber for one
  deliberate spot makes it land; sprinkling it everywhere kills the signal. Amber `#F59E0B`.

- **Rule: never use red for a non-destructive state.** Because red is shame and alarm; an
  off-target or behind-pace state must be warm (amber at most), never red, and should offer a
  gentle one-tap out, not a scolding. Red is allowed only for genuinely destructive actions
  (delete) that confirm first.

- **Rule: background is near-black, text is near-white.** Because the aesthetic is Apple Health
  darkness crossed with a niche magazine. `--bg: #04060a` (editorial) or `#000` (app),
  text `#e9efe9`, dim body `rgba(233,239,233,0.62)`, faint meta `rgba(233,239,233,0.34)`.

## Persistence and state

- **Rule: save continuously on each interaction, not at an end-of-session "submit."** Because a
  closed tab or refresh must never lose data; persist every meaningful tap immediately.

- **Rule: store cross-references by key, resolve the value live at render.** Because duplicating a
  value into two places lets them drift; keep one source of truth and look it up when drawing.

- **Rule: first render must be deterministic, then randomize on mount.** Because a value picked
  randomly during the initial paint causes a hydration mismatch flash; render index 0 first,
  shuffle after the element mounts.
