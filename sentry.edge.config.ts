import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Edge runs on every request — keep this very low
  tracesSampleRate: 0.05,

  // Don't send IPs, cookies, auth headers — not needed and potential compliance issue
  sendDefaultPii: false,

  enableLogs: true,

  // Ignore expected Next.js control flow throws
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",
  ],
});