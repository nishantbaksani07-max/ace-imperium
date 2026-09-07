// Curated drinks catalog for the Fuel "Drinks library" (the beverage twin of
// the common-foods catalog). Every drink carries real-world `sizes` for a
// one-tap log — the size cards each show a relatable real-world anchor (see
// `sizeAnchor` in DrinksLibrary) so "330 ml" reads as "a soda can". Water lives
// in its own section (·04), so it is intentionally NOT a drink here. Pure data
// + helpers — no React, no I/O.

import type { Macros } from './types'

export type DrinkCategoryId =
  | 'soda' | 'coffee' | 'juice' | 'energy' | 'alcohol' | 'milk'

export type DrinkGlyph = 'can' | 'cup' | 'glass' | 'bolt' | 'bottle'

export interface DrinkCategory {
  id: DrinkCategoryId
  name: string
  /** muted premium tint (matches the food catalog's restraint; mint stays brand) */
  tint: string
  glyph: DrinkGlyph
}

export interface DrinkSizeOption {
  label: string
  ml: number
  kcal: number
  /** Full macros if known; drinks usually track calories only. */
  macros?: Macros
}

export interface CatalogDrink {
  id: string
  name: string
  category: DrinkCategoryId
  /** real-world sizes — every drink has at least one (the one-tap log) */
  sizes: DrinkSizeOption[]
}

export const DRINK_CATEGORIES: DrinkCategory[] = [
  { id: 'soda',    name: 'Soda',           tint: '#e0b877', glyph: 'can' },
  { id: 'coffee',  name: 'Coffee & tea',   tint: '#cdb08a', glyph: 'cup' },
  { id: 'juice',   name: 'Juice',          tint: '#e8a878', glyph: 'glass' },
  { id: 'energy',  name: 'Energy & sport', tint: '#b9a6e6', glyph: 'bolt' },
  { id: 'alcohol', name: 'Alcohol',        tint: '#d695a6', glyph: 'bottle' },
  { id: 'milk',    name: 'Milk & alt',     tint: '#e6d3a3', glyph: 'glass' },
]

const sz = (label: string, ml: number, kcal: number): DrinkSizeOption => ({ label, ml, kcal })

