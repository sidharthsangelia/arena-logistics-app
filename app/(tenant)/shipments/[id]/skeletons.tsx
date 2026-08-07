import { ArrowRight, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Every skeleton here mirrors its real section 1:1 — same rules, same static
// text, only the data-dependent bits are blocked out. That way nothing
// reflows or "pops" when the real content lands; a skeleton block just turns
// into text in the same place.

/** The section heading is static text, so it renders for real in the skeleton. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b pb-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

// ─── Header: shipment number, total, route, key figures ────────────────────

export function HeaderSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="space-y-2.5">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-9 w-32" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex items-center gap-1.5 self-end pb-6 text-muted-foreground/40">
          <span className="h-px w-6 bg-border sm:w-12" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="h-px w-6 bg-border sm:w-12" />
        </div>
        <div className="flex flex-col items-end space-y-2">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status: current stage, tracking number, journey rail ──────────────────

export function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Status</SectionTitle>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-3 w-24" />
          <Skeleton className="ml-auto h-5 w-32" />
        </div>
      </div>

      <div className="pt-2">
        <div className="relative">
          <div className="absolute left-0 right-0 top-2.75 h-px bg-border" />
          <div className="relative flex justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-5.5 w-5.5 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── First-mile pickup — only shown for some shipments, so keep the
// placeholder compact: less to reflow if it turns out not to apply ─────────

export function FirstMileSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Door pickup</SectionTitle>
      <div className="space-y-2">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
    </div>
  );
}

// ─── Addresses ──────────────────────────────────────────────────────────────

function AddressBlockSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
      <div className="space-y-1 pt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function AddressesSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Addresses</SectionTitle>
      <div className="grid gap-8 sm:grid-cols-2">
        <AddressBlockSkeleton />
        <div className="sm:border-l sm:pl-8">
          <AddressBlockSkeleton />
        </div>
      </div>
    </div>
  );
}

// ─── Packages ───────────────────────────────────────────────────────────────

export function PackagesSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>What&apos;s inside</SectionTitle>
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────

// The real section starts collapsed, so the skeleton is just the summary row it
// collapses to: title, total, chevron. Anything taller would collapse away the
// moment the data lands, which is a worse jump than a short placeholder.
export function PricingSkeleton() {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Pricing
      </span>
      <span className="flex items-baseline gap-3">
        <Skeleton className="h-4 w-24" />
        <ChevronDown className="h-3.5 w-3.5 self-center text-muted-foreground/40" />
      </span>
    </div>
  );
}

// ─── Documents ──────────────────────────────────────────────────────────────

// One section, grouped: shipping label, tax invoice, then the file list. The
// skeleton keeps the group rhythm so the section does not reshuffle when the
// real groups land, and blocks out only the labels, since which groups apply
// depends on the shipment.
export function DocumentsSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Documents</SectionTitle>
      <div className="space-y-7">
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group} className="space-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            {Array.from({ length: group === 0 ? 1 : 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Wallet activity — conditional, kept compact ────────────────────────────

export function WalletTransactionsSkeleton() {
  return (
    <div className="space-y-5">
      <SectionTitle>Wallet activity</SectionTitle>
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Booking summary sidebar ────────────────────────────────────────────────

export function BookingSummarySkeleton() {
  return (
    <div className="space-y-5">
      <SectionTitle>Booking</SectionTitle>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status history sidebar ─────────────────────────────────────────────────

export function StatusHistorySkeleton() {
  return (
    <div className="space-y-5">
      <SectionTitle>History</SectionTitle>
      <div className="relative space-y-5">
        <div className="absolute bottom-3 left-0.75 top-2 w-px bg-border" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative space-y-1.5 pl-5">
            <Skeleton className="absolute left-0 top-1.5 h-1.75 w-1.75 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
