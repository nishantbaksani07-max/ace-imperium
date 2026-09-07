'use client'

import { useState } from 'react'
import VeeTile from './VeeTile'
import styles from './veeTile.module.css'
import { ASK_GLYPHS, resolveAskGlyph } from '@/lib/vee/askGlyphs'
import type { CardStyle, LayoutKind } from '@/lib/vee/askLayout'
import type { VeeAsk, VeeAskOption } from '@/app/app/mentor/types'

/*
 * AskCard — Vee asks a clarifying question as a cozy tappable card. One question
 * can wear any of ten layouts (see public/mentor-ask-layouts.html); the layout +
 * entrance + lead-reveal are chosen once per message (cardStyle) and frozen, so
 * re-renders are stable. Tapping an option plays a brief select animation, then
 * commits the answer (onPick) so the conversation flows on.
 */

const COMMIT_MS = 360

/** A 24x24 line icon from the registry, wrapped with the shared stroke style. */
function AskGlyph({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      dangerouslySetInnerHTML={{ __html: ASK_GLYPHS[resolveAskGlyph(name)] }} />
  )
}

/** The serif lead, revealed per the chosen mode; the key word ignites in iris. */
function Lead({ text, keyWord, mode }: { text: string; keyWord?: string; mode: string }) {
  const parts = text.split(/\s+/).filter(Boolean)
  const key = keyWord?.trim().toLowerCase()
  const isKey = (p: string) => !!key && p.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === key

  if (mode === 'line') {
    return (
      <div className={`${styles.askLead} ${styles.lineReveal}`}>
        {parts.map((p, i) => (
          <span key={i}>
            {isKey(p) ? <span className={styles.askKey} style={{ ['--kd' as string]: '.7s' } as React.CSSProperties}>{p}</span> : p}
            {i < parts.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    )
  }

  const wordCls = mode === 'wRise' ? styles.askWordRise : mode === 'wFade' ? styles.askWordFade : styles.askWord
  const step = mode === 'wRise' ? 0.09 : mode === 'wFade' ? 0.06 : 0.075
  let wi = 0
  return (
    <div className={styles.askLead}>
      {parts.map((p, i) => {
        const gap = i < parts.length - 1 ? ' ' : ''
        if (isKey(p)) {
          const kd = (parts.length * step + 0.1).toFixed(2)
          return <span key={i}><span className={styles.askKey} style={{ ['--kd' as string]: `${kd}s` } as React.CSSProperties}>{p}</span>{gap}</span>
        }
        const d = (wi++ * step).toFixed(2)
        return <span key={i}><span className={wordCls} style={{ animationDelay: `${d}s` }}>{p}</span>{gap}</span>
      })}
    </div>
  )
}

export default function AskCard({
  ask, answered, cardStyle, onPick, onSayOwnWords,
}: {
  ask: VeeAsk
  answered?: string
  cardStyle?: CardStyle
  onPick: (option: VeeAskOption) => void
  onSayOwnWords: () => void
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const layout: LayoutKind = cardStyle?.layout ?? 'chips'
  const sel = answered ?? picking
  const engaged = sel != null
  const selIndex = sel != null ? ask.options.findIndex(o => o.value === sel) : -1
  const n = ask.options.length

  function choose(o: VeeAskOption) {
    if (engaged) return
    setPicking(o.value)
    window.setTimeout(() => onPick(o), COMMIT_MS)
  }

  const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')
  const isSel = (o: VeeAskOption) => o.value === sel
  const isFaded = (o: VeeAskOption) => engaged && o.value !== sel

  function options() {
    switch (layout) {
      case 'cards':
        return (
          <div className={styles.deck}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.dcard, isSel(o) && styles.dcardSel, isFaded(o) && styles.optFaded)}>
                <span className={styles.dcardIco}><AskGlyph name={o.glyph} /></span>
                <span className={styles.dcardL}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      case 'tiles':
        return (
          <div className={styles.grid2}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.gtile, isSel(o) && styles.gtileSel, isFaded(o) && styles.optFaded)}>
                <AskGlyph name={o.glyph} /><span className={styles.gtileL}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      case 'spotlight':
        return (
          <div className={cls(styles.spots, engaged && styles.spotsEngaged)}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.spot, isSel(o) && styles.spotSel)}>
                <AskGlyph name={o.glyph} /><span className={styles.spotL}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      case 'fillpills':
        return (
          <div className={styles.fills}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.fpill, isSel(o) && styles.fpillSel, isFaded(o) && styles.optFaded)}>
                <AskGlyph name={o.glyph} /><span className={styles.fpillFl}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      case 'trail':
        return (
          <div className={styles.trail}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.step, isSel(o) && styles.stepSel)}>
                <span className={styles.stepDot}><AskGlyph name={o.glyph} /></span>
                <span className={styles.stepLabel}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      case 'segmented': {
        const left = selIndex >= 0 ? `calc(3px + (100% - 6px) * ${selIndex} / ${n})` : '3px'
        return (
          <div className={styles.seg} style={{ ['--n' as string]: String(n) } as React.CSSProperties}>
            <div className={cls(styles.segHi, engaged && styles.segHiOn)} style={{ left }} />
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.segBtn, isSel(o) && styles.segBtnSel)}>
                <AskGlyph name={o.glyph} /><span className={styles.segLabel}>{o.label}</span>
              </button>
            ))}
          </div>
        )
      }
      case 'split':
        return (
          <div className={styles.split}>
            <button type="button" disabled={engaged} onClick={() => choose(ask.options[0])}
              className={cls(styles.half, isSel(ask.options[0]) && styles.halfSel)}>
              <span className={styles.halfIco}><AskGlyph name={ask.options[0].glyph} /></span>
              <span className={styles.halfLabel}>{ask.options[0].label}</span>
            </button>
            <span className={styles.orMid}><span className={styles.orChip}>or</span></span>
            <button type="button" disabled={engaged} onClick={() => choose(ask.options[1])}
              className={cls(styles.half, isSel(ask.options[1]) && styles.halfSel)}>
              <span className={styles.halfIco}><AskGlyph name={ask.options[1].glyph} /></span>
              <span className={styles.halfLabel}>{ask.options[1].label}</span>
            </button>
          </div>
        )
      case 'dial': {
        const frac = selIndex >= 0 && n > 1 ? selIndex / (n - 1) : 0
        const pos = `calc(${frac} * (100% - 20px) + 10px)`
        return (
          <div className={styles.dial}>
            <div className={styles.dialRail}>
              <div className={styles.dialFill} style={{ width: engaged ? pos : '10px' }} />
              <div className={cls(styles.dialThumb, engaged && styles.dialThumbOn)} style={{ left: engaged ? pos : '10px' }} />
            </div>
            <div className={styles.stops}>
              {ask.options.map(o => (
                <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                  className={cls(styles.stop, isSel(o) && styles.stopSel)}>
                  <span className={styles.stopDot} /><span className={styles.stopText}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      }
      case 'meter':
        return (
          <div className={styles.meter}>
            <div className={styles.bars}>
              {ask.options.map((o, i) => (
                <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                  className={cls(styles.bar, selIndex >= 0 && i <= selIndex && styles.barFill)} />
              ))}
            </div>
            <div className={styles.barLabels}>
              {ask.options.map((o, i) => (
                <span key={o.value} className={cls(i === selIndex && styles.barLabelOn)}>{o.label}</span>
              ))}
            </div>
          </div>
        )
      case 'chips':
      default:
        return (
          <div className={styles.choices}>
            {ask.options.map(o => (
              <button key={o.value} type="button" disabled={engaged} onClick={() => choose(o)}
                className={cls(styles.btn, styles.opt, isSel(o) && styles.optChosen, isFaded(o) && styles.optFaded)}>
                <AskGlyph name={o.glyph} />{o.label}
              </button>
            ))}
          </div>
        )
    }
  }

  return (
    <VeeTile tag={ask.tag} className={cardStyle?.entrance ? styles[cardStyle.entrance] : undefined}>
      <Lead text={ask.lead} keyWord={ask.key} mode={cardStyle?.leadMode ?? 'w'} />
      {ask.sub ? <p className={styles.sub}>{ask.sub}</p> : null}
      {options()}
      {!engaged && (
        <button type="button" className={styles.say} onClick={onSayOwnWords}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          say it in my own words
        </button>
      )}
    </VeeTile>
  )
}
