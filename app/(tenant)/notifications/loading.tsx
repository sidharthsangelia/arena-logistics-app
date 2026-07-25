import { Skeleton } from "@/components/ui/skeleton";
import { NotificationHistorySkeleton } from "@/components/notifications/NotificationHistorySkeleton";

// Instant fallback while the tenant inbox page resolves its notifications query.
export default function TenantNotificationsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>

      <NotificationHistorySkeleton rows={6} />
    </div>
  );
}
