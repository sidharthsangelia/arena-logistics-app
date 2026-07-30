import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The wallet page is a client component that fetches through react-query, so it
 * renders its own skeletons once mounted. This covers the step before that — the
 * route chunk loading — and mirrors the same two cards so there is no second
 * flash when the real page takes over.
 *
 * It also stops the (tenant) dashboard fallback from standing in for this route.
 */
export default function WalletLoading() {
  return (
    <div className="mx-auto max-w-3xl py-8 space-y-6">
      {/* Balance card */}
      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </CardHeader>
        <CardContent className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="space-y-1.5 text-right">
                <Skeleton className="ml-auto h-4 w-20" />
                <Skeleton className="ml-auto h-3 w-14" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
