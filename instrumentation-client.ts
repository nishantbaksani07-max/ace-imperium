// Sentry — browser (client) error monitoring. Runs only in production builds so
// dev noise never reaches the dashboard. DSN is public by design (it ships in
// the client bundle), so it lives inline — no env var needed for basic capture.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  // Error monitoring only for v1 (no tracing/replay) to keep the bundle light
  // and stay well inside the free plan. Add tracesSampleRate / replay later.
})

// Lets Sentry tie client-side navigations to errors (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
