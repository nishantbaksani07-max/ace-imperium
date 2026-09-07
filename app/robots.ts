import type { MetadataRoute } from 'next'

/**
 * robots.txt for Vitality, served by Next.js at /robots.txt.
 *
 * Allows every crawler on the public marketing + Pillar-3 surfaces (the home
 * page, the Arts District, the makers gallery, pricing, and the public maker
 * profiles at /u/*), and disallows the private, signed-in areas so shared
 * links index cleanly while dashboards, the account page, the API, and admin
 * tooling stay out of search results.
 *
 * The base URL comes from NEXT_PUBLIC_SITE_URL when set (Vercel prod), and
 * falls back to the known prod host so the sitemap reference is always
 * absolute and correct.
 */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private, auth-gated surfaces. Kept out of the index so only the
        // public Pillar-3 pages surface in search.
        disallow: ['/app', '/account', '/api', '/admin'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
