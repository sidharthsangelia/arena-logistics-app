"use client";

import { RouteErrorView } from "@/components/RouteErrorView";

export default function ClientsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteErrorView error={error} retry={unstable_retry} title="Clients did not load" />;
}
