import { Skeleton } from "@/components/ui/skeleton";

// ─── Reusable skeleton primitives ──────────────────────────────────────────

function SkeletonInfoRow() {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}

function SkeletonCard({
  label,
  rows = 3,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="divide-y px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonInfoRow key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Stat card skeleton ─────────────────────────────────────────────────────

function SkeletonStatCard() {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// ─── Quote row skeleton ─────────────────────────────────────────────────────

function SkeletonQuoteRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4">
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="text-right space-y-1.5">
        <Skeleton className="h-4 w-20 ml-auto" />
        <Skeleton className="h-5 w-16 ml-auto rounded-full" />
      </div>
    </div>
  );
}

// ─── KYC row skeleton ──────────────────────────────────────────────────────

function SkeletonKycRow() {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <Skeleton className="h-8 w-8 rounded" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-7 w-16 rounded-md" />
    </div>
  );
}

// ─── Main loading export ────────────────────────────────────────────────────

export default function ClientDetailLoading() {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Stats row — 4 cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">

        {/* Left sidebar */}
        <div className="space-y-4">
          <SkeletonCard label="Contact" rows={3} />
          <SkeletonCard label="Address" rows={5} />
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Quote history */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Quote history
              </p>
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonQuoteRow key={i} />
              ))}
            </div>
          </div>

          {/* KYC Vault */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                KYC Vault
              </p>
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonKycRow key={i} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}