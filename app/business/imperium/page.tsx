import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { useState } from 'react'
import MentorChat from '@/components/business/MentorChat'

export const dynamic = 'force-dynamic'

export default async function ImperiumPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <MentorChat />
}
