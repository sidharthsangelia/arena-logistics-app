import BookingWizardSkeleton from "@/components/booking/BookingWizardSkeleton";

import { BookPageHeading } from "./heading";

/**
 * Nothing here is a placeholder, because nothing on the booking wizard's first
 * screen comes from the server. The heading is static; the wizard shell below
 * is the real stepper, the real mode question and the real navigation, drawn in
 * their final positions while the org context and any saved draft load.
 *
 * Identical to the page's own Suspense fallback — the same component, not a
 * copy of it — so the route taking over from this file moves nothing.
 */
export default function BookLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <BookPageHeading />
      <BookingWizardSkeleton />
    </div>
  );
}
