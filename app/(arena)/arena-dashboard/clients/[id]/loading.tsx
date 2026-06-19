// This loading.tsx is now intentionally minimal.
// The page itself uses inline <Suspense> boundaries per section,
// so granular skeletons are handled inside page.tsx.
// This file only covers the rare case where the page segment
// itself hasn't streamed yet (e.g. slow params resolution).

import {
  HeaderSkeleton,
  StatsSkeleton,
  ContactSidebarSkeleton,
  QuoteHistorySkeleton,
  KycVaultSkeleton,
} from "./skeletons";

export default function ClientDetailLoading() {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HeaderSkeleton />
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-md bg-muted animate-pulse" />
          <div className="h-8 w-28 rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      {/* Stats */}
      <StatsSkeleton />

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <ContactSidebarSkeleton />
        </div>
        <div className="space-y-5">
          <QuoteHistorySkeleton />
          <KycVaultSkeleton />
        </div>
      </div>
    </>
  );
}