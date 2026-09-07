# Vitality Exercise / Lift Library (for workout tiles)

The canonical lift library Vitality's own logger uses. 58 lifts, each with a name,
tier, primary muscle, equipment, a one-line form tip, plus optional distilled
gist / steps / cues, and two weight-matched swap suggestions. Inline the sample
JSON below into a sealed workout tile so it speaks the same language as Vitality.

## Where the full set lives

- `app/app/fitness/log/splitData.ts` -> `EX` map: id -> { name, tier, tip?, perHand? }. 58 entries. The source of truth for ids + names + tiers.
- `lib/exerciseReferences.ts` -> per-id { gist, steps[], cues[], primaryMuscles[], equipment, instructions[] }. Distilled from the public-domain Free Exercise DB.
- `app/app/fitness/setup/exerciseSelection.ts` -> `EX_TAGS` (primary muscle bucket + equip), restriction subs, equipment fallbacks.
- `lib/exerciseAlternatives.ts` -> `EXERCISE_ALTERNATIVES`: 2 swaps per lift, each with a weight coefficient.

A tile cannot import these. Copy the rows you need as inline JSON. The sample
below is representative across every muscle group and tier.

## Data shape

Each lift in a tile-friendly shape (flattened from the three source files):

```
{
  id:        "bench_bb",        // stable key, snake_case
  name:      "Barbell bench",   // display name
  muscle:    "chest",           // bucket: chest|back|shoulders|arms|legs|glutes|core
  tier:      "heavy_compound",  // heavy_compound | compound | heavy_iso | iso | ab
  equip:     "barbell",         // barbell|dumbbell|cable|machine|bodyweight|bands
  tip:       "Wrists stacked over elbows...", // one-line form cue
  steps:     ["Unrack over your chest", ...], // 3 short phone-readable steps
  cues:      ["Lower slower than you press", ...],
  alts:      [{ id: "flat_db_press", coef: 0.35 }, { id: "machine_chest", coef: 0.85 }]
}
```

Tier meaning: `heavy_compound` = the day's anchor lift; `compound` = second-tier
multijoint; `heavy_iso` = loaded single-joint (barbell curl); `iso` = pump
isolation; `ab` = core. Tier drives default sets/reps in the real logger.

Swap coefficient: `new_weight = source_weight * coef`. Example: bench_bb at 80 kg
-> flat_db_press coef 0.35 -> suggest 28 kg per dumbbell. Bodyweight-to-bodyweight
swaps use coef 1 (or 0 for pullup_weighted -> pullup, meaning drop the added load).

## Library at a glance

58 lifts grouped by primary muscle (the `EX_TAGS` bucket a tile should filter by):

- chest (8): bench_bb, incl_bb_bench, flat_db_press, incl_db_press, machine_chest, dips_weighted, cable_fly, pec_deck
- back (9): pullup, pullup_weighted, bb_row, pendlay_row, t_bar_row, seated_cable_row, chest_supp_row, single_arm_row, lat_pulldown (+ conv_dl tagged back)
- shoulders (8): standing_ohp, seated_db_ohp, machine_ohp, push_press, db_lat_raise, cable_lat_raise, rear_delt_fly, reverse_pec, face_pull
- arms (8): close_grip, skullcrushers, tri_pushdown, oh_tri_ext, bb_curl, hammer_curl, cable_curl, incl_db_curl, preacher_curl
- legs (12): back_squat, front_squat, hack_squat, leg_press, rdl, bulgarian_ss, db_split_squat, walking_lunge, leg_ext, seated_leg_curl, lying_leg_curl, calf_raise
- glutes (1): hip_thrust
- core (8): cable_crunch, hang_leg_raise, toes_to_bar, ab_wheel, weighted_situp, decline_situp, russian_twist, plank

(Note: `conv_dl` is bucketed under back in EX_TAGS though its primary muscle is
lower back/hamstrings. Trust EX_TAGS for the day-category filter.)

