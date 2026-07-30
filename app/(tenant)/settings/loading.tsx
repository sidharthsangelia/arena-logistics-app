import {
  ProfileTabSkeleton,
  SettingsTabStripSkeleton,
} from "@/components/settings/SettingsSkeletons";

/**
 * Covers the route chunk arriving, and stops the (tenant) dashboard fallback
 * from standing in for this route.
 *
 * Identical to what page.tsx paints on its first frame: the real heading and the
 * real row labels, with skeletons only where a value goes. So the handover from
 * this file to the page is invisible and nothing on screen moves.
 */
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Your details, your documents, and who hears about your shipments.
        </p>
      </header>

      <div className="space-y-6">
        <SettingsTabStripSkeleton />
        <ProfileTabSkeleton />
      </div>
    </div>
  );
}