export const DRINK_CATALOG: CatalogDrink[] = [
  // ── soda ──
  { id: 'coca-cola',     name: 'Coca-Cola',     category: 'soda', sizes: [sz('Can', 330, 139), sz('Bottle', 500, 210), sz('Large', 600, 252)] },
  { id: 'coke-zero',     name: 'Coke Zero',     category: 'soda', sizes: [sz('Can', 330, 0), sz('Bottle', 500, 0)] },
  { id: 'diet-coke',     name: 'Diet Coke',     category: 'soda', sizes: [sz('Can', 330, 1), sz('Bottle', 500, 2)] },
  { id: 'pepsi',         name: 'Pepsi',         category: 'soda', sizes: [sz('Can', 330, 150), sz('Bottle', 500, 227)] },
  { id: 'sprite',        name: 'Sprite',        category: 'soda', sizes: [sz('Can', 330, 139), sz('Bottle', 500, 210)] },
  { id: 'dr-pepper',     name: 'Dr Pepper',     category: 'soda', sizes: [sz('Can', 330, 150), sz('Bottle', 500, 227)] },
  { id: 'mountain-dew',  name: 'Mountain Dew',  category: 'soda', sizes: [sz('Can', 330, 145), sz('Bottle', 500, 220)] },
  { id: 'fanta',         name: 'Fanta Orange',  category: 'soda', sizes: [sz('Can', 330, 160), sz('Bottle', 500, 240)] },
  { id: 'root-beer',     name: 'Root beer',     category: 'soda', sizes: [sz('Can', 330, 152), sz('Bottle', 500, 230)] },
  { id: 'ginger-ale',    name: 'Ginger ale',    category: 'soda', sizes: [sz('Can', 330, 124), sz('Bottle', 500, 188)] },
  { id: 'seven-up',      name: '7 Up',          category: 'soda', sizes: [sz('Can', 330, 140), sz('Bottle', 500, 210)] },

  // ── coffee & tea ──
  { id: 'coffee-black',   name: 'Coffee, black',  category: 'coffee', sizes: [sz('Small', 240, 2), sz('Medium', 350, 4), sz('Large', 470, 5)] },
  { id: 'latte',          name: 'Latte',          category: 'coffee', sizes: [sz('Tall', 350, 150), sz('Grande', 470, 190), sz('Venti', 590, 250)] },
  { id: 'cappuccino',     name: 'Cappuccino',     category: 'coffee', sizes: [sz('Small', 240, 80), sz('Medium', 350, 120)] },
  { id: 'flat-white',     name: 'Flat white',     category: 'coffee', sizes: [sz('Small', 240, 170), sz('Medium', 350, 220)] },
  { id: 'americano',      name: 'Americano',      category: 'coffee', sizes: [sz('Small', 240, 10), sz('Large', 470, 15)] },
  { id: 'espresso',       name: 'Espresso',       category: 'coffee', sizes: [sz('Single', 30, 5), sz('Double', 60, 10)] },
  { id: 'iced-coffee',    name: 'Iced coffee',    category: 'coffee', sizes: [sz('Tall', 350, 80), sz('Grande', 470, 110)] },
  { id: 'cold-brew',      name: 'Cold brew',      category: 'coffee', sizes: [sz('Tall', 350, 5), sz('Grande', 470, 7)] },
  { id: 'mocha',          name: 'Mocha',          category: 'coffee', sizes: [sz('Tall', 350, 290), sz('Grande', 470, 360)] },
  { id: 'matcha-latte',   name: 'Matcha latte',   category: 'coffee', sizes: [sz('Tall', 350, 200), sz('Grande', 470, 240)] },
  { id: 'hot-chocolate',  name: 'Hot chocolate',  category: 'coffee', sizes: [sz('Small', 350, 280), sz('Large', 470, 370)] },
  { id: 'green-tea',      name: 'Green tea',      category: 'coffee', sizes: [sz('Cup', 240, 0), sz('Mug', 350, 0), sz('Large', 470, 0)] },
  { id: 'iced-sweet-tea', name: 'Iced sweet tea', category: 'coffee', sizes: [sz('Small', 350, 105), sz('Large', 470, 141)] },

  // ── juice ──
  { id: 'orange-juice',    name: 'Orange juice',    category: 'juice', sizes: [sz('Glass', 240, 112), sz('Cup', 350, 163)] },
  { id: 'apple-juice',     name: 'Apple juice',     category: 'juice', sizes: [sz('Glass', 240, 114), sz('Box', 200, 96)] },
  { id: 'grape-juice',     name: 'Grape juice',     category: 'juice', sizes: [sz('Glass', 240, 152)] },
  { id: 'pineapple-juice', name: 'Pineapple juice', category: 'juice', sizes: [sz('Glass', 240, 130)] },
  { id: 'cranberry-juice', name: 'Cranberry juice', category: 'juice', sizes: [sz('Glass', 240, 116)] },
  { id: 'lemonade',        name: 'Lemonade',        category: 'juice', sizes: [sz('Glass', 250, 99), sz('Large', 400, 158)] },
  { id: 'smoothie',        name: 'Smoothie',        category: 'juice', sizes: [sz('Small', 350, 220), sz('Large', 500, 320)] },
  { id: 'veggie-juice',    name: 'Vegetable juice', category: 'juice', sizes: [sz('Glass', 240, 50)] },

  // ── energy & sport ──
  { id: 'red-bull',     name: 'Red Bull',     category: 'energy', sizes: [sz('Can', 250, 112), sz('Big can', 355, 160)] },
  { id: 'monster',      name: 'Monster',      category: 'energy', sizes: [sz('Can', 500, 210)] },
  { id: 'celsius',      name: 'Celsius',      category: 'energy', sizes: [sz('Can', 355, 10)] },
  { id: 'bang',         name: 'Bang',         category: 'energy', sizes: [sz('Can', 473, 0)] },
  { id: 'alani-nu',     name: 'Alani Nu',     category: 'energy', sizes: [sz('Can', 355, 15)] },
  { id: 'rockstar',     name: 'Rockstar',     category: 'energy', sizes: [sz('Can', 500, 250)] },
  { id: 'prime',        name: 'Prime Energy', category: 'energy', sizes: [sz('Bottle', 500, 20)] },
  { id: 'gatorade',     name: 'Gatorade',     category: 'energy', sizes: [sz('Bottle', 590, 140), sz('Small', 350, 80)] },
  { id: 'powerade',     name: 'Powerade',     category: 'energy', sizes: [sz('Bottle', 590, 130)] },
  { id: 'bodyarmor',    name: 'BodyArmor',    category: 'energy', sizes: [sz('Bottle', 470, 90)] },
  { id: 'vitamin-water', name: 'Vitamin Water', category: 'energy', sizes: [sz('Bottle', 590, 120)] },

  // ── alcohol ──
  { id: 'beer',         name: 'Beer',         category: 'alcohol', sizes: [sz('Bottle', 355, 153), sz('Pint', 473, 204)] },
  { id: 'light-beer',   name: 'Light beer',   category: 'alcohol', sizes: [sz('Bottle', 355, 103), sz('Pint', 473, 137)] },
  { id: 'ipa',          name: 'IPA',          category: 'alcohol', sizes: [sz('Bottle', 355, 210), sz('Pint', 473, 280)] },
  { id: 'cider',        name: 'Cider',        category: 'alcohol', sizes: [sz('Bottle', 355, 160), sz('Pint', 473, 210)] },
  { id: 'red-wine',     name: 'Red wine',     category: 'alcohol', sizes: [sz('Glass', 148, 125), sz('Large', 250, 211)] },
  { id: 'white-wine',   name: 'White wine',   category: 'alcohol', sizes: [sz('Glass', 148, 121), sz('Large', 250, 204)] },
  { id: 'champagne',    name: 'Champagne',    category: 'alcohol', sizes: [sz('Glass', 150, 130)] },
  { id: 'white-claw',   name: 'White Claw',   category: 'alcohol', sizes: [sz('Can', 355, 100)] },
  { id: 'margarita',    name: 'Margarita',    category: 'alcohol', sizes: [sz('Glass', 200, 280)] },
  { id: 'gin-tonic',    name: 'Gin & tonic',  category: 'alcohol', sizes: [sz('Glass', 250, 180)] },
  { id: 'rum-coke',     name: 'Rum & Coke',   category: 'alcohol', sizes: [sz('Glass', 250, 185)] },
  { id: 'vodka',        name: 'Vodka',        category: 'alcohol', sizes: [sz('Shot', 44, 97)] },
  { id: 'whiskey',      name: 'Whiskey',      category: 'alcohol', sizes: [sz('Shot', 44, 97)] },
  { id: 'tequila',      name: 'Tequila',      category: 'alcohol', sizes: [sz('Shot', 44, 97)] },

  // ── milk & alt ──
  { id: 'whole-milk',       name: 'Whole milk',     category: 'milk', sizes: [sz('Glass', 240, 149)] },
  { id: 'two-percent-milk', name: '2% milk',        category: 'milk', sizes: [sz('Glass', 240, 122)] },
  { id: 'skim-milk',        name: 'Skim milk',      category: 'milk', sizes: [sz('Glass', 240, 83)] },
  { id: 'oat-milk',         name: 'Oat milk',       category: 'milk', sizes: [sz('Glass', 240, 120)] },
  { id: 'almond-milk',      name: 'Almond milk',    category: 'milk', sizes: [sz('Glass', 240, 40)] },
  { id: 'soy-milk',         name: 'Soy milk',       category: 'milk', sizes: [sz('Glass', 240, 100)] },
  { id: 'chocolate-milk',   name: 'Chocolate milk', category: 'milk', sizes: [sz('Glass', 240, 208)] },
  { id: 'eggnog',           name: 'Eggnog',         category: 'milk', sizes: [sz('Glass', 240, 340)] },
  { id: 'protein-shake',    name: 'Protein shake',  category: 'milk', sizes: [sz('Bottle', 350, 160), sz('Scoop + water', 300, 120)] },
]

export function drinksByCategory(id: DrinkCategoryId): CatalogDrink[] {
  return DRINK_CATALOG.filter((d) => d.category === id)
}

export function searchDrinks(query: string): CatalogDrink[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  return DRINK_CATALOG.filter((d) => d.name.toLowerCase().includes(q))
}

export function drinkCategory(id: DrinkCategoryId): DrinkCategory {
  return DRINK_CATEGORIES.find((c) => c.id === id) || DRINK_CATEGORIES[0]
}
