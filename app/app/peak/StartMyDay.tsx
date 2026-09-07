'use client'

/**
 * "Start my day" (BUILD71) — a soft, once-per-day morning gate that opens Peak
 * before the tracker. Two screens:
 *
 *   1. Briefing — your read for the day, pulled from what Peak already knows:
 *      Recovery/Sleep/Strain (the same `<PeakScores>` band), today's peak
 *      window (from `findPeakWindows`), the things you've committed to ship
 *      (brand posting deadlines + your workout), and the one-line coach take
 *      (`buildToday`'s hero).
 *   2. Plan — type your non-negotiables (each pinned into a peak window via the
 *      schedule's natural-language add) and accept a couple of recommended
 *      blocks that auto-place on today's strong windows.
 *
 * Gating lives in PeakModule: this renders only when `lastPlannedDate` isn't
 * today, and both "Plan" actions + "Skip" call `onClose`, which marks the day
 * planned (localStorage only — no backend). It's a *soft* gate: a single tap
 * dismisses it for the day.
 */

import { useMemo, useState } from 'react'
import styles from './peak.module.css'
import { fmtHourLabel } from './curve'
import type { PeakWindow } from './types'
import type { PostingDeadline } from './usePostingDeadlines'

interface Props {
  /** Today's strongest windows (sorted by avg score), from findPeakWindows. */
  windows: PeakWindow[]
  /** Single best hour — the fallback when no formal window cleared threshold. */
  bestHour: number
  deadlines: PostingDeadline[]
  trainedToday: boolean
  workoutSets: number
  /** The coach line from buildToday() — title + supporting body. */
  hero: { title: string; body: string }
  /** schedule.handleAdd — parses a natural-language line onto today's curve. */
  onAddItem: (raw: string) => void
  /** Marks the day planned + dismisses the gate (used by Skip and Start). */
  onClose: () => void
}

/** Minutes-after-midnight → "6:00 PM". */
function fmtMinute(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  youtube_long: 'YouTube',
  x: 'X',
  twitter: 'X',
}