## Ready-to-inline JSON sample (12 representative lifts)

```json
[
  { "id":"bench_bb","name":"Barbell bench","muscle":"chest","tier":"heavy_compound","equip":"barbell",
    "tip":"Wrists stacked over elbows. Tuck the elbows slightly, drive into the bar, hold the arch.",
    "steps":["Unrack over your chest","Lower slow to your neck","Press up and squeeze"],
    "cues":["Lower slower than you press","Squeeze chest at lockout"],
    "alts":[{"id":"flat_db_press","coef":0.35},{"id":"machine_chest","coef":0.85}] },

  { "id":"incl_db_press","name":"Incline DB press","muscle":"chest","tier":"compound","equip":"dumbbell",
    "tip":"30 degree incline. Lower DBs to upper chest. Squeeze pecs at top.",
    "steps":["Dumbbells at shoulder width, palms forward","Press up with your chest","Lower slow"],
    "cues":["Lower slower than you press","Stay in full control"],
    "alts":[{"id":"incl_bb_bench","coef":2.85},{"id":"flat_db_press","coef":1.15}] },

  { "id":"standing_ohp","name":"Standing barbell OHP","muscle":"shoulders","tier":"heavy_compound","equip":"barbell",
    "tip":"Bar over mid-foot. Squeeze glutes, brace abs. Press straight, head through at lockout.",
    "steps":["Bar on upper back, stand tall","Press overhead to lockout","Lower under control"],
    "cues":["Keep your back straight","Full lockout overhead"],
    "alts":[{"id":"seated_db_ohp","coef":0.35},{"id":"push_press","coef":1.25}] },

  { "id":"db_lat_raise","name":"DB lateral raise","muscle":"shoulders","tier":"iso","equip":"dumbbell",
    "tip":"Lead with elbows, slight pinkie tilt at top. Stop at shoulder height.",
    "steps":["Chest down on incline bench","Arms hang, neutral grip","Raise out to shoulder height"],
    "cues":["Arms perpendicular to torso","Hold the top a second"],
    "alts":[{"id":"cable_lat_raise","coef":0.75},{"id":"rear_delt_fly","coef":1.20}] },

  { "id":"pullup","name":"Pull-ups","muscle":"back","tier":"heavy_compound","equip":"bodyweight",
    "tip":"Dead hang. Strict. AMRAP, but leave one in the tank.",
    "steps":["Grip overhand, shoulder width","Pull chin above the bar","Lower to a full hang"],
    "cues":["Drive blades down and back","Full lat stretch at bottom"],
    "alts":[{"id":"pullup_weighted","coef":0.00},{"id":"lat_pulldown","coef":1.00}] },

  { "id":"bb_row","name":"Barbell row","muscle":"back","tier":"heavy_compound","equip":"barbell",
    "tip":"Hinge to 45 degrees, neutral spine. Pull to lower chest, squeeze the upper back.",
    "steps":["Bend to near parallel, grip overhand","Row the bar to you","Lower slow"],
    "cues":["Back straight, head up","Keep the torso still"],
    "alts":[{"id":"pendlay_row","coef":0.95},{"id":"t_bar_row","coef":0.90}] },

  { "id":"bb_curl","name":"Barbell curl","muscle":"arms","tier":"heavy_iso","equip":"barbell",
    "tip":"Elbows at sides. No swinging. Squeeze biceps hard at top.",
    "steps":["Bar at shoulder width, palms up","Curl up, elbows pinned","Lower slow to the start"],
    "cues":["Upper arms stay still","Only the forearms move"],
    "alts":[{"id":"cable_curl","coef":0.90},{"id":"preacher_curl","coef":0.75}] },

  { "id":"tri_pushdown","name":"Tricep rope pushdown","muscle":"arms","tier":"iso","equip":"cable",
    "tip":"Upper arms by your sides. Only the forearms move.",
    "steps":["Rope at high pulley, elbows in","Push down to your thighs","Return slow"],
    "cues":["Upper arms by your sides","Only the forearms move"],
    "alts":[{"id":"oh_tri_ext","coef":0.85},{"id":"skullcrushers","coef":0.75}] },

  { "id":"back_squat","name":"Barbell back squat","muscle":"legs","tier":"heavy_compound","equip":"barbell",
    "tip":"Bar on traps or rear delts. Knees track over toes. Hip + knee bend together.",
    "steps":["Bar on your upper back","Sit down and back, chest up","Drive through your heels"],
    "cues":["Knees track over your toes","Chest up, back flat"],
    "alts":[{"id":"front_squat","coef":0.75},{"id":"hack_squat","coef":1.30}] },

  { "id":"rdl","name":"Romanian deadlift","muscle":"legs","tier":"heavy_compound","equip":"barbell",
    "tip":"Hinge at hips, soft knees. Bar against legs. Stretch hamstrings, drive hips through.",
    "steps":["Grip bar, shins vertical","Hinge hips back, bar close","Drive hips to stand"],
    "cues":["Back and arms straight","Chest up, move steady"],
    "alts":[{"id":"conv_dl","coef":1.20},{"id":"hip_thrust","coef":1.15}] },

  { "id":"hip_thrust","name":"Barbell hip thrust","muscle":"glutes","tier":"compound","equip":"barbell",
    "tip":"Bench at upper back. Drive heels through floor. Squeeze glutes at the top, ribs down.",
    "steps":["Upper back on bench, bar on hips","Drive hips up through the bar","Lower to the start"],
    "cues":["Squeeze glutes at the top","Weight on blades and feet"],
    "alts":[{"id":"rdl","coef":0.85},{"id":"conv_dl","coef":1.10}] },

  { "id":"plank","name":"Plank","muscle":"core","tier":"ab","equip":"bodyweight",
    "tip":"Glutes squeezed, ribs down, elbows under shoulders. Time-based.",
    "steps":["Forearms and toes down","Body in a straight line","Hold as long as you can"],
    "cues":["No sagging hips","Raise a limb to progress"],
    "alts":[{"id":"ab_wheel","coef":1.00},{"id":"hang_leg_raise","coef":1.00}] }
]
```

