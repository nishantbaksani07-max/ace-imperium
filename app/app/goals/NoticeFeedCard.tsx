'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './veeNoticed.module.css'
import type { FeedNotice } from '@/lib/insights/feed'
import type { Rarity } from '@/lib/insights/rarity'
import { simplifyLead } from '@/lib/insights/simplify'

const VMARK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 7l7 11 7-11" /></svg>
const CLOCK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
const SPARKLE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /></svg>
const UP = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5l8 13H4z" /></svg>
const DN = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 19L4 6h16z" /></svg>
const REFRESH = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>

const ENTRANCES = [styles.eRise, styles.eBloom, styles.eGlide, styles.eTilt]

/** The rarity-tier class that sets --rc on the card (edge + badge read it). */
const RARITY_CLASS: Record<Rarity, string> = {
  common: styles.rCommon, uncommon: styles.rUncommon, rare: styles.rRare,
  epic: styles.rEpic, legendary: styles.rLegendary, mythic: styles.rMythic,
}
/** What each rarity means — the badge tooltip (meaning lives on the word, not the color). */
const RARITY_MEANING: Record<Rarity, string> = {
  common: 'a small true nudge',
  uncommon: 'a solid single link',
  rare: 'a link you would miss',
  epic: 'two or three, one story',
  legendary: 'the lever for a big goal',
  mythic: 'the one you would kill to know',
}

/** The cold-start "starter" gets a softer tag; everything else is a real finding. */
function tagFor(source: FeedNotice['source']): string {
  return source === 'starter' ? 'Vitality is watching' : 'Vitality noticed'
}

/** Bold the goal name inside the lead (when present), matching the preview. */
function Lead({ lead, goal }: { lead: string; goal: string | null }) {
  if (goal && lead.includes(goal)) {
    const [a, b] = lead.split(goal)
    return <>{a}<b>{goal}</b>{b}</>
  }
  return <>{lead}</>
}

export default function NoticeFeedCard({ feed, onTalk, onShowPattern }: { feed: FeedNotice[]; onTalk: () => void; onShowPattern?: (patternKey: string) => void }) {
  const [idx, setIdx] = useState(0)
  const [simple, setSimple] = useState(false)
  // Patterns already logged this mount, so flipping back and forth never re-fires
  // (the server action dedupes too — this just avoids the extra round-trips).
  const loggedRef = useRef<Set<string>>(new Set())
  const n = feed.length ? feed[idx % feed.length] : null

  // Gate it like a gift: when the user actually lands on a fusion seam, record the
  // show so that pattern rests on its cooldown before it can surface again.
  useEffect(() => {
    if (!n || n.source !== 'fusion' || !n.patternKey || !onShowPattern) return
    if (loggedRef.current.has(n.patternKey)) return
    loggedRef.current.add(n.patternKey)
    onShowPattern(n.patternKey)
  }, [n, onShowPattern])

  if (!n) return null
  const entrance = ENTRANCES[idx % ENTRANCES.length]
  const rarity = n.rarity ?? null
  // The simple read only matters when there is numeric detail to strip + chips to hide.
  const canSimplify = n.receipts.length > 0
  const isSimple = simple && canSimplify
  const leadText = isSimple ? simplifyLead(n.lead) : n.lead

  return (
    <>
      <div className={`${styles.vc} ${entrance} ${rarity ? RARITY_CLASS[rarity] : ''}`} key={idx}>
        {rarity && <span className={styles.rarityEdge} aria-hidden />}
        <div className={styles.vtTop}>
          <span className={styles.vtEcho}>{VMARK}</span>
          <span className={styles.vtTag}>{tagFor(n.source)}</span>
          {rarity && (
            <span className={styles.rbadge} title={`${rarity} — ${RARITY_MEANING[rarity]}`}>
              <span className={styles.rGem} aria-hidden />{rarity}
            </span>
          )}
          <span className={styles.vtSpacer} />
          {canSimplify && (
            <span className={styles.seg} role="group" aria-label="how much detail">
              <button type="button" className={`${styles.segb} ${!simple ? styles.segbOn : ''}`} aria-pressed={!simple} onClick={() => setSimple(false)}>detailed</button>
              <button type="button" className={`${styles.segb} ${simple ? styles.segbOn : ''}`} aria-pressed={simple} onClick={() => setSimple(true)}>simple</button>
            </span>
          )}
          <span className={styles.vtWatched}>{CLOCK}{n.watched}</span>
        </div>
        <div className={styles.vtBody}>
          <p className={styles.vtLead}><Lead lead={leadText} goal={n.goalTitle} /></p>

          {n.impact && n.goalTitle && (
            <div className={styles.impact}>
              <span className={styles.il}>moves your goal</span>
              <span className={`${styles.gimp} ${n.impact === 'up' ? styles.gimpUp : styles.gimpDn}`}>
                {n.impact === 'up' ? UP : DN}{n.goalTitle}
              </span>
            </div>
          )}

          {n.receipts.length > 0 && !isSimple && (
            <div className={styles.viz}>
              <div className={styles.chips}>
                {n.receipts.map((r, i) => <span key={i} className={styles.chip}>{r}</span>)}
              </div>
            </div>
          )}

          <div className={styles.acts}>
            <button type="button" className={styles.clB} onClick={onTalk}>
              {SPARKLE}
              talk deeper in Claude
            </button>
          </div>
        </div>
      </div>

      {feed.length > 1 && (
        <div className={styles.cycle}>
          <div className={styles.pager}>
            {feed.map((_, i) => <i key={i} className={i === idx % feed.length ? styles.on : ''} />)}
          </div>
          <button type="button" className={styles.another} onClick={() => setIdx(i => i + 1)}>
            {REFRESH}
            show me another
          </button>
        </div>
      )}
    </>
  )
}
