'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from '../auth.module.css'

/**
 * Forgot password — kicks off Supabase's reset-password email flow.
 * On success we show a confirmation message (don't redirect — leaving
 * the user on this page is the clearest signal "we sent it").
 *
 * The email link lands at /reset-password where they pick a new pwd.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <>
      <h1 className={styles.heading}>Reset your password</h1>
      <p className={styles.subhead}>
        <em>We&apos;ll email you a link.</em>
      </p>

      {sent ? (
        <div className={styles.success}>
          <em>Check your inbox at <strong>{email}</strong>.</em>
          <br />
          If we have an account for that address, the reset link is on the way.
          It usually arrives within a minute.
        </div>
      ) : (
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

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.primaryBtn} type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className={styles.footer}>
        Remembered it? <Link href="/login" className={styles.link}>Sign in</Link>
      </p>
    </>
  )
}
