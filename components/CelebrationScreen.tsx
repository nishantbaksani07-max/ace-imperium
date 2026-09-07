'use client'

import { useEffect, useState } from 'react'
import SectionGem from '@/components/SectionGem'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import RevealText from '@/components/RevealText'
import type { GlyphName } from '@/lib/gemGlyphs'
import styles from './celebrationScreen.module.css'

/**
 * CelebrationScreen — the one shared "you did it" layout for Vitality.
 *
 * Every congrats / milestone moment (wearable paired, quiz complete, first
 * workout logged, streak hit, …) renders through this so they all feel like
 * the same character celebrating with you: cozy spring entrance, mint
 * atmosphere, decorative sparks, the real gem as the hero, then eyebrow →
 * serif title → sub → optional summary card → buttons.
 *
 * Only the gem MARK and the copy change between screens. Pick the gem glyph
 * that matches the moment (an animated mark like LINK or RADIAL loops its own
 * charge→confirm celebration; a static mark can fire a one-time CHECK pop via
 * `celebrateOnMount`). See docs/SKILL-celebration-screens.md.
 */

export interface CelebrationAction {
  label: string
  /** Render as a link (use for navigation). Takes precedence over onClick. */
  href?: string
  onClick?: () => void
  disabled?: boolean
}

export interface CelebrationCard {
  /** Small uppercase key, e.g. "working toward". */
  key: string
  /** The headline value, e.g. the goal name. */
  value: string
  /** Optional pill under the value, e.g. "tracking your recovery". */
  chip?: string
}

export interface CelebrationScreenProps {
  /** Gem mark for the moment. LINK = paired, RADIAL = quiz complete, etc. */
  gemGlyph: GlyphName
  /** Polyhedron + mark size on the gem. Defaults read well for the marks. */
  gemShape?: 'icosahedron' | 'dodecahedron' | 'octahedron' | 'tetrahedron'
  gemGlyphScale?: number
  /** Fire the gem's one-time CHECK celebration shortly after mount. Use for
   *  STATIC marks; animated marks (LINK/RADIAL) already loop their own. */
  celebrateOnMount?: boolean

  backHref?: string
  backLabel?: string

  eyebrow: string
  title: string
  /** A word/phrase in the title to make glow mint (e.g. the brand "whoop",
   *  "fitbit", "garmin"). Must appear in `title` verbatim. */
  highlight?: string
  sub?: string
  card?: CelebrationCard
  /** Rich element rendered between the sub and the buttons, in place of `card`
   *  when a moment needs more than key/value/chip (e.g. the session verdict). */
  slot?: React.ReactNode

  primary: CelebrationAction
  secondary?: CelebrationAction
  /** Anything extra below the buttons (e.g. a focus-swap row). */
  children?: React.ReactNode
}

// Celebratory motes that pop outward from the gem, on a loop, so the moment
// reads happy + alive. Deterministic (no random) so SSR and client match.
const BURST_SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.32
  const dist = 118 + (i % 4) * 20
  return {
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist),
    delay: ((i * 0.41) % 3.2).toFixed(2),
  }
})

function ActionButton({ action, className, withArrow }: { action: CelebrationAction; className: string; withArrow?: boolean }) {
  const label = withArrow ? <>{action.label} <span aria-hidden>→</span></> : action.label
  if (action.href && !action.disabled) {
    return <a href={action.href} className={className}>{label}</a>
  }
  return (
    <button className={className} onClick={action.onClick} disabled={action.disabled}>
      {label}
    </button>
  )
}

export default function CelebrationScreen({
  gemGlyph,
  gemShape = 'dodecahedron',
  gemGlyphScale = 1.45,
  celebrateOnMount = false,
  backHref,
  backLabel = '← Vitals',
  eyebrow,
  title,
  highlight,
  sub,
  card,
  slot,
  primary,
  secondary,
  children,
}: CelebrationScreenProps) {
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (!celebrateOnMount) return
    const t = setTimeout(() => setComplete(true), 120)
    return () => clearTimeout(t)
  }, [celebrateOnMount])

  return (
    <div className={`${styles.page} grain-overlay`}>
      <WelcomeBackdrop />

      {backHref && <a href={backHref} className={styles.back}>{backLabel}</a>}

      <div className={styles.shell}>
        <div className={styles.gemWrap}>
          <div className={styles.bursts} aria-hidden>
            <span className={styles.ring} />
            <span className={`${styles.ring} ${styles.ring2}`} />
            <span className={`${styles.ring} ${styles.ring3}`} />
            {BURST_SPARKS.map((s, i) => (
              <span
                key={i}
                className={styles.sparkle}
                style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, animationDelay: `${s.delay}s` } as React.CSSProperties}
              />
            ))}
          </div>
          <div className={styles.gemInner}>
            <SectionGem
              glyph={gemGlyph}
              shape={gemShape}
              glyphScale={gemGlyphScale}
              size={260}
              position="inline"
              complete={complete}
            />
          </div>
        </div>

        <span className={styles.eyebrow}>
          <span className={styles.rule} aria-hidden />
          {eyebrow}
        </span>
        <RevealText as="h1" className={styles.title} text={title} highlight={highlight ?? ''} glow delay={180} />
        {sub && <RevealText className={styles.sub} text={sub} highlight="" delay={620} />}

        {slot}

        {card && (
          <div className={styles.card}>
            <span className={styles.cardKey}>{card.key}</span>
            <span className={styles.cardValue}>{card.value}</span>
            {card.chip && (
              <span className={styles.chip}>
                <span className={styles.chipDot} />
                {card.chip}
              </span>
            )}
          </div>
        )}

        <div className={styles.buttons}>
          <ActionButton action={primary} className={styles.primaryBtn} withArrow />
          {secondary && <ActionButton action={secondary} className={styles.ghostBtn} />}
        </div>

        {children && <div className={styles.extra}>{children}</div>}
      </div>
    </div>
  )
}
