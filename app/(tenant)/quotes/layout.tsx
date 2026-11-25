import { Suspense } from "react";

import QuotesToolbar from "@/components/quotes/QuotesToolbar";
import { QuotesTableSkeleton } from "@/components/quotes/QuotesTable";
import { BusinessAssociateGate } from "@/components/tenant/BusinessAssociateGate";

export default function QuotesPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Quotes are a Business-Associate-only feature. The sidebar hides this route
  // for standard orgs; the gate enforces it against direct navigation. It sits
  // inside Suspense so the heading paints without waiting on it (see the gate).
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <QuotesToolbar />

      <Suspense fallback={<QuotesTableSkeleton />}>
        <BusinessAssociateGate>{children}</BusinessAssociateGate>
      </Suspense>
    </div>
  );
}
