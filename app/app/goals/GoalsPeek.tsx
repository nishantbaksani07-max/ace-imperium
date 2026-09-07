import Link from 'next/link'
import styles from './goalsPeek.module.css'
import CategoryIcon from './CategoryIcon'
import { CATEGORY_WORD } from '@/lib/goals/categories'
import type { MentorGoal } from '@/app/app/mentor/types'

/**
 * GoalsPeek — the "Your goals" presence INSIDE the Vee tab (BUILD42/47). Goals
 * are housed in Vee, so this is the in-tab home: a cozy invitation when empty,
 * and tagged + cleaned goal cards that pop once you have them. Full surface at
 * /app/goals. Presentational only; the mentor page reads the goals server-side.
 */

function fmtDate(date: string | null): string | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const VMark = ({ size = 16 }: { size?: number }) => (
  <span className={styles.vmark} aria-hidden>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7l7 11 7-11" /></svg>
  </span>
)

export default function GoalsPeek({ goals }: { goals: MentorGoal[] }) {
  return (
    <section className={styles.peek} aria-label="your goals">
      <div className={styles.head}>
        <VMark />
        <span className={styles.lbl}>Your goals</span>
        <span className={styles.rule} />
        {goals.length > 0 && (
          <Link href="/app/goals" className={styles.open}>
            Open
            <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M-7 0 H7 M2 -5 L7 0 L2 5" /></svg>
          </Link>
        )}
      </div>

      {goals.length === 0 ? (
        <Link href="/app/goals" className={styles.invite}>
          <span className={styles.inviteGlyph}>
            <svg width="24" height="24" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2 Z" /></svg>
          </span>
          <span className={styles.inviteBody}>
            <span className={styles.invitePrompt}>What are you working toward?</span>
            <span className={styles.inviteAdd}>
              <svg width="13" height="13" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>
              Set your first goal
            </span>
          </span>
        </Link>
      ) : (
        <div className={styles.rows}>
          {goals.map(g => {
            const d = fmtDate(g.targetDate)
            return (
              <Link key={g.id} href="/app/goals" className={styles.goal}>
                {g.category
                  ? <span className={styles.goalIcon}><CategoryIcon category={g.category} size={22} /></span>
                  : <span className={styles.goalIconPlaceholder} aria-hidden />}
                <span className={styles.goalBody}>
                  {g.category && <span className={styles.goalCat}>{CATEGORY_WORD[g.category]}</span>}
                  <span className={styles.goalTitle}>{g.cleanTitle ?? g.title}</span>
                  {d && <span className={styles.goalMeta}>by {d}</span>}
                </span>
                <span className={styles.pips} aria-hidden>
                  {[1, 2, 3].map(i => <span key={i} className={`${styles.pip} ${i <= g.priority ? styles.pipOn : ''}`} style={{ height: `${7 + i * 4}px` }} />)}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
