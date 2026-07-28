// This loading.tsx is now intentionally minimal.
// The page itself uses inline <Suspense> boundaries per card, so granular,
// layout-matched skeletons are handled inside page.tsx (see ./skeletons).
// This file only covers the rare case where the page segment itself hasn't
// streamed yet (e.g. slow params resolution) — same shell, same skeletons.

import {
  HeroSkeleton,
  FirstMileSkeleton,
  AddressesSkeleton,
  PackagesSkeleton,
  PricingSkeleton,
  DocumentsSkeleton,
  WalletTransactionsSkeleton,
  BookingSummarySkeleton,
  StatusHistorySkeleton,
  ShipmentIdSkeleton,
} from "./skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ShipmentDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-5">
        {/* Back link */}
        <Skeleton className="h-4 w-32" />

        <HeroSkeleton />
        <FirstMileSkeleton />

        <div className="grid gap-5 xl:grid-cols-[1fr_260px] xl:items-start">
          <div className="space-y-5 min-w-0">
            <AddressesSkeleton />
            <PackagesSkeleton />
            <PricingSkeleton />
            <DocumentsSkeleton />
            <WalletTransactionsSkeleton />
          </div>
          <div className="space-y-4">
            <BookingSummarySkeleton />
            <StatusHistorySkeleton />
            <ShipmentIdSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
