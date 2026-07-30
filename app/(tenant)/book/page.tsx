import { Suspense } from "react";

import BookingWizard from "@/components/booking/BookingWizard";
import { getBookingOrgContext } from "@/actions/book/bookingContext.action";
import { getBookingDraft } from "@/actions/book/bookingDraft.action";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The heading is static, so it paints immediately; the wizard streams in once
// its org context and any saved draft resolve.
//
// Neither of those reads is cached, on purpose. The draft is the user's own
// half-finished booking, and showing them a version from even a few seconds ago
// risks silently discarding what they last typed. The org context carries the
// payment mode a booking is about to be charged against. Both belong in the
// "must always be fresh" bucket.
export default function BookPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Book Order
      </h1>
      <p className="text-sm text-slate-500 mt-1">
        Create and confirm a new shipment booking.
      </p>

      <Suspense fallback={<BookingWizardSkeleton />}>
        <BookingWizardSection />
      </Suspense>
    </div>
  );
}

async function BookingWizardSection() {
  // Fetched server-side and handed to the (client) wizard: org flags drive
  // BA-only features + payment mode, and any saved draft lets the user resume
  // a half-finished booking.
  const [orgContext, draftResult] = await Promise.all([
    getBookingOrgContext(),
    getBookingDraft(),
  ]);

  const initialDraft = draftResult.ok ? draftResult.data : null;

  return <BookingWizard orgContext={orgContext} initialDraft={initialDraft} />;
}

/** Matches the wizard's stepper + current-step form card. */
function BookingWizardSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-8 flex items-center justify-between gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-6 p-6">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
