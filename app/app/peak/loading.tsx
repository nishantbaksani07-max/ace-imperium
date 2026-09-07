import { PageSkeleton, SkeletonHeader, Shimmer } from '@/components/Skeleton'
import styles from '@/components/skeleton.module.css'

/**
 * Instant Peak skeleton. Mirrors PeakModule's shell — header, the big serif
 * score hero, the curve chart, the schedule strip, and the lower cards — so it
 * lands in place when the real page (a 5-query Promise.all) streams in.
 */
export default function PeakLoading() {
  return (
    <PageSkeleton>
      <SkeletonHeader />
      {/* hero score tile */}
      <Shimmer h={190} r={16} />
      {/* curve chart */}
      <Shimmer h={220} r={16} />
      {/* schedule strip */}
      <Shimmer h={90} r={16} />
      {/* substance log + coach */}
      <div className={styles.grid2}>
        <Shimmer h={140} r={16} />
        <Shimmer h={140} r={16} />
      </div>
    </PageSkeleton>
  )
}
