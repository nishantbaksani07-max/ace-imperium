'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from '../auth.module.css'

/**
 * Reset password — the landing page from the email link Supabase
 * sends. The link includes a recovery token in the URL hash which
 * @supabase/ssr exchanges into a temporary session, allowing
 * `updateUser({ password })` to succeed without a current password.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords don’t match.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <>
      <h1 className={styles.heading}>Set a new password</h1>
      <p className={styles.subhead}>
        <em>You&apos;re back in once it&apos;s saved.</em>
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">New password</label>
          <div className={styles.passwordRow}>
            <input
              id="password"
              className={styles.input}
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
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

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm">Confirm</label>
          <input
            id="confirm"
            className={styles.input}
            type={showPassword ? 'text' : 'password'}
            placeholder="Repeat the password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.primaryBtn} type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>

      <p className={styles.footer}>
        Changed your mind? <Link href="/login" className={styles.link}>Sign in</Link>
      </p>
    </>
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
