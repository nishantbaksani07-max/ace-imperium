// Nutrition quiz option icons.
//
// Flat 24x24 stroke-only mint glyphs, the SubstanceIcon pattern: one component
// switching on a `name`. House style — currentColor stroke, 1.7 weight, round
// caps/joins, zero fill. The option `value` is the icon name. Path strings are
// the ones validated in public/nutrition-quiz-preview.html. New marks for the
// gaps the crystal library did not already cover (digestion, acne, the allergen
// set, etc.); the rest mirror existing crystal-library glyphs.

export type NutritionIconName =
  | 'energy' | 'sleep' | 'focus' | 'mood' | 'cravings'
  | 'fat_loss' | 'muscle' | 'digestion' | 'skin' | 'healthier'
  | 'acne' | 'redness' | 'gut_often' | 'gut_some' | 'gut_fine'
  | 'gluten' | 'dairy' | 'peanut' | 'tree_nut' | 'egg' | 'soy' | 'fish'
  | 'shellfish' | 'sesame' | 'vegetarian' | 'vegan' | 'halal' | 'kosher'
  | 'pork_free' | 'none' | 'balanced' | 'feel'
  | 'adv_high' | 'adv_simple' | 'adv_routine'
  | 'pace_gentle' | 'pace_mid' | 'pace_push'
  | 'sprout' | 'cycle' | 'steps' | 'peak'
  | 'desk' | 'walk' | 'run' | 'lift'
  | 'count_macros' | 'cut_sugar' | 'fast_food' | 'hydrate'

