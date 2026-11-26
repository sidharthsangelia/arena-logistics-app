/**
 * Holds the place of Clerk's SignIn / SignUp card while its script loads, in
 * the card's own shape (title, subtitle, one field, the button, the footer
 * strip), so the form fades in where the placeholder was instead of the page
 * jumping. Which fields Clerk shows is set in its dashboard, so this matches
 * the common email-first card, not every variant.
 */

import { Skeleton } from "@/components/ui/skeleton";

export function ClerkFormSkeleton({ fields = 1 }: { fields?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="space-y-8 px-10 py-8">
        <div className="flex flex-col items-center gap-2.5">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-60" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="flex justify-center border-t bg-muted/40 px-10 py-4">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
