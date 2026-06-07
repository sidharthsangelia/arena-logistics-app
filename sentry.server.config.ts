import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  
  // Only send errors in production — no noise during dev
  enabled: process.env.NODE_ENV === "production",
  
  // 10% of transactions for performance monitoring
  // Increase once you understand your traffic patterns
  tracesSampleRate: 0.1,
  
  // Filter out noise that isn't actionable
  ignoreErrors: [
    "NEXT_NOT_FOUND",
    "NEXT_REDIRECT",        // redirect() throws this — not an error
    "ResendError",          // handle in your action already
  ],

  beforeSend(event, hint) {
    const error = hint.originalException;
    
    // Don't send Prisma "record not found" as errors — 
    // those are expected and handled via notFound()
    if (
      error instanceof Error &&
      error.message.includes("RecordNotFound")
    ) {
      return null;
    }

    return event;
  },
});