'use client'

/**
 * The Vitals Signal hero — today's fused, personal read (·01 on the readings
 * page). WHOOP knows your recovery; only Vitality also knows your training load,
 * your fuel, your goal, and what you told Vee. This card shows that one fused
 * call (push / steady / recover) with the transparent signals that fed it.
 *
 * Renders the azure signalCard from public/vitals-signals-kit.html via a CSS
 * module, inside the shared numbered-section eyebrow from the page's vitals
 * module so it slots in as the first section. The "talk about this with Vee"
 * pill bridges through the existing mentorSeed pattern (stash + route to the
 * mentor), exactly like VitalsDashboard.openMentor. Renders nothing if there is
 * no signal.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { stashMentorSeed } from '@/lib/vitals/mentorSeed'
import type { Signal, SignalChip } from '@/lib/vitals/signal'
import page from '@/app/vitals-preview/vitals.module.css'
import styles from './signalCard.module.css'
import SignalInfoSheet from './SignalInfoSheet'

const ARROW: Record<SignalChip['dir'], { glyph: string; cls: string }> = {
  up: { glyph: '↑', cls: styles.sigUp },
  flat: { glyph: '→', cls: styles.sigFlat },
  down: { glyph: '↓', cls: styles.sigDown },
  good: { glyph: '✓', cls: styles.sigUp },
  warn: { glyph: '!', cls: styles.sigDown },
}

const BADGE_ICON: Record<Signal['lean'], string> = {
  push: '▲', steady: '■', recover: '◆',
}

export default function SignalCard({ signal, sectionNum = '·01' }: { signal: Signal | null; sectionNum?: string }) {
  const router = useRouter()
  const [infoOpen, setInfoOpen] = useState(false)
  if (!signal) return null

  const openMentor = () => {
    stashMentorSeed({
      topic: 'signal',
      metricLabel: 'Today’s signal',
      line: `${signal.badge}. ${signal.verdict}`,
      opener: `Your signal today is "${signal.badge}". ${signal.why} Want to talk through how to play today?`,
    })
    router.push('/app/mentor')
  }

  const badgeCls = signal.tone === 'amber' ? styles.badgeAmber : styles.badgeAccent

  return (
    <section className={`${page.section} ${styles.scope}`}>
      <div className={page.eyebrow}>
        <span className={page.eyebrowNum}>{sectionNum}</span>
        <span className={page.eyebrowLbl}>Today&rsquo;s signal</span>
        <span className={page.eyebrowRule} />
      </div>

      <div
        className={styles.signalCard}
        role="button"
        tabIndex={0}
        aria-label="Today's signal, tap for what it means"
        onClick={() => setInfoOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInfoOpen(true) } }}
        style={{ cursor: 'pointer', position: 'relative' }}
      >
        <span className={page.metricQ} aria-hidden style={{ position: 'absolute', top: 18, right: 18 }}>?</span>
        <div className={styles.verdict}>
          <span className={`${styles.verdictBadge} ${badgeCls}`}>
            <span className={styles.ic} aria-hidden>{BADGE_ICON[signal.lean]}</span>
            {signal.badge}
          </span>
        </div>

        <p className={styles.verdictLine}>{signal.verdict}</p>
        <p className={styles.verdictWhy}>{signal.why}</p>

        {signal.chips.length > 0 && (
          <div className={styles.signalRow}>
            {signal.chips.map((chip) => {
              const arrow = ARROW[chip.dir]
              return (
                <div key={`${chip.source}-${chip.label}`} className={styles.sigChip}>
                  <span className={`${styles.sigArrow} ${arrow.cls}`} aria-hidden>{arrow.glyph}</span>
                  <span className={styles.sigText}>
                    <span className={styles.sigVal}>{chip.label}</span>
                    <span className={styles.sigMeta}>{chip.source} · {chip.qualifier}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <button type="button" className={styles.talkPill} onClick={(e) => { e.stopPropagation(); openMentor() }}>
          ◇ talk about this with Vee
        </button>
      </div>

      {infoOpen && <SignalInfoSheet signal={signal} onClose={() => setInfoOpen(false)} />}
    </section>
  )
}
