/**
 * THE ROOM (TRAIN 5) - the metric registry, tangible.
 *
 * A page GENERATED at render from lib/insights/metricRegistry.ts, never
 * hand-synced: one section per goal category, one row per metric (label,
 * unit, direction, source, classifying words, deep link), plus cheap live
 * per-user row counts (head-only count queries, best-effort, never throw).
 * Auth is the /app layout's gate. If a metric is missing here, it does not
 * exist; adding one is a single registry entry.
 */
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { METRIC_REGISTRY, metricsForCategory, type MetricEntry, type MetricLoader } from '@/lib/insights/metricRegistry'
import { GOAL_CATEGORIES, CATEGORY_WORD, type GoalCategory } from '@/lib/goals/categories'
import SystemsWing from './SystemsWing'
import s from './room.module.css'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'The Room · Vitality' }

/** Every table the registry names, counted once (RLS-scoped, head-only). */
function loaderTables(): MetricLoader[] {
  return [...new Set(METRIC_REGISTRY.map((m) => m.loader))]
}

/** Cheap live counts: one head count per distinct loader table, in parallel,
 *  best-effort. A failed table simply shows no number - never an error. */
async function loadCounts(userId: string): Promise<Partial<Record<MetricLoader, number>>> {
  const supabase = createClient()
  const tables = loaderTables()
  const results = await Promise.allSettled(
    tables.map((t) =>
      supabase.from(t).select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    ),
  )
  const counts: Partial<Record<MetricLoader, number>> = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error && typeof r.value.count === 'number') {
      counts[tables[i]] = r.value.count
    }
  })
  return counts
}

function DirGlyph({ direction }: { direction: MetricEntry['direction'] }) {
  // Direction means "which way a HEALTHY graph moves", so BOTH arrows are the
  // good direction and both paint mint. Amber is the app-wide caution color
  // (tierMeta, the goals graph); an amber arrow beside RHR's good direction
  // would read as a warning. The SVG shape already carries up vs down.
  const stroke = direction === 'up' || direction === 'down' ? 'var(--mint)' : 'var(--muted)'
  if (direction === 'up' || direction === 'down') {
    const d = direction === 'up' ? 'M6 10 L6 2 M3 5 L6 2 L9 5' : 'M6 2 L6 10 M3 7 L6 10 L9 7'
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label={direction} role="img">
        <path d={d} stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (direction === 'goal') {
    // A diamond: the goal decides which way is good (cut vs bulk).
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label="goal decides" role="img">
        <path d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" stroke="var(--muted-strong)" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label="neutral" role="img">
      <path d="M2.5 6 L9.5 6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function sourceText(m: MetricEntry): string {
  if (m.source.kind === 'wearable') return m.source.providers.join(' > ')
  if (m.source.kind === 'stream') return 'tile stream'
  return m.source.name
}

export default async function RoomPage() {
  // The /app layout already gates auth; this read is just for the counts.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const counts = user ? await loadCounts(user.id) : {}

  const total = METRIC_REGISTRY.length
  const families = METRIC_REGISTRY.filter((m) => m.dynamic).length

  return (
    <main className={s.page}>
      <div className={s.kicker}>the electrical room</div>
      <h1 className={s.title}>Every number Vitality can draw</h1>
      {/* The user-facing twin: this page is the wiring diagram (the registry),
          THE CORE ROOM is the user's own lines drawn from their real logs. */}
      <p className={s.law}>
        <Link href="/app/core-room">Open THE CORE ROOM - your own graphs, drawn from your real logs.</Link>
      </p>
      <p className={s.law}>
        This page is generated from <code>lib/insights/metricRegistry.ts</code> at
        render, never hand-synced. That file is the one source of truth for every
        drawable series: adding a metric to Vitality is one registry entry, and it
        appears here, in the goal binding picker, and in Vee&apos;s triage the same
        moment.
      </p>
      <div className={s.meta}>
        {total} native metrics · {families} open families · counts are your own rows in the named table, read live
      </div>

      {GOAL_CATEGORIES.map((cat: GoalCategory) => {
        const metrics = metricsForCategory(cat)
        return (
          <section key={cat} className={s.section} aria-label={CATEGORY_WORD[cat]}>
            <div className={s.sectionHead}>
              <h2 className={s.sectionName}>{CATEGORY_WORD[cat]}</h2>
              <span className={s.sectionCount}>
                {metrics.length === 0 ? 'no native metric' : `${metrics.length} ${metrics.length === 1 ? 'metric' : 'metrics'}`}
              </span>
            </div>
            {metrics.length === 0 ? (
              <p className={s.gap}>
                Nothing native measures this yet. Its numbers come from your own
                tiles: <Link href="/app/create">build one in Create</Link> and it
                reports into the same engine as every metric on this page.
              </p>
            ) : (
              <div className={s.rows}>
                {metrics.map((m) => {
                  const count = counts[m.loader]
                  return (
                    <div key={m.id}>
                      <div className={s.row}>
                        <div className={s.label}>
                          {m.label}
                          {m.dynamic && <span className={s.family}>family</span>}
                        </div>
                        <span className={s.unit}>{m.unit}</span>
                        <span className={s.dir}><DirGlyph direction={m.direction} /></span>
                        <span className={s.source}>{sourceText(m)}</span>
                        <span className={s.count}>
                          {typeof count === 'number' ? (
                            // The count is one head count of the whole loader
                            // TABLE, shared by every metric drawn from it, so
                            // it is printed with the table's name: honest at
                            // the row where it appears, never read as
                            // per-metric datapoints.
                            <>
                              {count > 0 ? <b>{count.toLocaleString()} rows</b> : <span className={s.countDim}>0 rows</span>}
                              <span className={s.countTable}>in {m.loader}</span>
                            </>
                          ) : (
                            <span className={s.countDim}>&middot;</span>
                          )}
                        </span>
                        <Link className={s.open} href={m.href}>open</Link>
                      </div>
                      <div className={s.words} aria-label={`words that route a goal to ${m.label}`}>
                        {m.words.map((w) => <span key={w} className={s.word}>{w}</span>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      <SystemsWing />
    </main>
  )
}
