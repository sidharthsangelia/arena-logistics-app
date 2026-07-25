import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Instant fallback while the booking page loads the org context and any saved
// draft the wizard resumes from. Matches the header and the wizard's stepper +
// form shell so the layout holds steady when the real wizard mounts.
export default function BookLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-between gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
          </div>
        ))}
      </div>

      {/* Current step form */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
