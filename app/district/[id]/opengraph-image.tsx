import { ImageResponse } from 'next/og'
import { PUBLIC_FEATURED_TILES } from '@/lib/tiles/featured'

/**
 * Open Graph card for a single Arts District tile (/district/[id]).
 *
 * The tile's display name is resolved from the static FEATURED_TILES catalog by
 * matching the route param against each entry's stable shop id; the name lives
 * on envelope.name (the install envelope handed to tileStore.importTile). If the
 * id is unknown we fall back to a generic "A Vitality tile" card so a stale or
 * mistyped link still previews on-brand.
 *
 * Rendered by next/og (Satori) — fully self-contained: the gem is an inline
 * base64 SVG data-URI, no remote asset or font is fetched, and type uses a safe
 * system sans stack (our next/font vars are not available in this context).
 */
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Vitality gem mark — flat-faceted "V" gem, same geometry as app/icon.tsx.
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

export default async function TileOgImage({
  params,
}: {
  params: { id: string }
}) {
  const tile = PUBLIC_FEATURED_TILES.find((t) => t.id === params.id)
  const title = tile ? tile.envelope.name : 'A Vitality tile'
  const tagline = tile
    ? tile.tagline
    : 'A ready-made tile for your Vitality dashboard.'
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
        {/* mint glow, top-left */}
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
        {/* wordmark + kicker row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
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
          <div
            style={{
              fontFamily: SANS,
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: 2,
              color: 'rgba(255,255,255,0.42)',
              textTransform: 'uppercase',
            }}
          >
            Arts District
          </div>
        </div>
        {/* title block */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}
          >
            <div
              style={{
                width: 14,
                height: 88,
                borderRadius: 8,
                background: '#6EE7B7',
              }}
            />
            <div
              style={{
                fontFamily: SANS,
                fontSize: 108,
                fontWeight: 700,
                lineHeight: 1.02,
                letterSpacing: -2,
                color: '#ffffff',
              }}
            >
              {title}
            </div>
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 38,
              fontWeight: 400,
              marginTop: 28,
              color: 'rgba(255,255,255,0.62)',
              maxWidth: 900,
            }}
          >
            {tagline}
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
