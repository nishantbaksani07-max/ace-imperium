import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() must be awaited before any DB query. It establishes the auth
  // context by validating the JWT with Supabase Auth and refreshing the
  // session token if needed (via setAll above). Per @supabase/ssr docs,
  // nothing should run between createServerClient and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  // Match the route group exactly — NOT a bare startsWith('/app'), which also
  // catches '/apple-icon' (the metadata icon route) and wrongly gates it.
  const isProtected =
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname === '/welcome'
  const isOnboarding = pathname === '/onboarding'
  const isWelcome = pathname === '/welcome'
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (!user) {
    if (isProtected || isOnboarding) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Skip profile query on public routes — no redirect decision needed
  if (!isProtected && !isOnboarding && !isAuthPage) {
    return supabaseResponse
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single()

  if (profileError !== null || profile === null) {
    // Profile read failed — can't confirm onboarded status.
    // For protected routes (/app, /account): redirect to /onboarding.
    //   A non-onboarded user reaching /app is a real bug.
    //   An onboarded user landing on /onboarding is a minor inconvenience —
    //   the onboarding page immediately bounces them back to /app.
    // For other routes (/onboarding, /login, /signup): pass through — not a risk.
    if (isProtected) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const { onboarded } = profile

  if (isProtected && !onboarded) {
    // /welcome's page-level check also bounces non-onboarded users to
    // /onboarding (it needs a name to greet), so this redirect is just
    // belt-and-braces. /app and /account still need the onboarding gate.
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  // Quiet the unused-var lint — kept as a named flag for readability
  // in the redirect logic above.
  void isWelcome

  if (isOnboarding && onboarded) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  // Only redirect from /login and /signup when already signed in. Leave
  // /forgot-password and /reset-password reachable — a logged-in user on
  // /reset-password is actually expected (Supabase signs them in with a
  // temporary recovery session via the email link) and bouncing them away
  // would break the flow.
  const shouldRedirectFromAuth = pathname === '/login' || pathname === '/signup'
  if (shouldRedirectFromAuth) {
    const url = request.nextUrl.clone()
    url.pathname = onboarded ? '/app' : '/onboarding'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
