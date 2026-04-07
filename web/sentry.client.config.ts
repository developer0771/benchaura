// web/sentry.client.config.ts
// Sentry frontend error monitoring.
// Captures React errors, unhandled promise rejections, and WebRTC failures.
// Run `npx @sentry/wizard@latest -i nextjs` to generate sentry.server.config.ts too.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of sessions for performance monitoring
  // Increase to 1.0 (100%) temporarily when debugging production issues
  tracesSampleRate: 0.1,

  // Record 10% of sessions for session replay
  // Useful for seeing exactly what a user did before an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0, // Always capture replay when an error occurs

  integrations: [
    Sentry.replayIntegration({
      // Don't record video content (privacy)
      maskAllText: false,
      blockAllMedia: true,
    }),
  ],

  // Don't send errors in development (they'll show in console instead)
  enabled: process.env.NODE_ENV === 'production',

  beforeSend(event) {
    // Filter out noisy non-actionable errors
    const message = event.message ?? '';
    if (
      message.includes('ResizeObserver loop') ||
      message.includes('AbortError') ||
      message.includes('play() failed because the user')
    ) {
      return null; // drop this event
    }
    return event;
  },
});
