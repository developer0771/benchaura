// web/sentry.client.config.ts
// Sentry frontend error monitoring — only active when @sentry/nextjs is installed and DSN is set.

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      enabled: process.env.NODE_ENV === 'production',
    });
  } catch {
    // @sentry/nextjs not installed — skip
  }
}
