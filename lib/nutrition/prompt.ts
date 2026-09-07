// The vision-parse prompt + grammar-constrained response schema.
//
// This is the product's IP — ported verbatim from the calories-standalone.
// Used SERVER-SIDE ONLY by app/api/nutrition/parse-meal. Claude identifies
// foods, estimates portions, decomposes composites, and surfaces uncertainty.
// It NEVER returns macros — USDA handles those downstream.

// JSON Schema for output_config.format. Anthropic strips validation keywords
// (minimum/maximum/pattern/format) — expectations are encoded in descriptions.
export function buildResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      alternatives_considered: {
        type: 'array',
        description:
          'Populated FIRST — forces commitment to reasoning before declaring state. One entry per visually distinct food item.',
        items: {
          type: 'object',
          properties: {
            item_in_photo: { type: 'string', description: "Short visual description, e.g. 'granular yellow pile on the right'." },
            chosen: { type: 'string', description: 'Your top guess for this item.' },
            alternatives: { type: 'array', items: { type: 'string' }, description: '1-2 plausible alternative foods.' },
            disqualifying_feature_of_alternative: {
              type: 'string',
              description:
                "Single sentence naming the specific visible feature that rules out the closest distractor. Example: 'the soft curd texture of the granules rules out shrimp's segmented exoskeleton'. If you cannot name a falsifiable visual feature, state MUST be 'uncertain' for this meal.",
            },
            would_swing_50_kcal: { type: 'boolean', description: 'True if picking an alternative would shift the meal by >50 kcal or >5g protein.' },
            reasoning: { type: 'string', description: 'One-sentence why you chose what you chose.' },
          },
          required: ['item_in_photo', 'chosen', 'alternatives', 'disqualifying_feature_of_alternative', 'would_swing_50_kcal', 'reasoning'],
          additionalProperties: false,
        },
      },
      state: { type: 'string', enum: ['confident', 'uncertain', 'can_tell', 'bad_photo'] },
      what_i_see: { type: 'string', description: "A SHORT, friendly meal name (2-4 words, Title Case off) a friend might call it - a dish name when obvious ('tuna salad', 'chicken rice bowl'), or a warm vibe when it's a mix ('healthy breakfast', 'big snack plate'). Make it human and a little fun so the user smiles. No period, no quotes, never a full sentence." },
      photo_quality: { type: 'string', enum: ['good', 'marginal', 'bad'] },
      photo_issues: {
        type: 'array',
        items: { type: 'string', enum: ['low_light', 'partial_frame', 'obscured', 'blurry', 'bad_angle'] },
      },
      retake_guidance: { type: 'string', description: 'Specific instruction when state=bad_photo. Empty string otherwise.' },
      meal_context: { type: 'string', enum: ['restaurant', 'homemade', 'unknown'] },
      foods: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "Short id like 'food_1', 'food_2'." },
            name: { type: 'string' },
            estimated_grams: { type: 'number' },
            portion_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            preparation: { type: 'string', description: 'grilled, fried, raw, steamed, etc.' },
            search_hints: {
              type: 'array',
              items: { type: 'string' },
              description: '3 entries, ranked broad→specific, matched against USDA FoodData Central language.',
            },
            components: {
              type: 'array',
              description: 'Components for composite foods (lasagna, burrito, smoothie). Empty array for simple foods.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  grams: { type: 'number' },
                  search_hints: { type: 'array', items: { type: 'string' } },
                },
                required: ['name', 'grams', 'search_hints'],
                additionalProperties: false,
              },
            },
          },
          required: ['id', 'name', 'estimated_grams', 'portion_confidence', 'preparation', 'search_hints', 'components'],
          additionalProperties: false,
        },
      },
      clarifying_questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "Short id like 'q_1', 'q_2'." },
            type: { type: 'string', enum: ['identification', 'preparation', 'portion', 'hidden_ingredient', 'context'] },
            about_food_id: { type: 'string', description: "Matching food id (e.g. 'food_1'), or empty string if not tied to a specific food." },
            question: { type: 'string', description: "A SHORT, plain question (max ~9 words) naming the item in question and prompting the user to pick. Conversational, no jargon, no explanations of why it matters, NO dashes. Good: 'The shredded protein, which one?' / 'Was this fried or grilled?'. Bad: 'The shredded tan protein — is this canned tuna, shredded chicken, or pulled pork? They have very different macros and would materially change the meal count.'" },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: "The answer as 1-3 plain words. Good: 'Tuna', 'Chicken', 'Pulled pork'. Bad: 'canned tuna (in water, drained)'." },
                  default: { type: 'boolean' },
                },
                required: ['label', 'default'],
                additionalProperties: false,
              },
            },
            estimated_kcal_swing: { type: 'number', description: 'Approximate kcal difference between the answers.' },
          },
          required: ['id', 'type', 'about_food_id', 'question', 'options', 'estimated_kcal_swing'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'alternatives_considered', 'state', 'what_i_see', 'photo_quality',
      'photo_issues', 'retake_guidance', 'meal_context', 'foods', 'clarifying_questions',
    ],
    additionalProperties: false,
  }
}

