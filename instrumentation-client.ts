import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",

  // No performance monitoring on client — not worth the bundle size yet
  tracesSampleRate: 1,

  // No session replay yet — costs money and adds ~50kb to bundle
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});