'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import styles from './error.module.css'

/**
 * Error boundary for every gated module under /app/*. Next.js renders this
 * instead of a white-screen crash when a child page (or its server data fetch)
 * throws. "Try again" calls reset() to re-render the segment — usually enough
 * for a transient Supabase/network blip. We log so Sentry's instrumentation
 * still captures the underlying error.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className={`${styles.wrap} grain-overlay`}>
      <div className={styles.card}>
        <div className={styles.glyph} aria-hidden>⚠</div>
        <h1 className={styles.title}>Something hiccuped</h1>
        <p className={styles.body}>
          This screen didn’t load — usually a brief network blip. Try again, or
          head back to your dashboard.
        </p>
        <div className={styles.actions}>
          <button onClick={reset} className="btn btn-primary">Try again</button>
          <Link href="/app" className="btn btn-link">Back to dashboard</Link>
        </div>
      </div>
    </main>
  )
}
