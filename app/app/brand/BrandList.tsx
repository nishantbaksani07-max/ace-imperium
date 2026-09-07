'use client'

import Link from 'next/link'
import styles from './brand.module.css'
import {
  ARCHETYPE_LABELS,
  CADENCE_UNIT_LABELS,
  PLATFORM_SHORT,
} from './types'
import { accentVars, ARCHETYPE_ACCENTS } from './archetypes'
import { scheduleProgress, totalFollowers, trailingStreak } from './state'
import {
  deadlineUrgency,
  formatCountdown,
  nextDeadline,
  urgencyColor,
  useNow,
} from './deadlines'
import type { Brand } from './types'

interface Props {
  brands: Brand[]
  onLog: (id: string, delta?: number) => void
  onNew: () => void
}

/**
 * Compact grid of brand cards. Each card shows:
 *  - emoji + name + archetype label
 *  - blurb (1 line, truncated)
 *  - today's progress vs daily target (X / Y · unit)
 *  - inline +1 button labeled per the archetype's daily action
 *    ("+ shipped", "+ made a sale", "+ closed a job", …)
 *  - account chips (platforms tagged, no follower number here — that's
 *    the detail view)
 *  - trailing streak chip
 *
 * When there are 0–2 brands, the "New brand" CTA gets promoted to a
 * full-width card above the list — fixes the issue where the small
 * top-right button was easy to miss on first use.
 */
export default function BrandList({ brands, onLog, onNew }: Props) {
  // One shared clock (coarse — minute granularity is plenty for the
  // index's "due in 5h" chips) drives every card's countdown.
  const now = useNow(60_000)

  if (brands.length === 0) {
    return <EmptyState onNew={onNew} />
  }

  return (
    <>
      {brands.length < 3 && <NewBrandCta onNew={onNew} compact />}
      <section className={styles.list}>
        {brands.map(b => (
          <BrandCard key={b.id} brand={b} onLog={onLog} now={now} />
        ))}
      </section>
    </>
  )
}

/** Soonest upcoming deadline across all of a brand's schedules. */
function soonestDeadline(brand: Brand, now: Date): { remaining: number; urgency: number } | null {
  let best: { time: number; period: Brand['schedules'][number]['period'] } | null = null
  for (const s of brand.schedules) {
    const d = nextDeadline(s, now)
    if (d && (!best || d.getTime() < best.time)) best = { time: d.getTime(), period: s.period }
  }
  if (!best) return null
  const remaining = best.time - now.getTime()
  return { remaining, urgency: deadlineUrgency(remaining, best.period) }
}

function BrandCard({ brand, onLog, now }: { brand: Brand; onLog: (id: string, delta?: number) => void; now: Date }) {
  // The list card surfaces the brand's primary (first) schedule; the
  // full set lives on the detail page's command center.
  const primary = brand.schedules[0]
  const { done, target } = primary
    ? scheduleProgress(brand, primary, now)
    : { done: 0, target: 0 }
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0
  const hit = target > 0 && done >= target
  const streak = trailingStreak(brand)
  const followers = totalFollowers(brand)
  const extraSchedules = brand.schedules.length - 1
  // Per-schedule verb, then the brand-level fallback ("shipped" /
  // "made a sale" / "closed a job" / …).
  const actionLabel = primary?.actionLabel || brand.dailyActionLabel || 'shipped'
  const unitLabel = primary ? CADENCE_UNIT_LABELS[primary.unit] : 'posts'
  const periodWord = primary?.period === 'weekly' ? 'this wk' : 'today'

  const due = soonestDeadline(brand, now)
  const dueRgb = due ? urgencyColor(ARCHETYPE_ACCENTS[brand.archetype].rgb, due.urgency) : null

  return (
    <article className={`${styles.card} ${hit ? styles.cardHit : ''}`} style={accentVars(brand.archetype)}>
      <Link href={`/app/brand/${brand.id}`} className={styles.cardLink} aria-label={`Open ${brand.name}`} />

      <header className={styles.cardHead}>
        <span className={styles.cardEmoji} aria-hidden>{brand.emoji}</span>
        <div className={styles.cardHeadText}>
          <h3 className={styles.cardName}>{brand.name}</h3>
          <span className={styles.cardArchetype}>{ARCHETYPE_LABELS[brand.archetype]}</span>
        </div>
        {due && dueRgb && (
          <span
            className={styles.dueChip}
            style={{ color: `rgb(${dueRgb})`, borderColor: `rgba(${dueRgb}, 0.4)` }}
            title="Soonest posting deadline"
          >
            ⏳ {formatCountdown(due.remaining)}
          </span>
        )}
      </header>

      <div className={styles.cadenceRow}>
        <div className={styles.cadenceMain}>
          <span className={styles.cadenceCount}>{done}</span>
          <span className={styles.cadenceSlash}>/</span>
          <span className={styles.cadenceTarget}>{target}</span>
          <span className={styles.cadenceUnit}>
            {unitLabel} {periodWord}
            {extraSchedules > 0 && <span className={styles.moreSchedules}> +{extraSchedules}</span>}
          </span>
        </div>
        <button
          type="button"
          className={styles.shipBtn}
          onClick={() => onLog(brand.id, 1)}
          aria-label={`Log: ${actionLabel} for ${brand.name}`}
        >
          + {actionLabel}
        </button>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <div
          className={`${styles.progressFill} ${hit ? styles.progressFillDone : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <footer className={styles.cardFoot}>
        <div className={styles.platformChips}>
          {brand.accounts.length === 0 ? (
            <span className={styles.noAccountsHint}>No accounts yet</span>
          ) : (
            // Just the platforms at a glance — handles live on the detail page.
            <span className={styles.platformSummary}>
              {Array.from(new Set(brand.accounts.map(a => PLATFORM_SHORT[a.platform]))).join(' · ')}
            </span>
          )}
        </div>
        <div className={styles.cardStats}>
          {followers > 0 && (
            <span className={styles.statChip} title="Total followers across accounts">
              {fmtCount(followers)} <span className={styles.statChipLabel}>total</span>
            </span>
          )}
          {streak > 0 && (
            <span className={`${styles.statChip} ${styles.streakChip}`} title="Days in a row hitting cadence">
              {streak}d <span className={styles.statChipLabel}>streak</span>
            </span>
          )}
        </div>
      </footer>
    </article>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <section className={styles.empty}>
      <div className={styles.emptyMark} aria-hidden>✦</div>
      <h2 className={styles.emptyTitle}>What are you building?</h2>
      <p className={styles.emptyText}>
        Add a TikTok channel, an Etsy shop, a freelance practice, a
        construction company, a restaurant. Anything you’re working on
        outside your day job. Each one gets a daily check-in and a
        custom dashboard.
      </p>
      <button type="button" className={styles.emptyBtn} onClick={onNew}>
        + Add your first brand
      </button>
    </section>
  )
}

/**
 * Promoted "+ New brand" card. Shown above the brand grid when the
 * user has 0–2 brands so the CTA is impossible to miss on first use.
 * Once they hit 3+, the top-right header button is enough and this
 * disappears.
 */
function NewBrandCta({ onNew, compact = false }: { onNew: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`${styles.newCta} ${compact ? styles.newCtaCompact : ''}`}
      onClick={onNew}
    >
      <span className={styles.newCtaMark} aria-hidden>+</span>
      <div className={styles.newCtaText}>
        <span className={styles.newCtaTitle}>Add another brand</span>
        <span className={styles.newCtaSub}>
          Type what you’re building and we’ll set up the dashboard for it.
        </span>
      </div>
    </button>
  )
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
