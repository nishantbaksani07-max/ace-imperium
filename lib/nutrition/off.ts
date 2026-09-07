// Open Food Facts (barcode) client. Free, no-auth, 3M+ products. We still
// proxy it through a server route for consistency + future caching, even
// though it needs no key.

import type { Macros, OffMatch } from './types'

const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/'

interface OffProduct {
  product_name?: string
  code?: string
  image_front_thumb_url?: string
  nutriments?: Record<string, unknown>
}

export function offMacrosPer100g(product: OffProduct | null): Macros {
  const n = (product && product.nutriments) || {}
  // OFF normalizes everything per 100g — these field names are stable.
  return {
    kcal: Number(n['energy-kcal_100g']) || 0,
    protein: Number(n['proteins_100g']) || 0,
    carbs: Number(n['carbohydrates_100g']) || 0,
    fat: Number(n['fat_100g']) || 0,
  }
}

// Looks up a product by barcode. Returns null when not found (OFF status 0).
export async function fetchOffProduct(barcode: string): Promise<OffMatch | null> {
  const safe = String(barcode).replace(/[^0-9]/g, '')
  if (!safe) return null
  const res = await fetch(`${OFF_PRODUCT_URL}${safe}.json`)
  if (!res.ok) throw new Error(`OFF API ${res.status}`)
  const data = await res.json()
  if (data.status !== 1) return null
  const product: OffProduct = data.product || {}
  const per100 = offMacrosPer100g(product)
  // A product can exist in OFF with no usable nutrition. Treat that as
  // not-found rather than letting the user log an empty 0-kcal meal.
  if (per100.kcal === 0 && per100.protein === 0 && per100.carbs === 0 && per100.fat === 0) {
    return null
  }
  const name = (product.product_name || '').trim() || product.code || 'Scanned product'
  return {
    name,
    code: product.code || null,
    thumbnail: product.image_front_thumb_url || null,
    per100,
  }
}
