'use client'

import { useState } from 'react'
import CozyLoader from '@/components/CozyLoader'
import { COZY_SETS, type CozySet } from '@/lib/cozy'
import styles from './cozyLibrary.module.css'

/**
 * Cozy Loader Library — the design lab for Vitality's "cozy wait" card.
 *
 * Mirrors /gem-library: a public route that mounts the REAL CozyLoader (no
 * re-port, no drift) and drives it from the canonical lib/cozy content sets.
 * Every section that will host a cozy loader gets a live panel here, plus
 * global controls to feel out timing, the progress bar, dots, and tags before
 * it ships. New lines come from lib/cozy/PROMPT.md (the claude.ai generator).
 */

const INTERVALS: { ms: number; label: string }[] = [
  { ms: 2000, label: '2.0s' },
  { ms: 3200, label: '3.2s' },
  { ms: 5000, label: '5.0s' },
]

export default function CozyLibrary() {
  const [intervalMs, setIntervalMs] = useState(3200)
  const [showProgress, setShowProgress] = useState(true)
  const [showDots, setShowDots] = useState(true)
  const [showTags, setShowTags] = useState(true)

  const totalLines = COZY_SETS.reduce((n, s) => n + s.items.length, 0)

  return (
    <main className={styles.page}>
      <div className={styles.aurora} aria-hidden />

      <div className={styles.shell}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>Vitality · Components</div>
          <h1 className={styles.title}>Cozy Loader Library</h1>
          <p className={styles.sub}>
            The warm cozy-wait card, now a recurring Vitality theme. One component, one content
            library. A playful tag bounces in, the line springs up with a key phrase color
            emphasized, and the whole card tints to the line&apos;s tone, cross-fading every few
            seconds. Below is every section&apos;s set running live. {COZY_SETS.length} loaders,{' '}
            {totalLines} lines so far.
          </p>
        </header>

        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Swap every</span>
            <div className={styles.segmented}>
              {INTERVALS.map((it) => (
                <button
                  key={it.ms}
                  className={`${styles.seg} ${intervalMs === it.ms ? styles.segOn : ''}`}
                  onClick={() => setIntervalMs(it.ms)}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.controlGroup}>
            <Toggle on={showTags} onToggle={() => setShowTags((v) => !v)} label="Tag" />
            <Toggle on={showProgress} onToggle={() => setShowProgress((v) => !v)} label="Progress" />
            <Toggle on={showDots} onToggle={() => setShowDots((v) => !v)} label="Dots" />
          </div>
        </div>

        <div className={styles.grid}>
          {COZY_SETS.map((set) => (
            <SectionPanel
              key={set.id}
              set={set}
              intervalMs={intervalMs}
              showProgress={showProgress}
              showDots={showDots}
              showTags={showTags}
            />
          ))}
        </div>

        <footer className={styles.foot}>
          <p>
            Content lives in <code>lib/cozy/</code>. Generate more lines with{' '}
            <code>lib/cozy/PROMPT.md</code> and drop the JSON into a section file. Drop the loader
            anywhere with <code>{'<CozyLoader items={...} tags={...} title="…" />'}</code>.
          </p>
        </footer>
      </div>
    </main>
  )
}

function SectionPanel({
  set,
  intervalMs,
  showProgress,
  showDots,
  showTags,
}: {
  set: CozySet
  intervalMs: number
  showProgress: boolean
  showDots: boolean
  showTags: boolean
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelLabel}>{set.label}</span>
        <span className={styles.panelMeta}>
          {set.items.length} lines
          <span className={styles.swatches} aria-hidden>
            {set.tones.map((t) => (
              <i key={t} className={styles.swatch} data-tone={t} title={t} />
            ))}
          </span>
        </span>
      </div>
      <CozyLoader
        items={set.items}
        tags={showTags ? set.tags : undefined}
        title={set.title}
        intervalMs={intervalMs}
        showProgress={showProgress}
        showDots={showDots}
        leading={set.id === 'fuel' ? <span className={styles.shimmer} aria-hidden /> : undefined}
      />
    </section>
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={onToggle}
      aria-pressed={on}
    >
      <span className={styles.toggleDot} />
      {label}
    </button>
  )
}
