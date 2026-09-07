import dash from '@/app/app/dashboard.module.css'
import styles from './skeleton.module.css'

/**
 * Loading-skeleton primitives, used by the per-route `loading.tsx` files.
 *
 * Next.js renders a route segment's loading.tsx the instant you navigate, then
 * streams in the real page once its server work finishes. So instead of the tap
 * hanging on the previous screen while ~5 Supabase queries run, you get this
 * shimmer frame immediately. PageSkeleton borrows the dashboard .page/.shell
 * chrome (padding, max-width, safe-area insets, ambient glow) so when the real
 * content arrives it lands in exactly the same place — no jump.
 */

/** One shimmering placeholder block. Sizes are plain CSS values (px number → px). */
export function Shimmer({
  w = '100%',
  h = 16,
  r = 12,
  className = '',
}: {
  w?: number | string
  h?: number | string
  r?: number | string
  className?: string
}) {
  return (
    <div
      className={`${styles.block} ${className}`}
      style={{ width: w, height: h, borderRadius: r }}
      aria-hidden
    />
  )
}

/** Full-page skeleton shell — same chrome as every gated module page. */
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${dash.page} grain-overlay`} role="status" aria-busy="true" aria-label="Loading">
      <div className={dash.shell}>{children}</div>
    </main>
  )
}

/** A header row: back pill + title placeholder. Shared across module skeletons. */
export function SkeletonHeader() {
  return (
    <div className={styles.headRow}>
      <Shimmer w={64} h={30} r={999} />
      <Shimmer w={140} h={24} />
    </div>
  )
}

/**
 * Generic module skeleton — a header, a hero block, a stat pair, and a panel.
 * Good default for most tiles; routes with a distinctive shell (e.g. Peak) ship
 * their own arrangement instead.
 */
export function ModuleSkeleton() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      <Shimmer h={160} r={16} />
      <div className={styles.grid2}>
        <Shimmer h={120} r={16} />
        <Shimmer h={120} r={16} />
      </div>
      <Shimmer h={200} r={16} />
    </PageSkeleton>
  )
}
