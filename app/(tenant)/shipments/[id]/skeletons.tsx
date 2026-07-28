import { ArrowRight, Clock, FileText, MapPin, Package, Receipt, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Every skeleton here mirrors its real card 1:1 — same chrome, same static
// text, only the data-dependent bits are blocked out. That way nothing
// reflows or "pops" when the real content lands; a skeleton block just turns
// into text in the same box.

function StaticHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
    </div>
  );
}

// ─── Hero: shipment number, route, quick stats, journey rail ───────────────

export function HeroSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="text-right space-y-1.5">
            <Skeleton className="ml-auto h-7 w-28" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
        </div>

        {/* Route strip */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 border-b">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground/40">
            <div className="h-px w-8 bg-border" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
            <div className="h-px w-8 bg-border" />
          </div>
          <div className="flex flex-col items-end space-y-1.5">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>

        {/* Quick stat tiles */}
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 border-b">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-4 py-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>

        {/* Tracking number row — label is static, only the value is dynamic */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <span className="text-xs text-muted-foreground">
            Tracking number
          </span>
          <Skeleton className="h-4 w-28" />
        </div>

        {/* Journey rail */}
        <div className="p-5">
          <div className="rounded-lg border bg-card px-5 py-5 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="flex items-start justify-between pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="h-[26px] w-[26px] rounded-full" />
                  <Skeleton className="h-2 w-10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── First-mile pickup — only shown for some shipments, so keep the
// placeholder compact: less to reflow if it turns out not to apply ─────────

export function FirstMileSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Addresses ──────────────────────────────────────────────────────────────

function AddressBlockSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1 pt-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function AddressesSkeleton() {
  return (
    <Card className="overflow-hidden">
      <StaticHeader icon={MapPin} title="Addresses" />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <AddressBlockSkeleton />
        <AddressBlockSkeleton />
      </div>
    </Card>
  );
}

// ─── Packages ───────────────────────────────────────────────────────────────

export function PackagesSkeleton() {
  return (
    <Card className="overflow-hidden">
      <StaticHeader icon={Package} title="What's inside" />
      <div className="space-y-3 p-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────

export function PricingSkeleton() {
  return (
    <Card className="overflow-hidden">
      <StaticHeader icon={Receipt} title="Pricing breakdown" />

      {/* Service row — label is static, only the value is dynamic */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <span className="text-xs text-muted-foreground">Service</span>
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Charge line items */}
      <div className="divide-y divide-border/40">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Total — label is static, value is large to match the real total */}
      <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-4">
        <span className="text-sm font-semibold text-foreground">Total</span>
        <Skeleton className="h-6 w-24" />
      </div>
    </Card>
  );
}

// ─── Documents ──────────────────────────────────────────────────────────────

export function DocumentsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <StaticHeader icon={FileText} title="Documents" />
      <div className="divide-y divide-border/40">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Wallet transactions — conditional, kept compact ────────────────────────

export function WalletTransactionsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <StaticHeader icon={Wallet} title="Wallet transactions" />
      <div className="divide-y divide-border/40">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Booking summary sidebar ────────────────────────────────────────────────

export function BookingSummarySkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground">
          Booking details
        </p>
      </div>
      <div className="flex items-center gap-2.5 border-b p-4">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Status history sidebar ─────────────────────────────────────────────────

export function StatusHistorySkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Status history
        </p>
      </div>
      <div className="space-y-4 px-4 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Skeleton className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Shipment ID sidebar ─────────────────────────────────────────────────────

export function ShipmentIdSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-1.5 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          Shipment ID
        </p>
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  );
}
