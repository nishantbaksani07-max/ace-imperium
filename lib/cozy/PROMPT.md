# CozyLoader content prompt (claude.ai)

The canonical generation prompt for the "cozy loader" fun lines, one per section.
Mirrors the macro tracker's fun-fact build exactly (short, generally true, one
highlight that is an exact substring, light tone, no em dashes). The only change:
the food `macro` field becomes `tone` (these are not all about food), chosen from
each section's palette.

**How to use:** paste the prompt below into a fresh claude.ai chat. It returns one
JSON object keyed by section. Drop each array into the matching `lib/cozy/<section>.ts`.
To generate only one section, delete the others from the SECTIONS list. Bump the
count line for more lines per section.

---

You are writing micro-copy for Vitality, a warm life-organization app (workouts, food, money, goals, wearables). Vitality is a made-up character who genuinely loves the user and wants to help them get their life in order. These lines appear on a small "cozy loader" card during short waits (while something analyzes, thinks, or loads) and in empty states. Each line is a tiny gift for the wait: friendly, true, and a little delightful. They are flavor, never instructions the user acts on or logs against.

Generate fun, lovely one-line entries for the cozy loader, for every section listed below.

OUTPUT FORMAT. Return ONLY valid JSON. No prose, no markdown code fences. A single object keyed by section id. Each value is an array of entry objects:

{
  "coach": [ { "text": "...", "highlight": "...", "tone": "mint" } ],
  "mentor": [ ],
  "peak": [ ],
  "fitness": [ ],
  "finance": [ ],
  "goals": [ ],
  "onboarding": [ ],
  "empty": [ ]
}

Each entry object has exactly three fields:
- "text": one sentence. 6 to 16 words. Plain, warm, human English. Generally true. Sentence case.
- "highlight": the single most delightful or load-bearing phrase inside text. It MUST be an exact substring of text. Copy the characters verbatim, identical case, spacing, and punctuation, so a plain text.indexOf(highlight) would find it. 1 to 5 words. Never the whole sentence.
- "tone": one of the section's allowed tones listed below. Pick the tone that matches what the line is about.

HARD RULES:
- No em dashes or en dashes anywhere. Use periods, commas, or the word "and". (This reads as AI writing otherwise.)
- No emojis. No exclamation spam. No jargon. No medical, financial, or training advice phrased as a command. These are warm flavor, not coaching.
- Keep Vitality's voice: confident, cozy, kind, a friend who is glad you showed up. Never corny, never guilt, never salesy.
- Vary sentence openings and length across each set. No two entries start the same way. No duplicate ideas.
- Every highlight must be a real substring of its own text. Check each one.
- Produce 30 entries per section.

SECTIONS (id - the moment it shows - voice - allowed tones with when to use each - 2 examples):

0) coach - shown while the macro page's AI food coach is thinking about a meal recommendation - a warm, knowledgeable food coach who is never preachy - lines are about eating well, balance, and gentle food habits - tones: mint (good habits, balance, general), blue (hydration, fiber, calm), amber (a little indulgence or a smart swap)
   { "text": "Most meals get better with a handful of something green.", "highlight": "something green", "tone": "mint" }
   { "text": "A little fat helps you actually absorb the good stuff.", "highlight": "absorb the good stuff", "tone": "amber" }

1) mentor - shown while the AI mentor is thinking about a reply - warm, gentle, affirming, like Vitality speaking softly to a friend - tones: violet (calm, reflective), rose (tender, kind on a hard day), mint (affirming, hopeful)
   { "text": "You showed up today, and that is the whole game.", "highlight": "showed up today", "tone": "mint" }
   { "text": "Rest is part of the plan, not a break from it.", "highlight": "part of the plan", "tone": "violet" }

2) peak - shown while a training plan or coach reply builds - a sharp, plain-English coach who respects your time - tones: amber (effort, intensity, heat), blue (recovery, hydration, calm), violet (strategy, periodization, smart training)
   { "text": "Warm up the movement, not just the muscle.", "highlight": "the movement", "tone": "amber" }
   { "text": "Two hard days in a row means the third should be easy.", "highlight": "the third should be easy", "tone": "violet" }

3) fitness - shown on the rest timer between sets - punchy and very short, like a spotter in your ear, keep under 10 words - tones: mint (encouraging, general), blue (breathe, settle, recover)
   { "text": "Breathe slow, the next set starts in your head.", "highlight": "starts in your head", "tone": "blue" }
   { "text": "Shake it out, you have got this one.", "highlight": "you have got this", "tone": "mint" }

4) finance - shown while finances load or import - a friendly money friend, never preachy or shaming - tones: mint (good habits, growth, calm), amber (gentle spending awareness)
   { "text": "Naming a goal makes it about twice as likely to happen.", "highlight": "twice as likely", "tone": "mint" }
   { "text": "A subscription you forgot is the easiest money you will ever save.", "highlight": "easiest money", "tone": "amber" }

5) goals - shown while goals or streaks load, and on empty goal states - Duolingo-warm, identity-based, kind on off days - tones: mint (progress), violet (identity, who you are becoming), rose (kindness on a missed day)
   { "text": "Small steps still count as steps.", "highlight": "still count", "tone": "mint" }
   { "text": "You are becoming the kind of person who keeps promises.", "highlight": "keeps promises", "tone": "violet" }

6) onboarding - shown while we set up a new dashboard for the first time - welcoming, like opening the door of a warm home - tones: mint (bright welcome), rose (tender, glad you are here)
   { "text": "We are getting your corner of the world ready.", "highlight": "your corner of the world", "tone": "rose" }
   { "text": "Everything here is yours, and only yours.", "highlight": "yours, and only yours", "tone": "mint" }

7) empty - shown in empty states across the app when nothing is logged yet - inviting and low pressure, the blank page is a friend - tones: mint (gentle invite), violet (calm, room to grow)
   { "text": "Nothing here yet, and that is a fine place to start.", "highlight": "a fine place to start", "tone": "mint" }
   { "text": "This space fills in the moment you do.", "highlight": "the moment you do", "tone": "violet" }

Return the JSON object now.
