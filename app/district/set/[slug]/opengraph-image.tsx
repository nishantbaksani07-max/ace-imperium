import { ImageResponse } from 'next/og'
import { FEATURED_COLLECTIONS, tilesForCollection } from '@/lib/tiles/featured'
import { designByKey } from '@/lib/tiles/designs'

/**
 * Open Graph card for a curated set (/district/set/[slug]). Same chrome as the
 * single-tile card (app/district/[id]/opengraph-image.tsx): black, mint glow,
 * gem wordmark. The difference is the promise: the collection title plus a row
 * of mini tile posters, so the link preview visibly shows a dashboard-in-a-box.
 *
 * The posters are the SAME recolorable design SVGs the pages render
 * (designByKey); each is recolored by replacing currentColor with the tile's
 * accent, then embedded as a base64 data URI. Fully self-contained: no remote
 * asset or font is fetched, type uses a safe system sans stack. An unknown slug
 * falls back to a generic on-brand card so a stale link still previews fine.
 */
export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Vitality gem mark - flat-faceted "V" gem, same geometry as app/icon.tsx.
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

/** A design SVG as a data URI, recolored to the tile's accent (the SVGs draw
 *  with currentColor, which never resolves inside an <img>). */
function posterUri(svg: string, accent: string): string {
  const colored = svg.replace(/currentColor/g, accent)
  return `data:image/svg+xml;base64,${Buffer.from(colored).toString('base64')}`
}

export default async function SetOgImage({
  params,
}: {
  params: { slug: string }
}) {
  const collection = FEATURED_COLLECTIONS.find((c) => c.id === params.slug)
  const tiles = collection ? tilesForCollection(collection.id) : []
  const title = collection ? collection.title : 'A Vitality set'
  const line = collection
    ? `${tiles.length} tiles · add the whole set in one tap`
    : 'A ready-made set of tiles for your dashboard.'
  const gemUri = `data:image/svg+xml;base64,${Buffer.from(GEM).toString('base64')}`

  const posters = tiles.slice(0, 4).flatMap((t) => {
    const d = designByKey(t.envelope.design)
    if (!d) return []
    return [{ uri: posterUri(d.svg, t.accent), name: t.envelope.name }]
  })

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
          padding: '64px 88px 56px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 14,
                height: 76,
                borderRadius: 8,
                background: '#6EE7B7',
              }}
            />
            <div
              style={{
                fontFamily: SANS,
                fontSize: 92,
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
              display: 'flex',
              fontFamily: SANS,
              fontSize: 34,
              fontWeight: 400,
              marginTop: 22,
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            {line}
          </div>
        </div>
        {/* the dashboard-in-a-box: a row of mini tile posters */}
        {posters.length > 0 ? (
          <div style={{ display: 'flex', gap: 22 }}>
            {posters.map((p) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  width: 224,
                  padding: '18px 14px 14px',
                  borderRadius: 20,
                  background: 'rgba(16,42,33,0.55)',
                  border: '1px solid rgba(110,231,183,0.22)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.uri} width={188} height={117} alt="" />
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 22,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.72)',
                  }}
                >
                  {p.name}
                </div>
              </div>
            ))}
          </div>
        ) : (
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
        )}
      </div>
    ),
    { ...size },
  )
}
