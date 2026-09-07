// Client-only image helpers for the photo-capture flow. Downscales a chosen
// File to a JPEG the vision route can accept (and a tiny thumbnail kept on the
// meal). Canvas/DOM only — never imported on the server.

const MAX_IMAGE_DIMENSION = 1568 // Anthropic vision recommended max

export interface EncodedImage {
  base64: string
  mediaType: string
  sizeKb: number
}

function readBlobAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

// Downscale to a max-dimension JPEG. Returns base64 (no data: prefix) + media
// type, ready for the parse-meal route.
export async function resizeAndEncodeImage(
  file: File,
  maxDim = MAX_IMAGE_DIMENSION,
  quality = 0.85
): Promise<EncodedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', quality)
  })
  const dataUrl = await readBlobAsDataURL(blob)
  return {
    base64: dataUrl.split(',')[1] ?? '',
    mediaType: 'image/jpeg',
    sizeKb: Math.round(blob.size / 1024),
  }
}

// A compressed JPEG data URL for a progress photo. Kept comfortably UNDER the
// ~1MB Server Action body default by progressively downscaling until it fits, so
// the upload works on every build (no reliance on the raised bodySizeLimit) and
// can never stall a huge base64 through the action. Returns null on failure.
export async function makeProgressPhoto(file: File): Promise<string | null> {
  try {
    const steps: Array<[number, number]> = [[960, 0.62], [800, 0.56], [640, 0.5]]
    for (const [dim, q] of steps) {
      const t = await resizeAndEncodeImage(file, dim, q)
      const url = `data:${t.mediaType};base64,${t.base64}`
      if (url.length < 850_000) return url // ~850KB, safely under a 1MB cap
    }
    // Last resort: the smallest version, still returned so the user gets a photo.
    const t = await resizeAndEncodeImage(file, 480, 0.48)
    return `data:${t.mediaType};base64,${t.base64}`
  } catch (err) {
    console.warn('[fuel/macros] progress photo encode failed', err)
    return null
  }
}

// A ~640px JPEG data URL (~25-45KB) stored inline on the meal so its card can
// show the photo AND the user can tap it open to look back at what they ate.
// Returns null on failure (the meal just renders without one).
export async function makeThumbnail(file: File): Promise<string | null> {
  try {
    const t = await resizeAndEncodeImage(file, 640, 0.72)
    return `data:${t.mediaType};base64,${t.base64}`
  } catch (err) {
    console.warn('[fuel/macros] thumbnail generation failed', err)
    return null
  }
}
