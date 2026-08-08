import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-3 h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-full max-w-lg" />
      </div>

      {/* Customer, then the four date and currency fields beside it. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>

      <Skeleton className="mt-5 h-16 w-full" />
      <Skeleton className="mt-8 h-64 w-full" />
    </div>
  );
}
