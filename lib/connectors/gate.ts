import 'server-only'

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared auth + tier gate for the connector routes (CLAUDE.md #5: server-side
 * tier checks only). `REQUIRE_PRO` mirrors the brand AI routes' dogfood stance —
 * false now so we can use connectors while building; flip to true to gate behind
 * Pro before launch (the client already handles the 402 → /pricing upsell).
 */
export const REQUIRE_PRO = false

export type Gate = { userId: string } | { error: NextResponse }

export async function gateConnector(supabase: SupabaseClient): Promise<Gate> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') {
      return { error: NextResponse.json({ error: 'requires_pro' }, { status: 402 }) }
    }
  }
  return { userId: user.id }
}
