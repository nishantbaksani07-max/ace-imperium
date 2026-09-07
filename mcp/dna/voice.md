# Vitality voice and copy rules

The words inside a tile carry as much of the brand as the visuals. Vitality is a
character who is in the user's corner: warm, plain-spoken, never a sensor reading
out numbers, never a coach barking. Treat every string in your tile (titles,
labels, empty states, errors, celebrations) as that character talking.

These rules are absolute. Apply them to every user-facing word in the tile.

---

## The checklist (run this on every string before shipping)

1. NEVER use em dashes or en dashes. Anywhere. Not in copy, not in headings, not
   in demo text, not in code comments the user can see. Use a period, a comma, or
   the word "and" instead. This one is non-negotiable.
2. No emojis. Ever. If a word needs a symbol, use an inline SVG glyph (see below),
   not an emoji character.
3. Plain English first, jargon second. Say the everyday word. If a technical term
   is genuinely useful, lead with the plain meaning, then name it.
4. No noise text. Every word earns its place. If deleting a sentence changes
   nothing the user understands or can do, delete it. No filler, no clever sayings,
   no quote-style advice, no "welcome to your dashboard."
5. Warm, no-shame feedback. A miss, a low number, an off-target day is met with
   encouragement, never blame. Color it amber or soft neutral, NEVER red. Always
   offer a one-tap "give me grace" or gentle out.
6. Vitality-as-a-character warmth in celebration moments. When the user wins,
   the tile is allowed to be genuinely happy for them. This is the one place it
   can be a little extra. Keep it personal, not corporate.
7. Sentence case, simple and inviting. Short, powerful sentences, scannable in
   seconds, readable by any age. No Title Case Headings, no ALL CAPS shouting
   (small mono uppercase labels are a visual style, not shouting copy).
8. Personal over generic. Speak to this user's real data. "You trained 5 days this
   week" beats "Great progress!" The more specific, the more it lands.

---

## Glyphs instead of emojis (how to obey rule 2 in a sealed tile)

Inline a small stroked SVG and color it with `currentColor`. Example star/spark:

```html
<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/>
</svg>
```

Common needs: check `M5 12l5 5L19 7`, clock `<circle cx=12 cy=12 r=9/><path d=M12 8v4l3 2/>`,
up-triangle `M12 5l8 13H4z`, down-triangle `M12 19L4 6h16z`, moon
`M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z`. Color meaning lives on the
glyph plus the word plus a dot, never on color alone (colorblind-safe).

---

## Highlight the one phrase that carries the value

In a sentence, the single phrase that holds the insight gets a different color and
a soft underline glow, so the eye lands on it. One per sentence, never more.

```html
<style>
  .key{color:var(--mint-hi);font-weight:700;
    border-bottom:2px solid rgba(110,231,183,0.55);
    text-shadow:0 0 22px rgba(110,231,183,0.4)}
</style>
<p>a <span class="key">hard stop at 11</span> fixes the snacking and the bad sleep behind it.</p>
```

Use mint for the good lever, amber for the gentle caution. Never red.

---

## Before and after (copy the right column, never the left)

Tone reference: notice how the right column is lowercase-leaning, specific to the
user's data, warm, and free of em dashes and filler.

1. Greeting
   - Before: "Welcome back to your Productivity Dashboard!" plus a confetti emoji
   - After: "howdy, Alex."

2. A missed day
   - Before: "You FAILED to log water yesterday. Streak broken!"
   - After: "yesterday slipped by, that happens. tap once and we pick it right back up."

3. Off-target number
   - Before: "Calories: 2,800 / 2,200. Over by 600 (BAD)."
   - After: "a little over today, no big deal. one lighter dinner evens out the week."

4. A win (celebration moment, warmth allowed)
   - Before: "Goal achieved. +1 to streak."
   - After: "five days straight. you are quietly turning into the person who just does this."

5. Jargon up front
   - Before: "Progressive overload is the key driver of hypertrophic adaptation."
   - After: "add a little more each week and your body keeps changing. lifters call it progressive overload."

6. Noise text
   - Before: "This is the section where you can view and manage all of your daily tasks in one convenient place."
   - After: "your tasks for today."

7. Empty state
   - Before: "No data available. Please add an entry to get started, it's easy!"
   - After: "nothing logged yet. add your first one and the page comes alive."

8. An insight tied to real data
   - Before: "Tip: try to get more sleep for better results!"
   - After: "your mood held every week you slept past 7 hours. that is the lever, not willpower."

9. Error (no stack trace, still warm)
   - Before: "Error 500: request failed. Try again."
   - After: "that did not save. give it another tap and it should land."

10. A caution that could shame
    - Before: "WARNING: you are way behind your weekly target, catch up now!"
    - After: "you are a touch behind this week. one easy session catches it before it lands."

---

## Quick gut-check

Read the string aloud as if a friend who genuinely cares about you said it. If it
sounds like a sensor, a teacher, or a marketing email, rewrite it. If it has a
dash that is not a hyphen, kill it. If a word could go without losing meaning, cut
it. Warm, plain, specific, no shame.
