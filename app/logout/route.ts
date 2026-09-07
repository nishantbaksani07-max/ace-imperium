import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

// GET /logout
//
// One-step sign out. Bookmarkable. Signs the user out via Supabase
// (which clears the session cookies) then 302-redirects to /login.
//
// Used most heavily during testing for switching between accounts
// without clicking through /account → bottom of page → Sign out.
// Production users hit it too if they ever paste /logout into the URL
// bar, which is a perfectly fine sign-out path.
export async function GET(request: Request) {
  const supabase = createClient()
  await supabase.auth.signOut()

  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/login`, { status: 302 })
}