## How a sealed workout tile uses it

Drop the array above (or your fuller copy) into a `<script>` as `const LIFTS = [...]`.
No build step, no libraries. Three patterns:

1. Searchable list. Filter by typed text and by muscle bucket.

```js
function search(q, muscle) {
  q = q.trim().toLowerCase();
  return LIFTS.filter(l =>
    (!muscle || l.muscle === muscle) &&
    (!q || l.name.toLowerCase().includes(q) || l.id.includes(q))
  );
}
// group for a picker:
const byMuscle = LIFTS.reduce((m, l) => ((m[l.muscle] ||= []).push(l), m), {});
```

2. Form sheet. Tap a lift, show its tip, steps, and cues in a bottom sheet.

```js
function formSheet(l) {
  return `<h3>${l.name}</h3><p class="tip">${l.tip || ''}</p>
    <ol>${l.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <ul class="cues">${l.cues.map(c => `<li>${c}</li>`).join('')}</ul>`;
}
```

3. Swap with weight match. "Don't have this today" -> show the 2 alternatives with
the converted weight so the user keeps their load.

```js
const byId = Object.fromEntries(LIFTS.map(l => [l.id, l]));
function swaps(id, currentKg) {
  const src = byId[id];
  return (src?.alts || []).map(a => ({
    lift: byId[a.id],
    kg: Math.round(currentKg * a.coef)   // 0 coef = bodyweight, hide the number
  })).filter(s => s.lift);
}
```

Style note: in the form sheet, color the cue list mint and keep copy short, the
same warm, plain-English tone the logger uses (no jargon walls). No emojis,
no em dashes.
