'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/auth/safe-next'
import styles from './auth.module.css'

type Mode = 'signin' | 'signup'

export default function AuthForm({ initialMode }: { initialMode: Mode }) {
  const router = useRouter()
  // Post-login return path (e.g. the MCP OAuth /authorize bounce). Read from the
  // URL on the client only — avoids useSearchParams' static-render Suspense
  // requirement on /login + /signup. Used solely in handlers (never rendered),
  // so there is no hydration mismatch. Same-origin relative paths only.
  const [nextPath] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return safeNextPath(new URLSearchParams(window.location.search).get('next'))
  })
  const nextSuffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  // Reset oauthLoading when the user returns to the tab without completing the
  // Google flow. If OAuth had succeeded, Supabase would've redirected away —
  // being back here with the button stuck means the user bailed.
  useEffect(() => {
    if (!oauthLoading) return
    function onFocus() {
      setTimeout(() => setOauthLoading(false), 600)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [oauthLoading])

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    // Keep URL in sync so refresh/back-button match what's on screen and so
    // deep links to /login or /signup still land on the right tab. Preserve any
    // `next` so switching tabs mid-OAuth doesn't drop the return path.
    router.replace((next === 'signin' ? '/login' : '/signup') + nextSuffix)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (nextPath) {
        // The OAuth `next` target is a Route Handler (/api/mcp/oauth/authorize),
        // not a page — client-side router.push() issues an RSC navigation the
        // handler 405s on. A hard navigation does a real GET (carrying the fresh
        // session cookie) so /authorize sees the session and mints the code.
        window.location.href = nextPath
        return
      }
      // Push to /app unconditionally — middleware reads the committed session
      // cookie on the next request and applies the onboarded redirect matrix. A
      // client-side profile read here races the cookie flush in @supabase/ssr
      // and silently returns null, sending onboarded users to /onboarding.
      router.push('/app')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // A fresh email signup must still walk onboarding first, but the place
      // they came FROM (a shared set/tile link, an OAuth authorize) used to be
      // dropped here - the one funnel leg that lost ?next. Stash it; the
      // dashboard consumes it once after onboarding lands the user at /app.
      if (nextPath) {
        try {
          localStorage.setItem('vitality:next-after-onboarding', nextPath)
        } catch {
          /* storage blocked: signup proceeds, they just land on /app */
        }
      }
      router.push('/onboarding')
      router.refresh()
    }
  }

  async function handleGoogle() {
    setOauthLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${nextSuffix}`,
      },
    })
    if (error) {
      setError(error.message)
      setOauthLoading(false)
    }
  }

  const isSignin = mode === 'signin'

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Sign in or create account">
        <button
          type="button"
          role="tab"
          aria-selected={isSignin}
          className={`${styles.tab} ${isSignin ? styles.tabActive : ''}`}
          onClick={() => switchMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isSignin}
          className={`${styles.tab} ${!isSignin ? styles.tabActive : ''}`}
          onClick={() => switchMode('signup')}
        >
          Create account
        </button>
      </div>

      <h1 className={styles.heading}>
        {isSignin ? 'Sign in to Vitality' : 'Create your account'}
      </h1>
      <p className={styles.subhead}>
        <em>{isSignin ? 'Welcome back.' : 'One member, one ledger.'}</em>
      </p>

      <button
        type="button"
        className={styles.oauthBtn}
        onClick={handleGoogle}
        disabled={oauthLoading || loading}
      >
        <GoogleGlyph />
        <span>{oauthLoading ? 'Connecting…' : 'Continue with Google'}</span>
      </button>

      <div className={styles.divider} aria-hidden>
        <span>or</span>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            id="email"
            className={styles.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="password">Password</label>
            {isSignin && (
              <Link href="/forgot-password" className={styles.forgotLink}>
                <em>Forgot?</em>
              </Link>
            )}
          </div>
          <div className={styles.passwordRow}>
            <input
              id="password"
              className={styles.input}
              type={showPassword ? 'text' : 'password'}
              placeholder={isSignin ? '••••••••' : 'At least 8 characters'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isSignin ? 'current-password' : 'new-password'}
              minLength={isSignin ? undefined : 8}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffGlyph /> : <EyeGlyph />}
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.primaryBtn} type="submit" disabled={loading || oauthLoading}>
          {loading
            ? (isSignin ? 'Signing in…' : 'Creating account…')
            : (isSignin ? 'Sign in' : 'Create account')}
        </button>
      </form>
    </>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function EyeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  )
}

function EyeOffGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 2l12 12"/>
      <path d="M4.4 4.4C2.6 5.6 1 8 1 8s2.5 5 7 5c1.4 0 2.7-.5 3.7-1.1"/>
      <path d="M14.4 11.1C14.8 10.7 15 8 15 8s-2.5-5-7-5c-.6 0-1.2.1-1.7.3"/>
      <path d="M6.5 6.5a2 2 0 002.5 2.5"/>
    </svg>
  )
}
