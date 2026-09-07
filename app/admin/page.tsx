import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireFounder } from '@/lib/auth/admin'
import { designByKey } from '@/lib/tiles/designs'
import type { TileEnvelope } from '@/lib/tiles/types'
import { ModerationButtons } from './ModerationButtons'
import styles from './admin.module.css'

// The queue must always reflect the live table, never a cached render.
export const dynamic = 'force-dynamic'

/**
 * /admin — the Arts District moderation queue (Pillar 3), founders only.
 *
 * Server-gated: requireFounder() redirects anyone whose session email is not in
 * FOUNDER_EMAILS to /app, so the route is invisible to regular users. Every
 * mutating action (approveTile / rejectTile) re-checks isFounder() too — the
 * page gate is convenience, the action gate is the real lock.
 *
 * Reads use the founder's own anon/authed server client (NO service-role, per
 * the lane brief). A missing published_tiles table or any read error degrades to
 * a calm empty state. NOTE: current RLS only lets a caller read their OWN pending
 * rows, so until the founders SELECT policy ships (see the report's RLS
 * follow-up), this queue shows only the founder's own pending tiles. The queue is
 * built to work unchanged the moment that policy lands.
 */

interface PendingTile {
  id: string
  name: string
  category: string | null
  envelope: TileEnvelope
  created_at: string
  handle: string | null
}

async function loadPending(): Promise<{ tiles: PendingTile[]; tableMissing: boolean }> {
  try {
    const supabase = createClient()
    const { data: rows, error } = await supabase
      .from('published_tiles')
      .select('id, name, category, envelope, created_at, creator_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      // A relation-does-not-exist error means the migration is not applied yet.
      const missing = /relation .* does not exist|could not find the table|schema cache/i.test(
        error.message
      )
      return { tiles: [], tableMissing: missing }
    }
    if (!rows || rows.length === 0) return { tiles: [], tableMissing: false }

    // Join creator handles app-side (same pattern as ArtsDistrict).
    const creatorIds = [...new Set(rows.map((r) => r.creator_id as string))]
    const { data: profs } = creatorIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds)
      : { data: [] as { user_id: string; username: string }[] }
    const handleByUser = new Map((profs ?? []).map((p) => [p.user_id, p.username]))

    const tiles: PendingTile[] = rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      category: (r.category as string | null) ?? null,
      envelope: r.envelope as TileEnvelope,
      created_at: r.created_at as string,
      handle: handleByUser.get(r.creator_id as string) ?? null,
    }))
    return { tiles, tableMissing: false }
  } catch {
    return { tiles: [], tableMissing: false }
  }
}

export default async function AdminRoute() {
  // Founders-only. Non-founders never see this page — redirected to /app.
  await requireFounder()

  const { tiles, tableMissing } = await loadPending()

  const sub = tableMissing
    ? 'The published_tiles table is not applied yet. Nothing to review.'
    : tiles.length === 0
      ? 'The queue is clear. Nothing waiting for review.'
      : `${tiles.length} tile${tiles.length === 1 ? '' : 's'} waiting for review.`

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.bar}>
        <Link href="/app" className={styles.mark} aria-label="Vitality">V</Link>
        <span className={styles.barSpacer} />
        <Link href="/app" className={styles.barCta}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Dashboard
        </Link>
      </div>

      <div className={styles.shell}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Arts District</p>
          <h1 className={styles.title}>
            The <em>approvals</em> queue
          </h1>
          <p className={styles.sub}>{sub}</p>
        </header>

        {tiles.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyLine}>Nothing waiting.</div>
            <div className={styles.emptySub}>
              New community tiles land here as makers publish them.
            </div>
          </div>
        ) : (
          <ul className={styles.list}>
            {tiles.map((t) => {
              const env = t.envelope ?? ({} as TileEnvelope)
              const design = designByKey(env.design || '')
              const when = new Date(t.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              return (
                <li key={t.id} className={styles.row}>
                  {/* Poster preview — the design-SVG face, same approach as ArtsDistrict. */}
                  <div className={styles.cover} style={{ color: env.color || undefined }}>
                    {design && (
                      <span className={styles.art} dangerouslySetInnerHTML={{ __html: design.svg }} />
                    )}
                    <span className={styles.coverName}>{t.name}</span>
                  </div>

                  <div className={styles.meta}>
                    <span className={styles.name}>{t.name}</span>
                    <div className={styles.detail}>
                      {t.handle ? (
                        <Link
                          href={`/u/${t.handle}`}
                          className={styles.handle}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          @{t.handle}
                        </Link>
                      ) : (
                        <span className={styles.handleMissing}>no handle</span>
                      )}
                      {t.category && <span className={styles.cat}>{t.category}</span>}
                      <span className={styles.date}>{when}</span>
                    </div>
                  </div>

                  <ModerationButtons id={t.id} name={t.name} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