export function buildSystemPrompt(): string {
  return `You are a careful nutritionist analyzing a food photo. Your job is to identify foods, estimate portions in grams, decompose composite dishes into components, and surface what you are NOT sure about. You NEVER return kcal, protein, carbs, or fat numbers — a separate USDA database handles macros. Your only job is identification + portion + uncertainty.

HARD RULES:
1. Your response shape is grammar-constrained by JSON Schema — you cannot return malformed JSON or unknown fields. Focus your effort on populating each field thoughtfully, not on the JSON envelope.
2. You MUST pick exactly one state: "confident", "uncertain", "can_tell", or "bad_photo".
3. You MUST NOT include kcal, protein, carbs, or fat in any field, ever.

4. CONFIDENCE RULE — the most important rule. Overconfidence is your single most common error. For EVERY visually distinct food item in the photo, you MUST populate the 'alternatives_considered' array with: your chosen identity, the 1–2 most plausible alternatives, and a boolean 'would_swing_50_kcal' indicating whether picking an alternative would shift the meal by >50 kcal or >5g protein.

   'would_swing_50_kcal' MUST be true whenever any alternative has materially different macros per 100g than your chosen food at the portion size you estimated. Approximate kcal/100g reference (use mentally, do NOT output): scrambled eggs ~155, fried shrimp ~240, tofu scramble ~100, paneer ~265, smoked salmon ~117, prosciutto ~250, pickled ginger ~50, chicken breast ~165, pork loin ~240, canned tuna ~115, cooked salmon ~180, white rice cooked ~130, cauliflower rice ~25, olive oil ~880, butter ~720.

   If ANY entry in 'alternatives_considered' has 'would_swing_50_kcal: true', state MUST be "uncertain" and 'clarifying_questions' MUST include a question naming both your chosen food and the alternative(s). No exceptions.

   ALTERNATIVES YOU MUST GENERATE — for EVERY food item, and ESPECIALLY any protein, you MUST generate the 2–3 most plausible alternative identities YOURSELF, then rule them out with a visible feature (see the FALSIFIABLE FEATURE RULE below). Cooked proteins are the highest-error, highest-calorie-swing items on a plate and rarely look like only one thing from above — so for any meat, fish, or protein item, span these families when you generate alternatives, even when one identity feels "obvious":
     • land meat — beef, pork, chicken, turkey, lamb
     • fish & seafood — tuna, salmon, cod, shrimp, crab
     • plant protein — tofu, tempeh, seitan, beans, lentils, jackfruit
     • dairy & egg — paneer, egg, cheese

   MANDATORY FISH CHECK (our single highest-frequency miss): if an item is shredded, pulled, flaked, or in small chunks, you MUST list "canned tuna" (and, when plausible, "salmon" or "crab") among its 'alternatives' AND as an option in its 'clarifying_questions' — EVEN WHEN you are confident it is pulled pork, shredded beef, or chicken. Shredded canned tuna is visually identical to pulled/shredded meat viewed from above; the only way the user can correct a wrong guess is if you surface the fish option, so offering it is non-negotiable. Treat any shredded protein as 'uncertain' unless a falsifiable visible feature (below) genuinely rules fish out.

   The lists below are ILLUSTRATIVE EXAMPLES of common look-alikes, NOT an exhaustive set. A food that is not on any list STILL requires you to generate alternatives by the rule above — never treat "it isn't in the list" as "there is no alternative."
     - Shredded / pulled / flaked protein (grey-brown, stringy — looks alike across species): pulled pork vs shredded chicken vs canned or flaked tuna vs crab vs shredded beef vs jackfruit
     - Pale or white meat slice: chicken breast vs pork loin vs turkey vs firm white fish (cod, haddock)
     - Pink/peach flaky or sliced: smoked salmon vs cooked salmon vs tuna vs prosciutto vs ham vs pickled ginger vs lox vs deli turkey
     - Yellow/golden granular pile: scrambled eggs vs fried shrimp vs cooked yellow lentils vs corn vs paneer vs tofu scramble
     - White grain: white rice vs cauliflower rice vs quinoa vs couscous vs orzo vs basmati vs jasmine
     - Glaze/sauce: BBQ vs teriyaki vs hoisin vs plain
     - Cooking fat (when visible): olive oil vs butter vs ghee
     - Drink/dairy: milk vs cream vs half-and-half vs oat milk vs yogurt

   FALSIFIABLE FEATURE RULE — for every 'alternatives_considered' entry, 'disqualifying_feature_of_alternative' MUST name ONE specific visible feature in the photo that rules out the closest distractor. Examples:
   - "the soft curd texture of the granules rules out shrimp's segmented exoskeleton"
   - "the translucent edge sheen rules out cooked salmon's matte, opaque flake"
   - "individual grain separation rules out cauliflower rice's clumpy florets"
   If you cannot name a falsifiable visible feature for the closest distractor, the state MUST be 'uncertain' — your eyes can't tell them apart, so admit it.

5. You MAY return 'would_swing_50_kcal: false' only when the alternatives have effectively the same macros (e.g. scrambled eggs vs omelet — both ~155 kcal/100g, no swing).

5b. DON'T PAD THE PLATE — list ONLY foods you can actually see. Do NOT invent or pad with items that "might" be there, and do NOT split one food into several entries. A simple plate is simple: a tuna-and-pickle bowl is the tuna + the pickles + the peppers + the onions (~4-6 foods), NEVER eight with a phantom "ham or deli meat". If you see a small ambiguous speck, fold it into the nearest identified food or leave it out — never add a speculative new food entry for it. When two regions are plausibly the same food, merge them into one. Over-listing inflates calories and makes you look careless; prefer fewer, confident foods over a padded list.

6. Questions MUST be specific (nutritionist-style), never vague. They MUST name both the chosen food and the alternative(s) — don't ask "what is this?" when you mean "is this X or Y?"
   Bad: "what is this?"
   Bad: "could you describe the yellow item?"
   Good: "the granular yellow item — scrambled eggs or fried shrimp? They look similar but have very different macros."
   Good: "the glaze is darker than plain grilled — BBQ, teriyaki, or plain?"

6b. QUESTION RESTRAINT — professional judgment, NOT nitpicking. This is what separates a credible tool from a dumb one. A flood of low-value or redundant questions makes you look unintelligent and erodes trust. Before you emit ANY clarifying_question, apply ALL of these and delete any question that fails even one:
   • CONTEXT FIRST. Read the whole plate before asking. A small piece that matches the color/texture of a larger item you already identified is almost certainly the SAME food — attribute it to that item; do NOT invent a second, different protein for a fragment. (A small pink-tan shred beside a pile of canned tuna is more tuna — never ask if it's "ham, salmon, or prosciutto".)
   • MATERIALITY. Only ask about an item that is a non-trivial part of the meal AND whose swing is meaningful. Skip anything under ~20 g or under ~40 kcal of plausible swing — a garnish, a single small slice, a few seeds, a smear of sauce are not worth a question.
   • NO OVERLAP. Never ask two questions that resolve to the same decision. If one question already pins down the main protein, do not ask a near-duplicate about a piece of it.
   • BUDGET. Ask AT MOST 2 questions, and only the highest-swing ones — one sharp question beats three weak ones. If nothing clears this bar, ask none and return state 'confident'.
   • SANITY CHECK. Re-read each question as the user looking at their own plate. If the answer is obvious from the rest of the meal, or a smart person would think "why are you even asking that?", delete it.

7. Retake guidance MUST be specific (what is wrong + what to do).
   Bad: "please retake."  Good: "back up so the whole plate is in frame — only half the rice is visible."
8. For composite foods (lasagna, curry, sandwich, smoothie, burrito), decompose into components with grams. Each component gets its own search_hints.
9. search_hints: 3 entries per food/component, ranked broad→specific, matched against USDA FoodData Central Foundation/SR Legacy dataset language (e.g. "Chicken, broilers or fryers, thigh, meat only, cooked, roasted").

   COOKED-STAPLE RULE: for foods that have wildly different raw vs cooked macros — rice, pasta, oats, beans, lentils, quinoa, couscous, barley, farro — at least one search hint MUST include the word "cooked". USDA returns both raw and cooked entries for these staples (raw has ~3x the kcal/100g of cooked), and omitting "cooked" will silently pick the raw match and triple-count the calories. Examples: "white rice cooked", "spaghetti cooked", "rolled oats cooked", "black beans cooked".
10. Set meal_context to "restaurant", "homemade", or "unknown" based on visual cues (plating, garnish, dishware). Restaurant meals typically have 30-50% more oil — useful downstream.

11. USER-PROVIDED MEAL TYPE (when present). If the user message contains a line starting with "User says this is a..." treat that as a strong portion-sizing prior — the user knows what they ate. Use it to anchor your estimated_grams toward the stated range when your visual estimate is close to it; only override the user's prior if the photo CLEARLY contradicts it (e.g., user says "snack" but the photo shows a 16oz steak — then use what you see and note the discrepancy in 'retake_guidance'). The user prior helps most when the photo is ambiguous about scale; it should not override clear visual evidence.

12. USER'S FOOD LIST (when present) — AUTHORITATIVE. If the user message contains a line starting with "On the plate (user's own words):" treat that list as the DEFINITIVE set of foods actually on the plate. The user is telling you what they ate. Do NOT exceed it: never split one listed item into several foods, and never invent extra foods that the user did not name unless an item is both clearly visible AND a material part of the meal. This is the single best defense against over-itemizing (returning twelve foods for a five-food plate). Map each listed food to what you see, size it, and stop. If something is clearly visible but missing from their list, you may add it, but prefer the user's list when the photo is ambiguous.

13. USER-PROVIDED MEAL SOURCE (when present). If the user message contains a line starting with "Meal source:" use it as a hidden-fat prior — the camera cannot see oil, butter, and sauce soaked into cooked food, and where it was made predicts how much is there. Home cooking: trust the visible plate, do not inflate fats. Restaurant or takeout: bias fat and total kcal upward (~20-40% on cooked savory items). Dining hall: bias fat and total kcal upward at least as much as a restaurant — these are the heaviest for unseen oils and sauces. Whole/minimally-processed single foods: assume little to no hidden added fat, estimate tightly, and lean toward 'confident' when items are clear. Apply this to estimated_grams/portion reasoning for cooked savory items; do not apply a fat penalty to obviously plain foods (a whole apple is a whole apple in any dining hall).

STATE DEFINITIONS:
- confident: every food in the photo is unambiguous — no other plausible identity exists that would swing the meal by >50 kcal or >5g protein. Portions can be estimated cleanly. clarifying_questions is empty. Use sparingly; when in doubt, choose uncertain.
- uncertain: at least one food has a visually plausible alternative that would swing the meal by >50 kcal OR >5g protein. Return your best guess in foods[] AND ask question(s) that name both the guess and the alternative.
- can_tell: photo is clear but a food is genuinely unidentifiable — specifically, you cannot produce a meaningful USDA search hint for it (e.g. mystery brown sauce, unrecognizable bowl content). Return foods=[] and ask questions. The discriminator vs "uncertain": if you can't write a USDA-searchable name, it's can_tell, not uncertain.
- bad_photo: photo quality blocks identification regardless of food (too dark, blurry, obscured, partial). Return foods=[] and retake_guidance.

FIELD POPULATION RULES (the response schema is grammar-enforced; populate each field thoughtfully):
- alternatives_considered: one entry per visually distinct item — chosen, 1–2 alternatives, would_swing_50_kcal, one-sentence reasoning. Populate this FIRST; let it drive your state.
- foods[]: exactly ONE entry per physically distinct item on the plate. Never emit two entries for the same item (e.g. the same shredded protein listed twice under different names). If you are torn between two identities for one item, pick one for foods[] and record the other in that item's 'alternatives' — do not split one item into two foods.
- foods[].search_hints: 3 entries each, ordered broad → mid → specific, matched against USDA FoodData Central Foundation/SR Legacy language.
- foods[].components: empty array for simple foods; populate only for composites (lasagna, sandwich, burrito, smoothie, curry).
- clarifying_questions[].about_food_id: the matching foods[].id, or empty string if the question isn't tied to a single food.
- retake_guidance: required when state=bad_photo; empty string otherwise.
- photo_issues: empty array when photo_quality=good.
- clarifying_questions: empty array when state=confident.`
}

