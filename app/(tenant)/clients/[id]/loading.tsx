// This loading.tsx is now intentionally minimal.
// The page itself uses inline <Suspense> boundaries per section,
// so granular skeletons are handled inside page.tsx.
// This file only covers the rare case where the page segment
// itself hasn't streamed yet (e.g. slow params resolution).

import { Skeleton } from "@/components/ui/skeleton";
import {
  HeaderSkeleton,
  StatsSkeleton,
  ContactSidebarSkeleton,
  RecentShipmentsSkeleton,
  QuoteHistorySkeleton,
  KycVaultSkeleton,
} from "./skeletons";

export default function ClientDetailLoading() {
  return (
    <div className="space-y-12">
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <HeaderSkeleton />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <StatsSkeleton />
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <div className="space-y-10 lg:border-r lg:pr-10">
          <ContactSidebarSkeleton />
        </div>
        <div className="min-w-0 space-y-12">
          <RecentShipmentsSkeleton />
          <QuoteHistorySkeleton />
          <KycVaultSkeleton />
        </div>
      </div>
    </div>
  );
}
