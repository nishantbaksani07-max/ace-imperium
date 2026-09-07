# Gotchas (top rules)

The 20 highest-leverage rules, distilled from the full `gotchas` section. These cover
the common tile. For overlays, charts, forms, inputs, honesty-of-state, or anything
richer, read the full `{section:"gotchas"}`. Every rule reads "do X, not Y (because Z)."
A tile is ONE sealed HTML file: inline all HTML, CSS, vanilla JS, SVG. No CDN, no
libraries, no React, no runtime fonts.

## The non-negotiables
1. Build date keys from local getters (`getFullYear/getMonth/getDate`, zero-padded, `YYYY-MM-DD`), never `toISOString().slice(0,10)` (because UTC drift jumps the day). Re-derive the active day on a ~60s timer so a tile open across midnight writes the right day.
2. Animate only `transform` and `opacity`, never `width height top left right bottom margin padding box-shadow filter:blur` in a keyframe or transition (because layout/paint props drop below 60fps on a phone). A width becomes `scaleX`, a position becomes `translate`, a glow becomes `opacity` on a pre-blurred layer.
3. Never move a `backdrop-filter: blur` element by animating its transform, kill the blur for the motion's duration instead (because the phone GPU re-rasterizes every frame: smooth on laptop, badly laggy on phone).
4. Use mint `#6EE7B7` or azure `#5E9BFF` for good/on-track, amber `#F59E0B` for caution, never red for a non-destructive state (because red reads as shame). Carry meaning on a word plus a dot or glyph, never color alone.
5. Draw glyphs as inline SVG, never emoji, unicode checkmarks, or dingbats (because emoji render inconsistently and read as unpolished). A plain `->` arrow is fine.
6. No em dashes or en dashes anywhere in copy, code comments, or demo text. Use periods, commas, colons (because dashes read as machine-written).
7. Wrap every `localStorage` read and write in try/catch with an in-memory fallback (because a sealed iframe can throw or be cleared, and storage failure must never crash the tile).
8. Save continuously on each interaction, not at an end-of-session submit (because a closed tab must never lose data). Hold saves behind a "loaded" flag until the initial hydrate resolves, or the first paint's empty defaults overwrite real data.
9. Default the resting state to `opacity:1` with `animation-fill-mode: both`, never depend on the entrance animation to reveal (because a dropped animation on an `opacity:0` base renders the tile invisible).
10. Confirm before any destructive action, prefer soft-delete or undo (because a hard delete with no path back loses real work).

## Motion done right
11. Put the entrance animation on a wrapper and keep the moving element's transform free (because a finished `animation: ... forwards` pins the transform and overrides your inline translate). Put an entrance `scale`/`translate` on an INNER wrapper, never on the rounded `overflow:hidden` box that clips full-bleed art.
12. Honor `prefers-reduced-motion: reduce` by killing transitions and freezing decorative loops, scoped to your real selectors, not a bare `*`.
13. Reserve room for the largest value an animated number will reach and use `tabular-nums` (because a count-up from 1 to 3 digits widens each frame and an `overflow:hidden` container clips the widest frames).

## Layout and phone
14. Add safe-area insets to top and bottom padding under `viewport-fit=cover`: `calc(<base> + env(safe-area-inset-top))` / `...-bottom`, or the title hides under the notch.
15. Paint `html` the page background and set `overscroll-behavior-y:none` (because rubber-band overscroll otherwise exposes a bare band behind the tile). Keep `body { background: transparent }` so the host's black page shows through.
16. Add `min-width:0` and `overflow-wrap:anywhere` to grid/flex children (because they default to `min-width:auto` and a long unbreakable string blows out the track). Give every tappable control a real >=44px hit area.
17. Bleed decorative art `inset:-10%` past the card so its faded edges fall outside the rounded clip, never flush to `inset:0` (because art ending at the border shows a hard seam). On a hover/active state inside an `overflow:hidden` box, lift with a `box-shadow` glow, not `translateY(-4px)` (the translate pushes the top edge into the clip).

## Honesty of state
18. Show a success/done/earned mark only after the user actually completes the action, never on render or on opening an editor (because a mark that appears before the deed trains the user to ignore every mark). Gate any "done today" badge on the entry's date equalling today.
19. Add an explicit neutral state and require real data for the positive state, never let empty fall through to "on track" (because that reads falsely positive on an empty tile). Label only what the data actually says.

## The bridge and report (the whole point)
20. Speak to the host through `Vitality.save`/`Vitality.load` (the tile's private data) and exactly ONE `Vitality.report({key,label,value,date,kind})` (the single life-number into Vee). Every measurable kind (`intake count duration rating measure money done`) MUST emit one contract-valid report of its REAL today-value, once data exists, never a fabricated zero. `key value date kind` are all required, `kind` must be in the taxonomy, `date` must be `YYYY-MM-DD`. A missing or malformed field is a hard-floor error.

For the hard-error linter rules, the richness floor's seven marks, unit correctness, and
the full color law, `check_tile` enforces them all on the finished HTML, so build, then
run `check_tile`, then fix to green. For the reasoning behind any rule above, or the
overlay/chart/form/input rules not listed here, read `{section:"gotchas"}`.
