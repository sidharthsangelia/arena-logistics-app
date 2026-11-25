import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ShipmentHistorySkeleton } from "@/components/tracking/ShipmentHistory";

import {
  AddressesSkeleton,
  BookingSummarySkeleton,
  DocumentsSkeleton,
  FirstMileSkeleton,
  HeaderSkeleton,
  PackagesSkeleton,
  PricingSkeleton,
  SectionTitle,
  StatusSkeleton,
  WalletTransactionsSkeleton,
} from "./skeletons";

/**
 * The page renders its shell at once and streams each section behind its own
 * Suspense, so this only covers the route chunk arriving. It is that same
 * shell with the same section fallbacks: the back link and every section
 * heading and label are real, only the shipment's own values are skeletons.
 */
export default function ShipmentDetailLoading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
        <Link
          href="/shipments"
          className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          All shipments
        </Link>

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
              <section className="space-y-5">
                <SectionTitle>History</SectionTitle>
                <ShipmentHistorySkeleton />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
