'use client'

import styles from './peak.module.css'

export interface TodayBullet {
  title: string
  body: string
}

interface Props {
  hero: { title: string; body: string }
  bullets?: TodayBullet[]
}

/**
 * One consolidated "Today" card — eyebrow + italic hero recommendation +
 * supporting bullets. Signal chips moved to LiveInputsBar above the
 * chart so they're not duplicated here.
 */
export default function TodayCard({ hero, bullets = [] }: Props) {
  return (
    <div
      className={styles.pkInnerCard}
      style={{
        padding: '22px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--mint)',
          fontWeight: 600,
        }}
      >
        Today
      </span>

      <div>
        <div
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 26,
            lineHeight: 1.2,
            color: 'var(--fg)',
            marginBottom: 8,
          }}
        >
          {hero.title}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg)', maxWidth: 640 }}>
          {hero.body}
        </div>
      </div>

      {bullets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--mint)',
                  boxShadow: '0 0 8px rgba(110,231,183,0.7)',
                  marginTop: 7,
                  flex: 'none',
                }}
              />
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{b.title}</span>{' '}
                <span style={{ color: 'rgba(255,255,255,0.78)' }}>{b.body}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