const PATHS: Record<NutritionIconName, string> = {
  energy: '<path d="M13 2 6 13h5l-1 9 8-12h-5z"/>',
  sleep: '<path d="M20 14a8 8 0 1 1-9-11 7 7 0 0 0 9 11z"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  mood: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  cravings: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"/>',
  fat_loss: '<path d="M4 7l5 5 3-3 7 7"/><path d="M20 17v-4h-4"/>',
  muscle: '<path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10"/>',
  digestion: '<path d="M5 9c2-3 4 3 7 0s5 3 7 0"/><path d="M5 15c2-3 4 3 7 0s5 3 7 0"/>',
  skin: '<circle cx="12" cy="12" r="8"/><path d="M9 12l2 2 4-4"/>',
  healthier: '<path d="M12 8c1-4 6-4 7-1 1 4-3 12-7 12S4 11 5 7c1-3 6-3 7 1z"/><path d="M12 8V4"/>',
  acne: '<circle cx="12" cy="12" r="8"/><circle cx="10" cy="10" r="1"/><circle cx="15" cy="14" r="1"/>',
  redness: '<circle cx="12" cy="12" r="5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  gut_often: '<path d="M5 9c2-3 4 3 7 0s5 3 7 0"/><path d="M5 15c2-3 4 3 7 0s5 3 7 0"/>',
  gut_some: '<path d="M5 12c2-3 4 3 7 0s5 3 7 0"/>',
  gut_fine: '<path d="M5 12h14"/>',
  gluten: '<path d="M12 21V8"/><path d="M12 9c-2-1-4-1-4-3 2 0 4 0 4 2zM12 9c2-1 4-1 4-3-2 0-4 0-4 2zM12 14c-2-1-4-1-4-3 2 0 4 0 4 2zM12 14c2-1 4-1 4-3-2 0-4 0-4 2z"/>',
  dairy: '<path d="M8 3h8l-1 4v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7z"/>',
  peanut: '<path d="M9 7a3 3 0 0 1 6 0 3 3 0 0 0 0 4 3.5 3.5 0 0 1-3 5 3.5 3.5 0 0 1-3-5 3 3 0 0 0 0-4z"/>',
  tree_nut: '<path d="M6 9a6 6 0 0 1 12 0c0 5-4 11-6 11s-6-6-6-11z"/><path d="M6 9h12"/>',
  egg: '<path d="M12 3c4 0 6 6 6 10a6 6 0 1 1-12 0c0-4 2-10 6-10z"/>',
  soy: '<path d="M12 4c-4 2-6 6-4 10 1 3 5 4 7 1"/><circle cx="10" cy="11" r="1"/><circle cx="13" cy="14" r="1"/>',
  fish: '<path d="M3 12c4-5 11-5 15 0-4 5-11 5-15 0z"/><path d="M18 12l3-3v6z"/><circle cx="7" cy="11" r=".6"/>',
  shellfish: '<path d="M12 6c4 0 7 3 7 7H5c0-4 3-7 7-7z"/><path d="M9 13v3M12 13v4M15 13v3"/>',
  sesame: '<ellipse cx="9" cy="10" rx="1.4" ry="2.4"/><ellipse cx="14" cy="13" rx="1.4" ry="2.4"/>',
  vegetarian: '<path d="M5 19C5 9 19 5 19 5c0 10-6 14-14 14z"/><path d="M9 15c2-3 5-5 8-6"/>',
  vegan: '<path d="M12 20c0-6 3-9 8-10-1 6-4 9-8 10z"/><path d="M12 20c0-6-3-9-8-10 1 6 4 9 8 10z"/>',
  halal: '<path d="M16 4a8 8 0 1 0 4 13A6 6 0 0 1 16 4z"/>',
  kosher: '<path d="M12 3l3.5 6h-7zM12 21l-3.5-6h7zM4 8l6 1-2.5 5zM20 8l-6 1 2.5 5z"/>',
  pork_free: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M9 12h6"/>',
  balanced: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10v4M12 10v4M16 10v4"/>',
  feel: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"/>',
  adv_high: '<path d="M5 12h12M13 6l6 6-6 6"/>',
  adv_simple: '<path d="M5 8h14M5 12h10M5 16h7"/>',
  adv_routine: '<path d="M12 4a8 8 0 1 1-8 8"/><path d="M4 6v4h4"/>',
  pace_gentle: '<path d="M4 13a8 8 0 0 1 16 0"/><circle cx="12" cy="13" r="1"/>',
  pace_mid: '<path d="M4 15h16M8 15v-4M12 15V8M16 15v-2"/>',
  pace_push: '<path d="M13 2 6 13h5l-1 9 8-12h-5z"/>',
  // Training-experience levels (page 6)
  sprout: '<path d="M12 21v-7"/><path d="M12 14c-3 0-5-1.8-5-4.6C10 9.4 12 11.2 12 14z"/><path d="M12 12.5c0-3 2-5 5.2-5 0 3-2.2 5-5.2 5z"/>',
  cycle: '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9"/><path d="M20 4.5V9h-4.5"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15"/><path d="M4 19.5V15h4.5"/>',
  steps: '<path d="M4 19h4v-4h4v-4h4v-4h4"/>',
  peak: '<path d="M3 20l5-11 3.5 6 2.5-4 7 9z"/>',
  // Daily-activity levels (page 7)
  desk: '<path d="M3 9h18"/><path d="M6 9v9M18 9v9"/><rect x="9" y="3.4" width="6" height="4.4" rx="1"/><path d="M12 7.8V9"/>',
  walk: '<circle cx="13" cy="4.4" r="1.5"/><path d="M13 7l-1.6 4 .6 3.5-2 5"/><path d="M11.4 11l4 1.4 1.6 4"/>',
  run: '<circle cx="14.5" cy="4.4" r="1.5"/><path d="M5 13.5l4-1.2 3 1.8 1.4 4"/><path d="M12 7.2l-3 5.1"/><path d="M12.6 9.3l4 1 2.4-2.2"/>',
  lift: '<path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10"/>',
  // Eater-type openers (Fuel "for everyone" first screen)
  count_macros: '<path d="M4 20h16"/><path d="M6.5 20v-6M12 20V6M17.5 20v-9"/>',
  cut_sugar: '<rect x="5" y="9" width="10" height="10" rx="1.6"/><path d="M4.5 5l15 14"/><path d="M17 7.5h.01M19.5 11h.01"/>',
  fast_food: '<path d="M4 11a8 4.5 0 0 1 16 0z"/><path d="M4.5 14.2h15"/><path d="M6 17h12a2.4 2.4 0 0 1-2.4 2.2H8.4A2.4 2.4 0 0 1 6 17z"/>',
  hydrate: '<path d="M12 3c4 5 6.2 8 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 11 8 8 12 3z"/><path d="M9.5 14.6a2.6 2.6 0 0 0 2.4 2.2"/>',
}

export default function NutritionIcon({ name }: { name: NutritionIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  )
}