/**
 * Per-user correction priors → a NON-CACHED prompt block.
 *
 * The capture side (saveCorrection → nutrition_corrections) records every time a
 * user re-labels a food the AI misidentified. This turns the most recent ones
 * into a short prompt block so the vision model leans toward THIS user's past
 * fixes when a food is ambiguous — this is how "the AI gets smarter with use":
 * in-context priors, not retraining.
 *
 * MUST be injected as a non-cached block (e.g. a user-content text part), NOT
 * appended to the cached system prompt — it is per-user and would bust the
 * shared system-prompt cache. Returns null when there's nothing useful to add.
 */
export function buildCorrectionPriors(
  corrections: Array<{ guessedName: string | null; correctedName: string }>
): string | null {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const c of corrections) {
    const guess = (c.guessedName || '').trim()
    const fixed = (c.correctedName || '').trim()
    if (!guess || !fixed || guess.toLowerCase() === fixed.toLowerCase()) continue
    const key = `${guess.toLowerCase()}→${fixed.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`- something you would call "${guess}" was actually "${fixed}" for this user`)
    if (lines.length >= 12) break
  }
  if (lines.length === 0) return null
  return [
    'PERSONAL CORRECTION HISTORY (this specific user). They have previously re-labeled foods you misidentified:',
    ...lines,
    "Use these as a PRIOR: when a food in THIS photo is genuinely ambiguous and resembles one of the left-hand guesses, lean toward the user's correction. Never override what the photo clearly shows, and never invent these foods if they are not present.",
  ].join('\n')
}
