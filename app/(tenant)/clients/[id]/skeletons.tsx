import { Skeleton } from "@/components/ui/skeleton";

// ─── Header: only avatar + name + subtitle are dynamic ──────────────────────
// The action buttons (Edit, New Quote) are always rendered by the shell

export function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4">
      {/* Avatar circle */}
      <Skeleton className="h-14 w-14 rounded-full shrink-0" />
      <div className="space-y-2">
        {/* Company name */}
        <Skeleton className="h-6 w-48" />
        {/* "Client since · Location" */}
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}

// ─── Stats row: all 4 numbers are dynamic ───────────────────────────────────

function SkeletonStatCard() {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

// ─── InfoRow: just the value line is dynamic, but label is static ────────────
// We render the real label + skeleton value to avoid any label flash

export function InfoRowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <Skeleton className="h-3 w-12" /> {/* label */}
      <Skeleton className={`h-4 ${wide ? "w-48" : "w-32"}`} /> {/* value */}
    </div>
  );
}

// ─── Contact card: label is hardcoded, rows are dynamic ─────────────────────

export function ContactSidebarSkeleton() {
  return (
    <>
      {/* Contact card */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Contact
          </p>
        </div>
        <div className="divide-y px-4">
          <InfoRowSkeleton />
          <InfoRowSkeleton wide />
          <InfoRowSkeleton />
        </div>
      </div>

      {/* Address card */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Address
          </p>
        </div>
        <div className="divide-y px-4">
          <InfoRowSkeleton wide />
          <InfoRowSkeleton />
          <InfoRowSkeleton />
          <InfoRowSkeleton />
          <InfoRowSkeleton />
        </div>
      </div>
    </>
  );
}

// ─── Quote history: section header is hardcoded, rows are dynamic ────────────

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

export function QuoteHistorySkeleton() {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        {/* Label is static */}
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Quote history
        </p>
        {/* Count is dynamic */}
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonQuoteRow key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── KYC Vault: section header + upload button shell are static, rows dynamic ─

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

export function KycVaultSkeleton() {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        {/* Label is static */}
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          KYC Vault
        </p>
        {/* Upload button shell — always present, just greyed */}
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonKycRow key={i} />
        ))}
      </div>
    </div>
  );
}