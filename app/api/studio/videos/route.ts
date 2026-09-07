import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToVideo, validateCreateVideo } from '@/app/api/studio/mappers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('studio_videos')
    .select('id, title, url, status, published_at, notes, extra, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ videos: (data ?? []).map(rowToVideo) })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const v = validateCreateVideo(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await supabase
    .from('studio_videos')
    .insert({ user_id: user.id, title: v.value.title, url: v.value.url })
    .select('id, title, url, status, published_at, notes, extra, created_at, updated_at')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 })
  return NextResponse.json({ video: rowToVideo(data) })
}
