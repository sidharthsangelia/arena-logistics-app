import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The waiting shape for the inbox panel: the ArenaMessageComposer grid (compose and
 * audience cards on the left, a sticky preview and send box on the right) above the
 * SentMessagesList card. Sized to the real layout so the tab switch settles in place
 * rather than jumping when the recipients and sent history arrive.
 *
 * Lives inside the inbox-mode Suspense boundary, so the header and mode switch stay
 * put and only this region shows the pulse while its two queries resolve.
 */
export function InboxPanelSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Compose + audience column. */}
        <div className="space-y-6">
          {/* What are you telling them. */}
          <Card className="shadow-sm">
            <CardHeader className="space-y-2 pb-3">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-full max-w-96" />
            </CardHeader>
            <Separator />
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-32 w-full" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-24 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Who hears it. */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <Separator />
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <Skeleton className="mt-0.5 h-4 w-4 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-full max-w-80" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview + send column. */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      </div>

      {/* Already sent. */}
      <Card className="shadow-sm">
        <CardHeader className="space-y-2 pb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <Separator />
        <CardContent className="pt-0">
          <ul className="divide-y">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-12 rounded" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-3 w-full max-w-80" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <Skeleton className="ml-auto h-4 w-12" />
                  <Skeleton className="ml-auto h-2.5 w-10" />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
