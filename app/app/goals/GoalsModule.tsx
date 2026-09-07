'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import dashboardStyles from '../dashboard.module.css'
import styles from './goals.module.css'
import { useGoalsState, localDateKey } from './state'
import { usePeakSnapshot, suggestSlot } from './peakBridge'
import { DIFFICULTY_META, formatHour } from './types'
import type { Difficulty, Goal } from './types'

/**
 * Goals (·05). Daily + long-term unified, paired with Peak.
 *
 * Layout:
 *   - Header: Vitality Score (from Peak) + secondary streak counter
 *   - Energy + schedule strip: today's peak windows + Peak events inline
 *   - Today card: progress bar + difficulty-colored goal rows
 *   - Tomorrow card: planned goals locked until next-day roll
 *
 * Goal add UX is a single input with an optional "details" toggle that
 * surfaces difficulty + duration. When difficulty is hard/medium/easy
 * AND a duration is set, we call Peak's findSlotByMode to suggest a
 * specific start hour and surface it as a pill on the row.
 */
export default function GoalsModule() {
  const { ready, state, actions, todayGoals, requiredCount, completedCount, allDone } = useGoalsState()
  const peak = usePeakSnapshot()

  if (!ready) {
    return (
      <main className={`${dashboardStyles.page} grain-overlay`}>
        <div className={dashboardStyles.shell} />
      </main>
    )
  }

  return (
    <main className={`${dashboardStyles.page} grain-overlay`}>
      <div className={dashboardStyles.shell}>
        <Header
          score={peak.score}
          tier={peak.tier}
          peakReady={peak.ready && peak.curve.length > 0}
          streak={state.streak.current}
          freezes={state.streak.freezes}
        />

        <EnergyStrip peak={peak} />

        <TodayCard
          goals={todayGoals}
          completed={completedCount}
          total={requiredCount}
          allDone={allDone}
          peak={peak}
          onAdd={actions.addGoal}
          onComplete={actions.completeGoal}
          onUncomplete={actions.uncompleteGoal}
          onPush={actions.pushToTomorrow}
          onDelete={actions.deleteGoal}
        />

        <TomorrowCard
          goals={state.tomorrow}
          onAdd={actions.addTomorrow}
        />
      </div>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Header — Vitality Score primary, streak secondary
// -----------------------------------------------------------------------------

function Header({ score, tier, peakReady, streak, freezes }: {
  score: number
  tier: string
  peakReady: boolean
  streak: number
  freezes: number
}) {
  return (
    <header className={styles.header}>
      <Link href="/app" className={styles.back}>
        <span className={styles.backArrow}>←</span> Dashboard
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Goals</h1>
        <div className={styles.heroRight}>
          {peakReady ? (
            <div className={styles.scoreCard} title={`Today's Vitality Score from Peak. ${tier}`}>
              <div className={styles.scoreNum}>{Math.round(score)}</div>
              <div className={styles.scoreLabelCol}>
                <span className={styles.scoreLabel}>Vitality</span>
                <span className={styles.scoreTier}>{tier}</span>
              </div>
            </div>
          ) : (
            <Link href="/app/peak" className={styles.scoreEmpty}>
              <span>Set up Peak →</span>
              <span className={styles.scoreEmptySub}>For energy-aware scheduling</span>
            </Link>
          )}
          <div className={`${styles.streak} ${streak > 0 ? styles.streakActive : ''}`}>
            <span aria-hidden>⚡</span>
            <span className={styles.streakNum}>{streak}</span>
            {freezes > 0 && (
              <span className={styles.freezePill} title={`${freezes} streak freeze${freezes === 1 ? '' : 's'}`}>
                🛡 {freezes}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

// -----------------------------------------------------------------------------
// Energy strip — peak windows + today's Peak events inline
// -----------------------------------------------------------------------------

function EnergyStrip({ peak }: { peak: ReturnType<typeof usePeakSnapshot> }) {
  if (!peak.ready) return null

  const hasData = peak.curve.length > 0
  if (!hasData) {
    return (
      <section className={styles.energyCard}>
        <div className={styles.energyHead}>
          <span className={styles.eyebrow}>Today's energy</span>
          <Link href="/app/peak" className={styles.energyLink}>Open Peak →</Link>
        </div>
        <p className={styles.energyEmpty}>
          Log a few substances + your sleep in Peak and we'll surface your
          best windows here for scheduling hard goals.
        </p>
      </section>
    )
  }

  return (
    <section className={styles.energyCard}>
      <div className={styles.energyHead}>
        <span className={styles.eyebrow}>Today's energy</span>
        <Link href="/app/peak" className={styles.energyLink}>Open Peak →</Link>
      </div>

      <EnergyCurve curve={peak.curve} windows={peak.windows} events={peak.todayEvents} />

      <div className={styles.energyFacts}>
        {peak.windows.length > 0 && (
          <div className={styles.fact}>
            <span className={styles.factLabel}>Peak window</span>
            <span className={styles.factVal}>
              {formatHour(peak.windows[0].start)} to {formatHour(peak.windows[0].end)}
            </span>
          </div>
        )}
        {peak.todayEvents.length > 0 && (
          <div className={styles.fact}>
            <span className={styles.factLabel}>Scheduled</span>
            <span className={styles.factVal}>
              {peak.todayEvents.length} event{peak.todayEvents.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Compact 24-hour curve sparkline with peak windows + busy events
 * overlaid. Visual-only — for actually editing schedule the user clicks
 * through to the Peak module.
 */
function EnergyCurve({
  curve,
  windows,
  events,
}: {
  curve: number[]
  windows: ReturnType<typeof usePeakSnapshot>['windows']
  events: ReturnType<typeof usePeakSnapshot>['todayEvents']
}) {
  const W = 600
  const H = 56
  const PAD = 2
  const minHour = 6
  const maxHour = 23
  const hourSpan = maxHour - minHour

  // Sample curve from minHour to maxHour. Curve is hourly, length 24.
  const sampledPoints: { x: number; y: number }[] = []
  for (let h = minHour; h <= maxHour; h += 0.5) {
    const i = Math.floor(h)
    const next = Math.min(23, i + 1)
    const frac = h - i
    const v = curve[i] * (1 - frac) + curve[next] * frac
    const x = ((h - minHour) / hourSpan) * W
    const y = H - PAD - (v / 100) * (H - PAD * 2)
    sampledPoints.push({ x, y })
  }
  const path = sampledPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${path} L${W},${H} L0,${H} Z`

  const nowHour = new Date().getHours() + new Date().getMinutes() / 60
  const nowX = ((nowHour - minHour) / hourSpan) * W

  function hourToX(h: number) {
    return ((h - minHour) / hourSpan) * W
  }

  return (
    <svg className={styles.energySvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Peak windows: subtle mint vertical bands */}
      {windows.map((w, i) => (
        <rect
          key={`w-${i}`}
          x={hourToX(w.start)}
          y={0}
          width={Math.max(2, hourToX(w.end) - hourToX(w.start))}
          height={H}
          fill="var(--mint)"
          opacity="0.08"
        />
      ))}

      {/* Busy events: amber bands so collisions are visible */}
      {events.map((e, i) => (
        <rect
          key={`e-${i}`}
          x={hourToX(e.startHour)}
          y={0}
          width={Math.max(2, hourToX(e.endHour) - hourToX(e.startHour))}
          height={H}
          fill="#F59E0B"
          opacity="0.12"
        />
      ))}

      <path d={areaPath} fill="url(#energyGrad)" />
      <path d={path} fill="none" stroke="var(--mint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Now indicator */}
      {nowHour >= minHour && nowHour <= maxHour && (
        <line x1={nowX} x2={nowX} y1={0} y2={H} stroke="#fff" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
      )}
    </svg>
  )
}

// -----------------------------------------------------------------------------
// Today card — progress + goal rows + add input
// -----------------------------------------------------------------------------

interface TodayCardProps {
  goals: Goal[]
  completed: number
  total: number
  allDone: boolean
  peak: ReturnType<typeof usePeakSnapshot>
  onAdd: (input: {
    title: string
    difficulty?: Difficulty
    estimatedMinutes?: number | null
    suggestedStartHour?: number | null
  }) => void
  onComplete: (id: string) => void
  onUncomplete: (id: string) => void
  onPush: (id: string) => void
  onDelete: (id: string) => void
}

function TodayCard({ goals, completed, total, allDone, peak, onAdd, onComplete, onUncomplete, onPush, onDelete }: TodayCardProps) {
  // Sort: open first, then by suggested start hour (early to late),
  // unscheduled at the end. Completed goals slide to the bottom.
  const sorted = useMemo(() => {
    return [...goals].sort((a, b) => {
      if ((a.status === 'completed') !== (b.status === 'completed')) {
        return a.status === 'completed' ? 1 : -1
      }
      const ah = a.suggestedStartHour ?? 999
      const bh = b.suggestedStartHour ?? 999
      return ah - bh
    })
  }, [goals])

  const label = total === 0 ? 'no goals yet' : allDone ? 'all done, solid day' : 'complete'

  return (
    <section className={`${styles.card} ${allDone ? styles.cardAllDone : ''}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardHeadLeft}>
          <div className={styles.eyebrow}>Today</div>
          <div className={styles.progressRow}>
            <span className={styles.progressNum}>{completed}</span>
            <span className={styles.progressTotal}>/ {total}</span>
            <span className={styles.progressLabel}>{label}</span>
          </div>
        </div>
      </div>

      <div className={styles.bar}>
        {goals.map(g => (
          <div
            key={g.id}
            className={`${styles.barSeg} ${g.status === 'completed' ? styles.barSegDone : ''}`}
          />
        ))}
      </div>

      {goals.length === 0 ? (
        <div className={styles.empty}>No goals for today yet. Add one below.</div>
      ) : (
        <ul className={styles.list}>
          {sorted.map(g => (
            <GoalRow
              key={g.id}
              goal={g}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onPush={onPush}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <AddRow peak={peak} onAdd={onAdd} />
    </section>
  )
}

// -----------------------------------------------------------------------------
// Goal row — difficulty colored, optional suggested time pill
// -----------------------------------------------------------------------------

const CELEBRATIONS = ['✓', '✨', '🔥', '💪', '⚡']

interface GoalRowProps {
  goal: Goal
  onComplete: (id: string) => void
  onUncomplete: (id: string) => void
  onPush: (id: string) => void
  onDelete: (id: string) => void
}

function GoalRow({ goal, onComplete, onUncomplete, onPush, onDelete }: GoalRowProps) {
  const [celebrationGlyph, setCelebrationGlyph] = useState<string>('✓')
  const [justCompleted, setJustCompleted] = useState(false)

  const done = goal.status === 'completed'
  const todayKey = localDateKey()
  const overdue = !done && goal.dueDate !== null && goal.dueDate < todayKey
  const difficultyMeta = goal.difficulty ? DIFFICULTY_META[goal.difficulty] : null

  function handleToggle() {
    if (done) {
      onUncomplete(goal.id)
      return
    }
    const glyph = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)]
    setCelebrationGlyph(glyph)
    setJustCompleted(true)
    onComplete(goal.id)
    setTimeout(() => setJustCompleted(false), 700)
  }

  return (
    <li
      className={`${styles.row} ${done ? styles.rowDone : ''} ${overdue ? styles.rowOverdue : ''} ${justCompleted ? styles.rowCelebrate : ''}`}
      style={difficultyMeta ? { ['--row-tint' as string]: difficultyMeta.tint } : undefined}
      data-difficulty={goal.difficulty ?? 'none'}
    >
      <button
        type="button"
        className={`${styles.check} ${done ? styles.checkOn : ''}`}
        onClick={handleToggle}
        aria-label={done ? `Uncomplete ${goal.title}` : `Complete ${goal.title}`}
        title={done ? 'Tap to undo' : 'Tap to complete'}
      >
        {done ? celebrationGlyph : ''}
      </button>

      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>{goal.title}</div>
        <div className={styles.rowMeta}>
          {difficultyMeta && <span className={styles.diffChip}>{difficultyMeta.label}</span>}
          {goal.suggestedStartHour != null && (
            <span className={styles.timeChip}>
              {formatHour(goal.suggestedStartHour)}
              {goal.estimatedMinutes ? ` · ${goal.estimatedMinutes}m` : ''}
            </span>
          )}
          {overdue && <span className={styles.overdueChip}>overdue</span>}
          {goal.pushCount > 1 && (
            <span className={styles.pushChip} title={`Rescheduled ${goal.pushCount}×`}>
              ↻ {goal.pushCount}
            </span>
          )}
        </div>
      </div>

      <div className={styles.rowActions}>
        {!done && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onPush(goal.id)}
            title="Reschedule to tomorrow"
            aria-label="Reschedule to tomorrow"
          >
            →
          </button>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => onDelete(goal.id)}
          title="Delete"
          aria-label="Delete"
        >
          ×
        </button>
      </div>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Add row — one input + optional "details" toggle for smart scheduling
// -----------------------------------------------------------------------------

const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
]

function AddRow({ peak, onAdd }: { peak: ReturnType<typeof usePeakSnapshot>; onAdd: TodayCardProps['onAdd'] }) {
  const [title, setTitle] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>(null)
  const [minutes, setMinutes] = useState<number | null>(null)

  // Smart-slot suggestion: only when difficulty + duration both set AND
  // Peak data exists. Otherwise null and we just save the goal as-is.
  const suggestion = useMemo(() => {
    if (!difficulty || !minutes) return null
    return suggestSlot(peak, minutes, DIFFICULTY_META[difficulty].peakMode)
  }, [peak, difficulty, minutes])

  function reset() {
    setTitle('')
    setDifficulty(null)
    setMinutes(null)
    setExpanded(false)
  }

  function submit() {
    const t = title.trim()
    if (!t) return
    onAdd({
      title: t,
      difficulty,
      estimatedMinutes: minutes,
      suggestedStartHour: suggestion ? suggestion.startHour : null,
    })
    reset()
  }

  return (
    <div className={styles.addWrap}>
      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          type="text"
          value={title}
          placeholder="Add a goal for today…"
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !expanded) submit() }}
        />
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setExpanded(v => !v)}
          title="Difficulty + duration (smart-schedule)"
          aria-expanded={expanded}
        >
          {expanded ? '× details' : '+ details'}
        </button>
        <button type="button" className={styles.addBtn} onClick={submit}>+ Add</button>
      </div>

      {expanded && (
        <div className={styles.addPickers}>
          <div className={styles.pickerGroup}>
            <span className={styles.pickerLabel}>Difficulty</span>
            <div className={styles.pickerChips}>
              {(['red', 'yellow', 'green'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.diffPicker} ${difficulty === d ? styles.diffPickerActive : ''}`}
                  data-diff={d}
                  onClick={() => setDifficulty(d === difficulty ? null : d)}
                  title={DIFFICULTY_META[d].hint}
                >
                  <span className={styles.diffPickerDot} />
                  {DIFFICULTY_META[d].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.pickerGroup}>
            <span className={styles.pickerLabel}>Duration</span>
            <div className={styles.pickerChips}>
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.minutes}
                  type="button"
                  className={`${styles.pickerChip} ${minutes === opt.minutes ? styles.pickerChipActive : ''}`}
                  onClick={() => setMinutes(opt.minutes === minutes ? null : opt.minutes)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live suggestion preview — only when both fields set */}
          {suggestion ? (
            <div className={styles.suggestion}>
              <span className={styles.suggestionLabel}>Best slot</span>
              <span className={styles.suggestionTime}>
                {formatHour(suggestion.startHour)} to {formatHour(suggestion.endHour)}
              </span>
              <span className={styles.suggestionScore}>
                avg energy {Math.round(suggestion.avgScore)}
              </span>
            </div>
          ) : difficulty && minutes ? (
            <div className={styles.suggestionEmpty}>
              No free slot for {minutes}m today. Try a shorter duration or check Peak.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Tomorrow card
// -----------------------------------------------------------------------------

function TomorrowCard({ goals, onAdd }: { goals: Goal[]; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')

  function submit() {
    const t = title.trim()
    if (!t) return
    onAdd(t)
    setTitle('')
  }

  return (
    <section className={`${styles.card} ${styles.cardTomorrow}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardHeadLeft}>
          <div className={styles.eyebrow}>Plan tomorrow</div>
          <div className={styles.subtitle}>Write tonight, locked until morning.</div>
        </div>
        <div className={styles.tomorrowCount}>{goals.length} planned</div>
      </div>

      {goals.length === 0 ? (
        <div className={styles.empty}>Nothing planned for tomorrow yet.</div>
      ) : (
        <ul className={styles.list}>
          {goals.map(g => (
            <li key={g.id} className={styles.rowLite}>
              <span className={styles.rowLiteDot} aria-hidden>·</span>
              <span>{g.title}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <input
          className={styles.addInput}
          type="text"
          value={title}
          placeholder="Add a goal for tomorrow…"
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className={styles.addBtn} onClick={submit}>+ Add</button>
      </div>
    </section>
  )
}
