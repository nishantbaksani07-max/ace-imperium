'use client'

import { useState, useTransition } from 'react'
import { approveTile, rejectTile } from '@/app/app/publishActions'
import styles from './admin.module.css'

/**
 * Approve / Reject controls for one pending tile. Thin client wrapper: the
 * decision is made entirely by the server actions (which re-check isFounder()),
 * this just fires them and reflects the result. On success the row is removed
 * from the queue by the action's revalidatePath('/admin') refresh.
 *
 * If the server returns `needs_rls_policy`, RLS blocked the founder's UPDATE of
 * another creator's row — we say so plainly instead of pretending it worked
 * (the required migration follow-up is tracked in the lane report).
 */
export function ModerationButtons({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)

  function run(kind: 'approved' | 'rejected') {
    setError(null)
    startTransition(async () => {
      const action = kind === 'approved' ? approveTile : rejectTile
      const res = await action(id)
      if (res.ok) {
        setDone(kind)
        return
      }
      setError(
        res.error === 'needs_rls_policy'
          ? 'Blocked by RLS — founders need the update policy migration applied.'
          : res.error === 'not_allowed'
            ? 'Founders only.'
            : 'Could not save. Try again.'
      )
    })
  }

  if (done) {
    return (
      <div className={styles.actions}>
        <span className={`${styles.decided} ${done === 'approved' ? styles.decidedOk : styles.decidedNo}`}>
          {done === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      </div>
    )
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.approve}
        disabled={pending}
        onClick={() => run('approved')}
        aria-label={`Approve ${name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m5 13 4 4L19 7" />
        </svg>
        Approve
      </button>
      <button
        type="button"
        className={styles.reject}
        disabled={pending}
        onClick={() => run('rejected')}
        aria-label={`Reject ${name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
        Reject
      </button>
      {error && <span className={styles.err} role="alert">{error}</span>}
    </div>
  )
}
