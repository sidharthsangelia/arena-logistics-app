import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Instant fallback for the notices screen while its banner or inbox panel query
// resolves. Matches the header, the mode switch, and a composer-shaped card.
export default function ArenaNoticesLoading() {
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-prose" />
          <Skeleton className="h-4 w-4/5 max-w-prose" />
        </div>

        {/* Mode switch (banner vs message). */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </header>

      <Card className="shadow-sm">
        <CardHeader className="space-y-2 pb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
