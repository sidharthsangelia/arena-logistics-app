import { Suspense } from "react";

import BookingWizard from "@/components/booking/BookingWizard";
import BookingWizardSkeleton from "@/components/booking/BookingWizardSkeleton";
import { getBookingOrgContext } from "@/actions/book/bookingContext.action";
import { getBookingDraft } from "@/actions/book/bookingDraft.action";

import { BookPageHeading } from "./heading";

// The heading is static, so it paints immediately; the wizard streams in once
// its org context and any saved draft resolve.
//
// Neither of those reads is cached, on purpose. The draft is the user's own
// half-finished booking, and showing them a version from even a few seconds ago
// risks silently discarding what they last typed. The org context carries the
// payment mode a booking is about to be charged against. Both belong in the
// "must always be fresh" bucket.
//
// The fallback is the wizard's own shell rather than an arrangement of grey
// boxes: the stepper, the mode question and the navigation are fixed content,
// so they are on screen and in their final positions for the whole fetch. See
// components/booking/BookingWizardSkeleton.tsx.
export default function BookPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <BookPageHeading />

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
