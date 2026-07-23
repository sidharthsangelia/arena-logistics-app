import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Instant skeleton shown while the shipment detail page's blocking query
// resolves, so navigation feels immediate and the layout never jumps.
export default function ShipmentDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-5">
        {/* Back link */}
        <Skeleton className="h-4 w-32" />

        {/* Header card */}
        <Card className="overflow-hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-7 w-24 rounded-full" />
          </CardContent>
        </Card>

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[0, 1, 2].map((r) => (
                    <div key={r} className="flex justify-between gap-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[0, 1, 2, 3].map((r) => (
                  <Skeleton key={r} className="h-4 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