export default function StartMyDay({
  windows,
  bestHour,
  deadlines,
  trainedToday,
  workoutSets,
  hero,
  onAddItem,
  onClose,
}: Props) {
  const [screen, setScreen] = useState<'brief' | 'plan'>('brief')
  // Local echo of what's been added this session (the real items live in the
  // schedule controller, which this overlay sits on top of).
  const [pinned, setPinned] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [acceptedRecs, setAcceptedRecs] = useState<string[]>([])

  const hr = new Date().getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase()

  // Headline window: the strongest run today, else just the single best hour.
  const top = windows[0] ?? null
  const windowText = top
    ? `${fmtHourLabel(top.start)} – ${fmtHourLabel(top.end)}`
    : `around ${fmtHourLabel(bestHour)}`

  // A couple of blocks worth placing, each auto-routed by difficulty: hard →
  // peak window, normal → moderate, easy → lowest free slot. Only offered when
  // there's a window to place them in.
  const recs = useMemo(() => {
    const out: { id: string; label: string; sub: string; raw: string }[] = []
    if (top) {
      out.push({ id: 'deep', label: 'Deep work', sub: `Your peak window, ${fmtHourLabel(top.peakHour)}`, raw: 'Deep work hard' })
    }
    if (!trainedToday) {
      out.push({ id: 'train', label: 'Workout', sub: 'Drops on a strong window', raw: 'Workout' })
    }
    out.push({ id: 'admin', label: 'Admin & email', sub: 'Tucked into a low window', raw: 'Admin and email easy' })
    return out
  }, [top, trainedToday])

  function addNonNegotiable() {
    const t = draft.trim()
    if (!t) return
    // Non-negotiables are the day's anchors → tag hard so they land in a peak window.
    onAddItem(`${t} hard`)
    setPinned(p => [...p, t])
    setDraft('')
  }

  function acceptRec(rec: { id: string; raw: string }) {
    if (acceptedRecs.includes(rec.id)) return
    onAddItem(rec.raw)
    setAcceptedRecs(a => [...a, rec.id])
  }

  return (
    <div className={styles.smdOverlay} role="dialog" aria-modal="true" aria-label="Start my day">
      <div className={styles.smdSheet}>
        <button type="button" className={styles.smdSkip} onClick={onClose}>
          Skip for today
        </button>

        {screen === 'brief' ? (
          <>
            <div className={styles.smdHead}>
              <div className={styles.smdEyebrow}>{dateLabel}</div>
              <h1 className={styles.smdTitle}>{greeting}.</h1>
              <p className={styles.smdLede}>Here&apos;s your read before you start.</p>
            </div>

            {/* Today's peak window. */}
            <div className={styles.smdWindow}>
              <span className={styles.smdWindowLbl}>Peak window today</span>
              <span className={styles.smdWindowVal}>{windowText}</span>
              <span className={styles.smdWindowSub}>Block it for what matters most.</span>
            </div>

            {/* The coach take for today. */}
            <div className={styles.smdCoach}>
              <div className={styles.smdCoachTitle}>{hero.title}</div>
              <div className={styles.smdCoachBody}>{hero.body}</div>
            </div>

            {/* Committed to ship — workout + posting deadlines. */}
            <div className={styles.smdDue}>
              <div className={styles.smdDueHead}>On your plate</div>
              <div className={styles.smdDueRow}>
                <span className={styles.smdDueDot} data-kind="train" />
                <span className={styles.smdDueLbl}>{trainedToday ? 'Trained' : 'Workout'}</span>
                <span className={styles.smdDueMeta}>
                  {trainedToday ? `${workoutSets} set${workoutSets === 1 ? '' : 's'} ✓` : 'open'}
                </span>
              </div>
              {deadlines.map(d => (
                <div key={d.id} className={styles.smdDueRow}>
                  <span className={styles.smdDueDot} data-kind="post" />
                  <span className={styles.smdDueLbl}>{d.label}</span>
                  <span className={styles.smdDueMeta}>
                    {(d.platform && PLATFORM_LABEL[d.platform]) || d.brand} · {fmtMinute(d.minutes)}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.smdFoot}>
              <button type="button" className={styles.smdPrimary} onClick={() => setScreen('plan')}>
                Plan my day →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.smdHead}>
              <div className={styles.smdEyebrow}>STEP 2 · PLAN</div>
              <h1 className={styles.smdTitle}>What matters most?</h1>
              <p className={styles.smdLede}>
                Name your non-negotiables — each one drops straight onto a peak window.
              </p>
            </div>

            <div className={styles.smdInputRow}>
              <input
                className={styles.smdInput}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addNonNegotiable() }
                }}
                placeholder="e.g. Finish the deck"
                aria-label="A non-negotiable for today"
              />
              <button type="button" className={styles.smdAdd} onClick={addNonNegotiable} disabled={!draft.trim()}>
                Add
              </button>
            </div>

            {pinned.length > 0 && (
              <div className={styles.smdChips}>
                {pinned.map((p, i) => (
                  <span key={i} className={styles.smdChip}>✓ {p}</span>
                ))}
              </div>
            )}

            <div className={styles.smdRecs}>
              <div className={styles.smdRecsHead}>Recommended blocks</div>
              {recs.map(rec => {
                const done = acceptedRecs.includes(rec.id)
                return (
                  <button
                    key={rec.id}
                    type="button"
                    className={styles.smdRec}
                    data-done={done ? '1' : '0'}
                    onClick={() => acceptRec(rec)}
                    disabled={done}
                  >
                    <span className={styles.smdRecMain}>
                      <span className={styles.smdRecLbl}>{rec.label}</span>
                      <span className={styles.smdRecSub}>{rec.sub}</span>
                    </span>
                    <span className={styles.smdRecAdd}>{done ? 'Added ✓' : '+ Add'}</span>
                  </button>
                )
              })}
            </div>

            <div className={styles.smdFoot}>
              <button type="button" className={styles.smdGhost} onClick={() => setScreen('brief')}>
                ← Back
              </button>
              <button type="button" className={styles.smdPrimary} onClick={onClose}>
                Start tracking →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
