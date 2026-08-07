// This loading.tsx is now intentionally minimal.
// The page itself uses inline <Suspense> boundaries per section, so granular,
// layout-matched skeletons are handled inside page.tsx (see ./skeletons).
// This file only covers the rare case where the page segment itself hasn't
// streamed yet (e.g. slow params resolution) — same shell, same skeletons.

import {
  HeaderSkeleton,
  StatusSkeleton,
  FirstMileSkeleton,
  AddressesSkeleton,
  PackagesSkeleton,
  PricingSkeleton,
  DocumentsSkeleton,
  WalletTransactionsSkeleton,
  BookingSummarySkeleton,
  StatusHistorySkeleton,
} from "./skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
        {/* Back link */}
        <Skeleton className="h-4 w-32" />

        <div className="mt-8 space-y-12">
          <HeaderSkeleton />
          <StatusSkeleton />
          <FirstMileSkeleton />

          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_244px] xl:items-start xl:gap-x-10">
            <div className="min-w-0 space-y-12">
              <AddressesSkeleton />
              <PackagesSkeleton />
              <DocumentsSkeleton />
              <PricingSkeleton />
              <WalletTransactionsSkeleton />
            </div>
            <div className="space-y-10 xl:border-l xl:pl-10">
              <BookingSummarySkeleton />
              <StatusHistorySkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
