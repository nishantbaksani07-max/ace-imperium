# Bugs already killed

Two months of hard-won fixes from the Vitality repo, distilled for sealed single-file HTML tiles. Each line: Symptom -> the rule. If you build a tile, do not re-discover these.

## Animation and motion

- Element never moves despite an inline `transform` -> a finished `animation: ... forwards` on the SAME element pins its transform and overrides your inline `translateX`. Put the entrance animation on a wrapper, keep the moving element's `transform` free.
- Card top "acts up" / re-rasterizes every scroll frame -> a lingering transform on a rounded `overflow:hidden` box re-rasters its edge on scroll. Use `animation-fill-mode: backwards` (not `forwards`) so it settles to `transform: none`.
- Card renders invisible (space reserved, nothing shown) -> you based the resting state on `opacity:0` plus an animation, and the animation got dropped (e.g. an unresolved `calc()` in the delay killed the whole shorthand). Default to `opacity:1` with `animation-fill-mode: both`; never depend on the animation to reveal.
- Stagger delay silently breaks -> `calc(.5s + var(--i)*.08s)` fails if the var is unset and drops the entire `animation` shorthand. Compute the per-item delay as a concrete value (inline `style`) instead of a `calc()` over a custom property.
- Glyph / state swap "strobes" or chops -> a hard binary opacity cut between states reads as a flash. Cross-fade through near-zero: dim to ~0, swap the content at the trough, ease back up (smoothstep). Mixing an eased path with a strobing path looks worst.
- Looping mark appears mid-cycle or restarts halfway -> the loop was read off a global wall clock. Anchor loop time to the phase start (elapsed since the segment began), so it always plays start -> finish.
- Reveal "blinks" right after it finishes -> a settle fade re-fades the whole list from invisible. Keep the real content mounted throughout; only unmount the items that actually leave. One animation into the resting state, no second fade.
- Heavy one-time init stutters the intro (canvas/WebGL/shader compile, big parse) -> that long main-thread task lands mid-cascade and stalls frames. Show a cheap placeholder during the entrance, mount the expensive thing only after the cascade settles (~900ms), then fade it in.

## Mobile and performance

- Drag / swipe lags hard on phone, fine on desktop -> dragging an element with `backdrop-filter: blur()` forces the GPU to re-rasterize everything behind it every frame. Drop the blur during the drag (`backdrop-filter:none !important`) and add `will-change:transform`; the glass look survives on gradient + border + shadow.
- Dragged element trails the finger -> you routed the live transform through state (a re-render per pointermove) and/or a transition. Write `el.style.transform = 'translateX(' + x + 'px)'` straight to the DOM node with `transition:none` for 1:1 tracking; let state own only the active/committed toggle.
- Fast flick "teleports" with no slide -> iOS emits only a couple of coarse pointermove events on a flick, so `transition:none` renders as jumps. Use a short transform transition (~80ms) WHILE dragging so coarse moves glide; switch to a longer ease for the commit/spring-back glide.
- Gesture commit navigates / fires on the same frame as the move -> nothing animates. Play the commit glide (~200ms) to completion, THEN run the action.
- `prefers-reduced-motion` rule does nothing or errors -> keep it but scope it to your real selectors (`.page, .card, .chip`), not a bare `*` when nested. Always honor reduced motion by killing transitions.

## Layout and CSS

- Title / back button hides under the iOS status bar or notch -> with `viewport-fit=cover` you must add the inset. Top padding = `calc(<base> + env(safe-area-inset-top))`; bottom = `calc(<base> + env(safe-area-inset-bottom))`. Set `<meta name="viewport" content="...,viewport-fit=cover">`.
- Expanding one grid card stretches its neighbour into a tall empty tile -> a grid row stretches all cells to the tallest. Set `align-items: start` on the grid so a growing card never drags its sibling.
- A long unbreakable string (code, URL) blows out grid/flex tracks -> grid and flex children default to `min-width:auto` and refuse to shrink. Add `min-width:0` (and `overflow-wrap:anywhere`) to the track child.
- A swipe "reveal" action bleeds through every card at rest -> you relied on the card covering it. Make the reveal `opacity:0` at rest, show it only while actively dragging; keep the card opaque and on top; clip the row with `overflow:hidden`.
- Text clips on narrow cards / tap target too small -> never assume desktop width. Let labels wrap, and give every tappable control a real >=44px hit area.
- A lone card sits off-center on its last grid row -> center the remainder explicitly; auto-fill leaves orphans left-aligned.

## State and data

- A typo like "99999" silently corrupts a chart / PR / max -> no field is unbounded. Clamp every numeric input to a sane ceiling (e.g. weight <=1000, reps <=100) and warn on out-of-range instead of accepting it.
- Scrub / selected index blanks the readout mid-interaction -> the active index outlived a shrinking array. Always clamp the index to `Math.min(sel, rows.length - 1)`.
- Editing a value silently commits / logs it -> tapping the row or pressing Enter doubled as "save". Make committing an explicit, separate button; let people edit freely and save only when they mean to.
- Status reads falsely positive on an empty state -> you only tested the bad branch, so "nothing yet" fell through to "on track". Add an explicit neutral state; the positive state must require real data.
- A "done" check lingers across days -> a completion flag with no date check shows stale success on a fresh day. Gate any "done today" badge on the entry's date equalling today; otherwise revert to the neutral state.
- Last edits lost when an installed/standalone page is frozen or reloaded on app-switch -> in-flight async writes never landed. Synchronously write-through to `localStorage` on every change; on mount, fold any unconfirmed local work back in (additive only, never delete what is already persisted).
- Shared device shows the previous person's data -> `localStorage` survives sign-out. Stamp saved data with an owner id; on load, if a DIFFERENT owner is present, wipe your keys before hydrating. An ABSENT stamp means pre-existing own data: never wipe it. After a real owner-switch wipe, force one reload so a component cannot re-persist the old state.
- Destructive action runs with no undo path -> a hard delete with no confirm loses real work. Confirm before any destructive action; prefer soft-delete / undo.

## Dates and time

- A reading shows yesterday's (or tomorrow's) date -> you derived the day in UTC. Build local date keys with local getters (`getFullYear/getMonth/getDate` zero-padded), never `toISOString().split('T')[0]` (UTC drift). Format all keys `YYYY-MM-DD`.
- Two views of "the same day" disagree between midnight and ~4am -> they used different day-rollover rules (midnight vs a 4am cutoff). Pick ONE rollover per concept and use the same key for the write, the cache, and the read; do not mix.
- A timestamp lands on the wrong calendar day for users in other timezones -> server-local time is not the user's day. Date each record by the user's own offset (carry the offset with the data), falling back to local with no regression.

## Sealed-tile and isolation

- Color law (non-destructive states): mint or azure = good/on-track, amber = caution, never red unless it is a genuine destructive action.
- No em dashes, no emoji, no unicode checkmarks in any user-facing string. Render a check as inline SVG; the plain `->` arrow glyph is fine.
- A tile is one sealed file: no external libraries, no CDN, no React, no fonts fetched at runtime. Inline all HTML, CSS, vanilla JS, and SVG. If it is not in the file, assume it will not load.
- Do not assume `localStorage` is writable or persistent -> in a sandboxed/sealed iframe it can throw or be cleared. Wrap reads/writes in try/catch, fall back to in-memory, and never let a storage failure crash the tile.
- Selection highlight looks wrong / OS-blue -> set a brand `::selection` color; do not call `.select()` on focus.
- Verify motion and scroll on an actual touch device or emulated touch, not just desktop -> nearly every jank bug above only showed on a phone.
