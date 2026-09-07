// Fun, friendly food + macro facts shown while a photo analyzes. Each carries a
// `highlight` (an exact substring of `text` that gets color-emphasized) and a
// `macro` that picks the accent color the whole card tints to (the "Pop / cozy"
// loading treatment). Kept short, generally true, light + feel-good in tone (no
// em dashes). These are flavor text, not nutrition advice the user logs against.
//
// The pool is large on purpose so a loyal user never gets bored (random rotation).

export type FactMacro = 'protein' | 'carbs' | 'fat' | 'fiber' | 'hydration' | 'general'

export interface FoodFact {
  text: string
  highlight: string // MUST be an exact substring of `text`
  macro: FactMacro
}

// Playful little tags that pop in above each fact (rotated at random).
export const FACT_TAGS: string[] = ['Fuel fact', 'Quick bite', 'Plot twist', 'Macro myth', 'Did you know', 'Hot take', 'Feel good', 'Good to know']

export const FOOD_FACTS: FoodFact[] = [
  { text: "One egg has about 6g of protein, small but mighty.", highlight: "6g of protein", macro: "protein" },
  { text: "A medium banana is about 27g of carbs, easy fuel for a workout.", highlight: "27g of carbs", macro: "carbs" },
  { text: "Avocado is mostly healthy fat, and yes it counts as a fruit.", highlight: "healthy fat", macro: "fat" },
  { text: "Your body is about 60% water, so little sips through the day help.", highlight: "60% water", macro: "hydration" },
  { text: "Logging a meal is a small act of caring for future you.", highlight: "caring for future you", macro: "general" },
  { text: "Fiber keeps you full and feeds the friendly bacteria in your gut.", highlight: "friendly bacteria in your gut", macro: "fiber" },
  { text: "A whole chicken breast can have around 50g of protein.", highlight: "50g of protein", macro: "protein" },
  { text: "Half a cup of dry oats has around 27g of carbs for slow energy.", highlight: "27g of carbs", macro: "carbs" },
  { text: "One tablespoon of olive oil is about 14g of fat, so drizzle lightly.", highlight: "14g of fat", macro: "fat" },
  { text: "Watermelon is about 92% water, a snack that hydrates too.", highlight: "92% water", macro: "hydration" },
  { text: "Tracking is really just noticing, and noticing is where change starts.", highlight: "noticing", macro: "general" },
  { text: "A medium apple has about 4g of fiber, skin and all.", highlight: "4g of fiber", macro: "fiber" },
  { text: "Honey never spoils, and ancient jars have been found still edible.", highlight: "never spoils", macro: "general" },
  { text: "A small cup of Greek yogurt brings about 15g of protein.", highlight: "15g of protein", macro: "protein" },
  { text: "A cup of cooked rice has about 45g of carbs, simple and filling.", highlight: "45g of carbs", macro: "carbs" },
  { text: "Salmon is full of omega-3 fats your brain and heart love.", highlight: "omega-3 fats", macro: "fat" },
  { text: "Cucumber is about 95% water, basically a crunchy drink.", highlight: "95% water", macro: "hydration" },
  { text: "One logged meal today beats a perfect plan you never start.", highlight: "One logged meal today", macro: "general" },
  { text: "Oats have a special fiber called beta-glucan that loves your heart.", highlight: "beta-glucan", macro: "fiber" },
  { text: "One scoop of whey is roughly 24g of protein in seconds.", highlight: "24g of protein", macro: "protein" },
  { text: "A sweet potato has about 25g of carbs plus a big hit of vitamin A.", highlight: "25g of carbs", macro: "carbs" },
  { text: "A handful of almonds carries about 14g of fat, the heart-friendly kind.", highlight: "14g of fat", macro: "fat" },
  { text: "Water has zero calories and still does so much heavy lifting.", highlight: "zero calories", macro: "hydration" },
  { text: "Consistency beats intensity, little by little really adds up.", highlight: "Consistency beats intensity", macro: "general" },
  { text: "Berries are sweet but low in sugar and high in fiber.", highlight: "high in fiber", macro: "fiber" },
  { text: "Bananas are berries, but strawberries technically are not.", highlight: "Bananas are berries", macro: "general" },
  { text: "A cup of black beans has about 15g of plant protein.", highlight: "15g of plant protein", macro: "protein" },
  { text: "Oats are a complex carb, so they give energy on a slow release.", highlight: "complex carb", macro: "carbs" },
  { text: "Two tablespoons of chia have about 5g of omega-3 fats.", highlight: "5g of omega-3 fats", macro: "fat" },
  { text: "A banana's potassium is a friendly electrolyte after a sweat.", highlight: "potassium", macro: "hydration" },
  { text: "Every photo you snap is a tiny high five to yourself.", highlight: "tiny high five", macro: "general" },
  { text: "Two tablespoons of chia bring about 10g of fiber, tiny powerhouses.", highlight: "10g of fiber", macro: "fiber" },
  { text: "Half a cup of tofu gives you around 10g of protein.", highlight: "10g of protein", macro: "protein" },
  { text: "Carbs are your body's go-to energy source, not the enemy.", highlight: "go-to energy source", macro: "carbs" },
  { text: "Olive oil is rich in monounsaturated fat, a Mediterranean staple.", highlight: "monounsaturated fat", macro: "fat" },
  { text: "Even your blood is about 90% water, wild to think about.", highlight: "90% water", macro: "hydration" },
  { text: "Progress is rarely a straight line, and that is completely okay.", highlight: "rarely a straight line", macro: "general" },
  { text: "An apple's fiber sits mostly in the skin, so leaving it on helps.", highlight: "fiber", macro: "fiber" },
  { text: "One orange covers most of a day's vitamin C, sweet and simple.", highlight: "vitamin C", macro: "general" },
  { text: "Salmon brings about 22g of protein along with its omega-3s.", highlight: "22g of protein", macro: "protein" },
  { text: "Potatoes pack more potassium than a banana, a humble surprise.", highlight: "more potassium than a banana", macro: "carbs" },
  { text: "A handful of almonds is about 23 nuts, one tidy little serving.", highlight: "23 nuts", macro: "fat" },
  { text: "Starting the day with a glass of water is a tiny kind habit.", highlight: "glass of water", macro: "hydration" },
  { text: "Showing up beats being perfect, every single time.", highlight: "Showing up", macro: "general" },
  { text: "Most of us get less fiber than we'd like, so fruit and oats help.", highlight: "fiber", macro: "fiber" },
  { text: "A can of tuna has around 20g of protein, ready when you are.", highlight: "20g of protein", macro: "protein" },
  { text: "Whole fruit gives you natural sugar wrapped in fiber and water.", highlight: "natural sugar", macro: "carbs" },
  { text: "Half an avocado has about 11g of good fats, creamy and filling.", highlight: "11g of good fats", macro: "fat" },
  { text: "Foods like fruit and veg give you water too, not just your cup.", highlight: "water too", macro: "hydration" },
  { text: "Curiosity about your food beats judgment, always.", highlight: "Curiosity", macro: "general" },
  { text: "Carrots get their orange from beta-carotene, which becomes vitamin A.", highlight: "beta-carotene", macro: "general" },
  { text: "Half a cup of cottage cheese has about 14g of protein.", highlight: "14g of protein", macro: "protein" },
  { text: "Rice is light, quick energy your body can put to use fast.", highlight: "quick energy", macro: "carbs" },
  { text: "Chia seeds are one of the best plant sources of omega-3s.", highlight: "omega-3s", macro: "fat" },
  { text: "Thirst can feel like hunger, so a glass of water first is a gentle check.", highlight: "glass of water first", macro: "hydration" },
  { text: "Numbers are just clues, not a scorecard for your worth.", highlight: "not a scorecard", macro: "general" },
  { text: "A cup of edamame brings about 17g of protein, podded and happy.", highlight: "17g of protein", macro: "protein" },
  { text: "A sweet potato's carbs rise slowly and gently, nice and steady.", highlight: "rise slowly", macro: "carbs" },
  { text: "Fat helps your body soak up vitamins A, D, E and K.", highlight: "soak up vitamins", macro: "fat" },
  { text: "A cup of lentils has about 18g of protein and lots of fiber.", highlight: "18g of protein", macro: "protein" },
  { text: "A balanced plate is protein, carbs and fat being good friends.", highlight: "protein, carbs and fat", macro: "general" },
  { text: "Two tablespoons of peanut butter have about 7g of protein.", highlight: "7g of protein", macro: "protein" },
  { text: "Oats keep you full for hours, a calm and cozy breakfast.", highlight: "keep you full", macro: "carbs" },
  { text: "Quinoa is a complete protein, all nine amino acids in one grain.", highlight: "complete protein", macro: "protein" },
  { text: "Spinach gives you iron, and a squeeze of lemon helps you absorb it.", highlight: "iron", macro: "general" },
  { text: "Eggs give you all nine essential amino acids in one little package.", highlight: "nine essential amino acids", macro: "protein" },
  { text: "Peanut butter's fat profile looks a lot like olive oil's.", highlight: "fat profile", macro: "fat" },
  { text: "Greek yogurt is strained, so it holds more protein than regular yogurt.", highlight: "more protein", macro: "protein" },
  { text: "Tiny habits stack up over time, and you are already stacking one.", highlight: "Tiny habits stack up", macro: "general" },
  { text: "Cottage cheese is rich in slow casein protein, lovely before bed.", highlight: "casein protein", macro: "protein" },
  { text: "You logged today, and that is a genuinely good thing.", highlight: "a genuinely good thing", macro: "general" },
  { text: "Beans and rice together make a complete protein, a classic pair.", highlight: "complete protein", macro: "protein" },
  { text: "Whey absorbs fast, which is why it is a post-workout favorite.", highlight: "absorbs fast", macro: "protein" },
  { text: "Egg whites are nearly pure protein with very little fat.", highlight: "pure protein", macro: "protein" },
  { text: "Chicken breast is lean and protein-dense, a meal-prep hero.", highlight: "protein-dense", macro: "protein" },

  // ── extra unique trivia kept from the original set (dups with the above removed) ──
  { text: "Protein keeps you full longer than carbs or fat.", highlight: "keeps you full longer", macro: "protein" },
  { text: "Cooked chicken breast is around 31g of protein per 100g.", highlight: "31g of protein", macro: "protein" },
  { text: "Broccoli has more protein per calorie than you would guess.", highlight: "more protein per calorie", macro: "protein" },
  { text: "One cup of milk has about 8g of protein.", highlight: "8g of protein", macro: "protein" },
  { text: "A chicken thigh has a little more fat and flavor than the breast.", highlight: "more fat and flavor", macro: "fat" },
  { text: "Dark chocolate has more iron than you might think.", highlight: "more iron", macro: "general" },
  { text: "Fat has 9 calories per gram, protein and carbs have 4.", highlight: "9 calories per gram", macro: "fat" },
  { text: "Your body only stores so many carbs as glycogen at once.", highlight: "glycogen", macro: "carbs" },
  { text: "Tofu soaks up whatever flavor you cook it with.", highlight: "soaks up whatever flavor", macro: "protein" },
  { text: "Shrimp is high in protein and very low in fat.", highlight: "high in protein", macro: "protein" },
  { text: "A bagel can hide 50g or more of carbs.", highlight: "50g or more of carbs", macro: "carbs" },
  { text: "Pistachios are one of the higher-protein nuts.", highlight: "higher-protein", macro: "protein" },
  { text: "Greek yogurt plus berries is a near-perfect snack.", highlight: "near-perfect snack", macro: "protein" },
  { text: "Chickpeas power both hummus and a solid protein hit.", highlight: "solid protein hit", macro: "protein" },
  { text: "Steak delivers protein, iron, and B12 in one bite.", highlight: "protein, iron, and B12", macro: "protein" },
  { text: "Turkey breast is lean protein, holiday or not.", highlight: "lean protein", macro: "protein" },
  { text: "A banana before a workout is nature's energy gel.", highlight: "nature's energy gel", macro: "carbs" },
  { text: "Protein helps repair the muscle you break down lifting.", highlight: "repair the muscle", macro: "protein" },
  { text: "A handful of walnuts brings plant-based omega-3s.", highlight: "plant-based omega-3s", macro: "fat" },
  { text: "Cheese is protein and fat, with very few carbs.", highlight: "protein and fat", macro: "fat" },
  { text: "Pumpkin seeds are packed with magnesium.", highlight: "magnesium", macro: "general" },
]
