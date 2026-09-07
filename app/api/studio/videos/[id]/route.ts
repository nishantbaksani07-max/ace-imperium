import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToVideo, validateUpdateVideo } from '@/app/api/studio/mappers'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const v = validateUpdateVideo(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (v.value.title !== undefined) patch.title = v.value.title
  if (v.value.url !== undefined) patch.url = v.value.url
  if (v.value.status !== undefined) patch.status = v.value.status
  if (v.value.publishedAt !== undefined) patch.published_at = v.value.publishedAt
  if (v.value.notes !== undefined) patch.notes = v.value.notes
  if (v.value.extra !== undefined) patch.extra = v.value.extra
  const { data, error } = await supabase
    .from('studio_videos')
    .update(patch)
    .eq('user_id', user.id)
    .eq('id', params.id)
    .select('id, title, url, status, published_at, notes, extra, created_at, updated_at')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'not_found' }, { status: 404 })
  return NextResponse.json({ video: rowToVideo(data) })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { error } = await supabase
    .from('studio_videos')
    .delete()
    .eq('user_id', user.id)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
