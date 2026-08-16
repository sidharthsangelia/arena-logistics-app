import { NotificationHistorySkeleton } from "@/components/notifications/NotificationHistorySkeleton";

/**
 * Covers the instant between opening the arena inbox and the route rendering.
 *
 * The heading and the line under it are fixed copy and are rendered as
 * themselves, so the only thing that ever appears as a placeholder here is the
 * list, which is the only thing being fetched. The page repeats this header
 * verbatim, so the swap moves nothing.
 */
export default function ArenaNotificationsLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New bookings and anything that needs somebody to pick it up.
        </p>
      </header>

      <NotificationHistorySkeleton rows={7} />
    </div>
  );
}
