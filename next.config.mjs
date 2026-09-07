import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Progress photos (and any base64 image) are sent through a Server Action,
    // whose request body defaults to a 1MB cap. A real photo blows past that, so
    // the action silently chokes and the UI looks frozen. Raise it to match the
    // 8MB image ceiling saveProgressPhoto already enforces.
    serverActions: { bodySizeLimit: '8mb' },
  },
  webpack: (config) => {
    // The vendored MCP source (mcp/src/*) is authored NodeNext-style with
    // explicit `.js` import specifiers (required by the stdio CLI's
    // moduleResolution). The hosted route imports that same source, so teach
    // webpack to resolve those `.js` specifiers back to their `.ts` files.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
  async redirects() {
    return [
      // Water moved into Fuel (single home). Keep old bookmarks alive.
      {
        source: '/app/fitness/water',
        destination: '/app/fuel/water',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    // Hosted-MCP OAuth discovery (Phase 2). MCP clients construct these
    // `.well-known` URLs themselves from the issuer (RFC 8414/9728), so they
    // MUST live at the origin root. Serve them from normal API routes via
    // rewrite — robust regardless of Next's dot-folder routing, and the route
    // handlers gate on MCP_ENABLED so they 404 while dark-launched.
    return [
      {
        // The Lab (arsenal storefront) is served as static files from
        // public/lab/. Map the bare /lab path onto its index.html so the
        // storefront has a clean URL (getvitality.com/lab once the brand
        // domain lands). All other /lab/* assets serve statically as-is.
        source: '/lab',
        destination: '/lab/index.html',
      },
      {
        // The Lab Lite (free storefront): same page as /lab, but Patreon-only
        // cards render greyed/locked. Served static from public/lite/.
        source: '/lite',
        destination: '/lite/index.html',
      },
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        // Path-aware variant some clients probe (issuer + resource path).
        source: '/.well-known/oauth-authorization-server/:path*',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        source: '/.well-known/openid-configuration',
        destination: '/api/mcp/oauth/as-metadata',
      },
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/mcp/oauth/protected-resource-metadata',
      },
      {
        source: '/.well-known/oauth-protected-resource/:path*',
        destination: '/api/mcp/oauth/protected-resource-metadata',
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Quiet builds (only verbose in CI).
  silent: !process.env.CI,
  // Wider client file upload = better stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry's own logger in production.
  disableLogger: true,
  // Source-map upload auto-skips without SENTRY_AUTH_TOKEN, so the build never
  // fails for a missing token. Add the token later for un-minified stack traces.
})

