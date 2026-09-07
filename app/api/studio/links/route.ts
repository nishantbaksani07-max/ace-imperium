import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToLink, validateCreateLink } from '@/app/api/studio/mappers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('studio_links')
    .select('id, video_id, label, url, kind, is_default, position')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: (data ?? []).map(rowToLink) })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const v = validateCreateLink(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (v.value.videoId !== null) {
    const { data: video } = await supabase
      .from('studio_videos')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', v.value.videoId)
      .maybeSingle()
    if (!video) return NextResponse.json({ error: 'video_not_found' }, { status: 404 })
  }
  const { data, error } = await supabase
    .from('studio_links')
    .insert({
      user_id: user.id,
      video_id: v.value.videoId,
      label: v.value.label,
      url: v.value.url,
      kind: v.value.kind,
      is_default: v.value.isDefault,
      position: v.value.position,
    })
    .select('id, video_id, label, url, kind, is_default, position')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 })
  return NextResponse.json({ link: rowToLink(data) })
}
