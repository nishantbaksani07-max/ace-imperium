import { ImageResponse } from 'next/og'

/**
 * Open Graph card for the Arts District gallery (/district).
 *
 * Rendered at build/request time by next/og (Satori) — no committed binary, no
 * remote fetch. Everything is inline: the Vitality gem is an SVG embedded as a
 * base64 data-URI, the background is a pure-black brand canvas with a mint glow,
 * and the type uses a safe system sans stack (Satori cannot resolve our
 * next/font CSS vars in this context, so we never reference them here).
 *
 * When a /district link is pasted into a YouTube description or a social post,
 * this is the branded preview that shows.
 */
export const runtime = 'nodejs'
export const alt = 'Vitality Arts District — a gallery of ready-made tiles'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Vitality gem mark — the flat-faceted "V" gem, solid fills on near-black.
// Same geometry as app/icon.tsx so the brand mark stays consistent.
const GEM = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="282 328 460 460">
  <path d="M392 372 L632 372 L724 470 L512 744 L300 470 Z" fill="#1f4d3d"/>
  <path d="M392 372 L300 470 L392 470 Z" fill="#A7F3D0"/>
  <path d="M392 372 L632 372 L632 470 L392 470 Z" fill="#C9F7E1"/>
  <path d="M632 372 L724 470 L632 470 Z" fill="#46B488"/>
  <path d="M300 470 L392 470 L512 744 Z" fill="#6EE7B7"/>
  <path d="M392 470 L512 470 L512 744 Z" fill="#46B488"/>
  <path d="M512 470 L632 470 L512 744 Z" fill="#1f4d3d"/>
  <path d="M632 470 L724 470 L512 744 Z" fill="#1f4d3d"/>
</svg>`

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export default function DistrictOgImage() {
  const gemUri = `data:image/svg+xml;base64,${Buffer.from(GEM).toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#000000',
          padding: '72px 88px',
          position: 'relative',
        }}
      >
        {/* mint glow, top-left, subtle */}
        <div
          style={{
            position: 'absolute',
            top: -260,
            left: -160,
            width: 720,
            height: 720,
            borderRadius: 720,
            background:
              'radial-gradient(circle, rgba(110,231,183,0.30) 0%, rgba(110,231,183,0.10) 42%, rgba(0,0,0,0) 70%)',
          }}
        />
        {/* wordmark row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gemUri} width={64} height={64} alt="" />
          <div
            style={{
              fontFamily: SANS,
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: 2,
              color: '#6EE7B7',
              textTransform: 'uppercase',
            }}
          >
            Vitality
          </div>
        </div>
        {/* title block */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 118,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -2,
              color: '#ffffff',
            }}
          >
            Arts District
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 38,
              fontWeight: 400,
              marginTop: 24,
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            A gallery of ready-made tiles. Add one to your dashboard in a tap.
          </div>
        </div>
        {/* footer accent line */}
        <div
          style={{
            display: 'flex',
            height: 6,
            width: 220,
            borderRadius: 6,
            background:
              'linear-gradient(90deg, #6EE7B7 0%, rgba(110,231,183,0) 100%)',
          }}
        />
      </div>
    ),
    { ...size },
  )
}
