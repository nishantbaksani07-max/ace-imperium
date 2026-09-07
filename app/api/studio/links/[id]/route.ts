import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToLink, validateUpdateLink } from '@/app/api/studio/mappers'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const v = validateUpdateLink(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (v.value.label !== undefined) patch.label = v.value.label
  if (v.value.url !== undefined) patch.url = v.value.url
  if (v.value.kind !== undefined) patch.kind = v.value.kind
  if (v.value.isDefault !== undefined) patch.is_default = v.value.isDefault
  if (v.value.position !== undefined) patch.position = v.value.position
  const { data, error } = await supabase
    .from('studio_links')
    .update(patch)
    .eq('user_id', user.id)
    .eq('id', params.id)
    .select('id, video_id, label, url, kind, is_default, position')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'not_found' }, { status: 404 })
  return NextResponse.json({ link: rowToLink(data) })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { error } = await supabase
    .from('studio_links')
    .delete()
    .eq('user_id', user.id)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
