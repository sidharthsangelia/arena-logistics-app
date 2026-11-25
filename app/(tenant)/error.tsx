"use client";

import { RouteErrorView } from "@/components/RouteErrorView";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteErrorView error={error} retry={unstable_retry} />;
}
