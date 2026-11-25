"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * What every error.tsx renders. One component so a failed page looks the same
 * wherever it happens and always reports to Sentry.
 *
 * "Try again" calls `unstable_retry`, which re-fetches the segment. `reset`
 * only re-renders what already failed, so after a server error it brought the
 * same error straight back.
 *
 * The raw message is never shown: in production a server error's message is
 * replaced by a generic one anyway, and a client error's can be anything. The
 * digest is what support needs to find it in the logs.
 */
export function RouteErrorView({
  error,
  retry,
  title = "Something went wrong",
  description = "This page did not load. Our team has been notified. Trying again usually fixes it.",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error, { extra: { digest: error.digest } });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
        )}
      </div>
      <Button onClick={retry} variant="outline" size="sm" className="gap-1.5">
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
