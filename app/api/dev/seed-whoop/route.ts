import { createClient } from '@/lib/supabase/server'

/**
 * Dev/preview seeder: inserts N days of fake WHOOP-shaped rows for the current
 * user so the goal loop can be exercised end to end. Guarded by SEED_KEY so it
 * can't be triggered casually. Only ever writes the caller's own rows (RLS).
 *   GET /api/dev/seed-whoop?key=<SEED_KEY>&days=21&trend=up
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!process.env.SEED_KEY || url.searchParams.get('key') !== process.env.SEED_KEY) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days') ?? 21)))
  const trend = url.searchParams.get('trend') === 'down' ? -1 : 1

  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const ramp = trend * i * 1.2 // gentle climb/decline across the window
    return {
      user_id: user.id, provider: 'whoop', date: key,
      recovery: Math.round(Math.min(95, Math.max(20, 52 + ramp))),
      hrv: Math.round(Math.min(120, Math.max(20, 48 + ramp))),
      rhr: Math.round(Math.max(40, 60 - ramp * 0.2)),
      sleep_perf: Math.round(Math.min(99, Math.max(50, 78 + ramp * 0.4))),
      sleep_hours: Math.min(9, Math.max(5, 6.6 + ramp * 0.03)),
      strain: Math.min(20, Math.max(4, 9 + (i % 5))),
    }
  })

  const { error } = await supabase.from('wearable_data').upsert(rows, { onConflict: 'user_id,date,provider' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, seeded: rows.length, latest: rows[rows.length - 1] })
}
