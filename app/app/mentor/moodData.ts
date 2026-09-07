// Pure mood helpers. Mood is stored as a user_facts row (no new table) so Vee
// reads it everywhere. body is human-readable AND parseable for the 7-day strip.

export const MOOD_SOURCE = 'mental_health'
export const MOOD_KIND = 'mood'

export interface MoodLevel { score: number; label: string }

// 1 = rough .. 5 = great. Low end is calm, never red (color law lives in CSS).
export const MOOD_LEVELS: MoodLevel[] = [
  { score: 1, label: 'rough' },
  { score: 2, label: 'low' },
  { score: 3, label: 'okay' },
  { score: 4, label: 'good' },
  { score: 5, label: 'great' },
]

export function moodLabel(score: number): string {
  return MOOD_LEVELS.find(m => m.score === score)?.label ?? 'okay'
}

export function formatMoodBody(score: number): string {
  return `Mood today: ${score}/5 (${moodLabel(score)})`
}

export function parseMoodScore(body: string): number | null {
  const m = body.match(/Mood today: (\d)\/5/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 5 ? n : null
}

/** Local YYYY-MM-DD (never toISOString, to avoid UTC drift). */
export function localDateKey(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * The USER'S local day key for a timestamp, computed server-side from the
 * client's own timezone offset (Date#getTimezoneOffset: minutes to ADD to local
 * time to reach UTC). The server clock is UTC on Vercel, so keying mood days by
 * the server's localDateKey lands an evening tap on tomorrow for anyone west of
 * UTC; this keeps the day boundary where the user actually lives.
 */
export function localDateKeyAt(iso: string, tzOffsetMin: number): string {
  const d = new Date(new Date(iso).getTime() - tzOffsetMin * 60000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export interface MoodPoint { dayKey: string; score: number | null }
export interface RawMoodFact { body: string; createdAt: string }

/**
 * Build the last `days` day-slots, oldest first, ending at todayKey. Each slot
 * holds the latest mood logged that local day (or null if none). `facts` must be
 * newest-first (as readFacts returns them) so the first seen per day wins.
 */
export function buildMoodStrip(facts: RawMoodFact[], todayKey: string, days = 7): MoodPoint[] {
  const byDay = new Map<string, number>()
  for (const f of facts) {
    const key = localDateKey(f.createdAt)
    if (!byDay.has(key)) {
      const s = parseMoodScore(f.body)
      if (s != null) byDay.set(key, s)
    }
  }
  const out: MoodPoint[] = []
  const base = new Date(`${todayKey}T12:00:00`)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key = localDateKey(d)
    out.push({ dayKey: key, score: byDay.get(key) ?? null })
  }
  return out
}
