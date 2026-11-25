import {
  ShipmentStatCardsSkeleton,
  ShipmentsPageHeader,
  ShipmentsTableFallback,
  TotalBadgeSkeleton,
} from "./skeletons";

/**
 * Same pieces as the page's own Suspense fallbacks: the heading, card labels and
 * the table's toolbar, headers and pager render for real; only the total, the
 * four figures and the rows are skeletons.
 */
export default function ShipmentsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6" aria-busy="true">
      <ShipmentsPageHeader badge={<TotalBadgeSkeleton />} />
      <ShipmentStatCardsSkeleton />
      <ShipmentsTableFallback />
    </div>
  );
}
