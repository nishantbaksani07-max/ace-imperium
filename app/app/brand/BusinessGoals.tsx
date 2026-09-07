'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import { useNow } from './deadlines'
import type { Brand, BrandGoal } from './types'
import type { BrandActions } from './state'

/**
 * Business goals — milestones with optional due-date timers. Sits on the
 * Business tab between the AI mentor and the website button.
 *
 * A goal is bigger and slower than a Schedule (a recurring cadence) or a KPI (a
 * single tracked number): "hit $10k MRR", "ship the new site", "land 3 clients
 * by March". Give it a due date and the card shows a live days-left countdown
 * that warms from muted to red as the deadline approaches and goes past.
 *
 * Checkbox marks it done (struck through, sorted to the bottom). Persisted on
 * the brand via the goal actions in state.ts -> localStorage + Supabase mirror.
 */

type Tone = 'far' | 'soon' | 'today' | 'over' | 'done'

interface DueInfo { label: string; tone: Tone }

/** Day-granularity countdown from a `YYYY-MM-DD` due date. */
function dueInfo(due: string | undefined, now: Date): DueInfo | null {
  if (!due) return null
  const [y, m, d] = due.split('-').map(n => parseInt(n, 10))
  if (!y || !m || !d) return null
  const target = new Date(y, m - 1, d)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000)
  if (days > 1) return { label: `${days} days left`, tone: days <= 7 ? 'soon' : 'far' }
  if (days === 1) return { label: 'due tomorrow', tone: 'soon' }
  if (days === 0) return { label: 'due today', tone: 'today' }
  if (days === -1) return { label: '1 day overdue', tone: 'over' }
  return { label: `${Math.abs(days)} days overdue`, tone: 'over' }
}

/** "Mar 14" from a YYYY-MM-DD key (local, no UTC drift). */
function fmtDue(due: string): string {
  const [y, m, d] = due.split('-').map(n => parseInt(n, 10))
  if (!y || !m || !d) return due
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function BusinessGoals({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  // 60s tick is plenty for a day-granularity countdown.
  const now = useNow(60_000)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  const goals = brand.goals ?? []
  const isEmpty = goals.length === 0

  // Open goals first (soonest due, then undated), completed at the bottom.
  const sorted = [...goals].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.due && b.due) return a.due.localeCompare(b.due)
    if (a.due) return -1
    if (b.due) return 1
    return 0
  })

  function add(e?: React.FormEvent) {
    e?.preventDefault()
    if (!title.trim()) return
    actions.addGoal(brand.id, title, due || undefined)
    setTitle('')
    setDue('')
  }

  return (
    <section className={styles.goalsCard}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·03</span>
          <span className={styles.eyebrowRule} />
          Goals
        </span>
        {!isEmpty && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing(v => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      {isEmpty ? (
        <p className={styles.emptyText}>
          Set a milestone and a deadline. Hit $10k revenue, ship the new site, land 3 clients. The timer keeps it honest.
        </p>
      ) : (
        <ul className={styles.goalList}>
          {sorted.map(g => (
            <GoalRow
              key={g.id}
              goal={g}
              info={dueInfo(g.due, now)}
              editing={editing}
              onToggle={() => actions.toggleGoal(brand.id, g.id)}
              onRemove={() => actions.removeGoal(brand.id, g.id)}
            />
          ))}
        </ul>
      )}

      <form className={styles.goalAddForm} onSubmit={add}>
        <input
          type="text"
          className={styles.goalTitleInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="New goal (e.g. Hit $10k revenue)"
        />
        <input
          type="date"
          className={styles.goalDateInput}
          value={due}
          onChange={e => setDue(e.target.value)}
          aria-label="Due date (optional)"
        />
        <button type="submit" className={styles.accountAddBtn} disabled={!title.trim()}>
          + Add
        </button>
      </form>
    </section>
  )
}

function GoalRow({
  goal, info, editing, onToggle, onRemove,
}: {
  goal: BrandGoal
  info: DueInfo | null
  editing: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const tone: Tone = goal.done ? 'done' : (info?.tone ?? 'far')
  return (
    <li className={`${styles.goalRow} ${goal.done ? styles.goalRowDone : ''}`}>
      <button
        type="button"
        className={`${styles.goalCheck} ${goal.done ? styles.goalCheckDone : ''}`}
        onClick={onToggle}
        role="checkbox"
        aria-checked={goal.done}
        aria-label={goal.done ? `Mark "${goal.title}" not done` : `Mark "${goal.title}" done`}
      >
        {goal.done ? '✓' : ''}
      </button>

      <div className={styles.goalBody}>
        <span className={styles.goalTitle}>{goal.title}</span>
        {goal.note && <span className={styles.goalNote}>{goal.note}</span>}
      </div>

      <span
        className={`${styles.goalCountdown} ${styles[`goalTone_${tone}` as keyof typeof styles] ?? ''}`}
        title={goal.due ? `Due ${fmtDue(goal.due)}` : undefined}
      >
        {goal.done ? 'done' : info ? info.label : 'no date'}
      </span>

      {editing && (
        <button
          type="button"
          className={styles.accountDelBtn}
          onClick={onRemove}
          aria-label={`Remove ${goal.title}`}
        >
          ×
        </button>
      )}
    </li>
  )
}
