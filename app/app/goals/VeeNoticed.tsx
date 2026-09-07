'use client'

import styles from './veeNoticed.module.css'
import GoalTicker from './GoalTicker'
import NoticeFeedCard from './NoticeFeedCard'
import type { TickerRow } from '@/lib/insights/ticker'
import type { GuideItem } from '@/lib/insights/goalGuide'
import type { LifeChip } from '@/lib/insights/lifeChips'
import type { FeedNotice } from '@/lib/insights/feed'

/**
 * VeeNoticed — the full "Vitality noticed" surface at §01 of the Vee tab.
 *
 * Sits under Vee's existing gem + greeting. Brings the loved preview to life on
 * the real green-light oracle: the lede, the honest goal-ticker graphs, a live
 * life-stat row, the cycling notice card (oracle finding -> drift -> momentum ->
 * cold-start), and the cozy footer. Depth is handed to Claude via onTalk.
 * Ported from public/vee-notice-preview.html.
 */
export default function VeeNoticed({
  rows,
  guides,
  lifeChips,
  feed,
  onTalk,
  onShowPattern,
}: {
  rows: TickerRow[]
  guides?: Record<string, GuideItem[]>
  lifeChips: LifeChip[]
  feed: FeedNotice[]
  onTalk: () => void
  onShowPattern?: (patternKey: string) => void
}) {
  const toneClass = (t: LifeChip['tone']) =>
    t === 'mint' ? styles.mintV : t === 'amber' ? styles.amberV : styles.mutedV

  return (
    <section className={styles.noticed} aria-label="what Vitality noticed">
      <p className={styles.lede}>
        this is not a magic sentence. it is the one thing that falls out when something holds <b>your goals, your history, and your live stats</b> at once, and actually <span className={styles.i}>thinks about you</span>.
      </p>

      {rows.length > 0 && (
        <>
          <GoalTicker rows={rows} guides={guides} onTalk={onTalk} />
          {lifeChips.length > 0 && (
            <div className={styles.life}>
              {lifeChips.map((c, i) => (
                <span key={i} className={`${styles.s} ${toneClass(c.tone)}`}>
                  {c.label} <b>{c.value}</b>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className={styles.section}>
        <div className={styles.eyebrow}>
          <span className={styles.num}>·01</span>
          <span className={styles.lbl}>What Vitality noticed</span>
          <span className={styles.rule} />
        </div>
        <p className={styles.blurb}>The underlying thing, in a sentence. The deep version opens in Claude.</p>

        <NoticeFeedCard feed={feed} onTalk={onTalk} onShowPattern={onShowPattern} />

        <div className={styles.quiet}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 7l7 11 7-11" /></svg>
          <span>Vitality is holding <b>more</b> for you. one at a time, never a wall.</span>
        </div>
      </div>
    </section>
  )
}
