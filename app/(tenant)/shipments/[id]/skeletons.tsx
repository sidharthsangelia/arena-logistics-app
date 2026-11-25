import { ArrowRight, ChevronDown, Info } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { ShipmentStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";

// Every skeleton here mirrors its real section 1:1 — same rules, same static
// text, only the data-dependent bits are blocked out. That way nothing
// reflows or "pops" when the real content lands; a skeleton block just turns
// into text in the same place.

/** The section heading is static text, so it renders for real in the skeleton. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </h2>
    </div>
  );
}

// ─── Journey steps ──────────────────────────────────────────────────────────
// Lives here, not in page.tsx, because the status skeleton draws the same rail:
// the step names are fixed, only how far the shipment got is not.

type JourneyStep = {
  status: ShipmentStatus[];
  label: string;
};

export const JOURNEY_STEPS: JourneyStep[] = [
  { status: ["DRAFT", "PENDING_PAYMENT", "BOOKED"], label: "Booked" },
  { status: ["PROCESSING", "DOCUMENTS_PENDING"], label: "Processing" },
  { status: ["IN_TRANSIT", "CUSTOMS_HOLD", "ON_HOLD"], label: "In transit" },
  { status: ["OUT_FOR_DELIVERY"], label: "Out for delivery" },
  { status: ["DELIVERED"], label: "Delivered" },
];

/**
 * A bar inside a box of the real line's height. Every placeholder below uses it
 * so a block of placeholders is exactly as tall as the text that replaces it.
 */
function Line({
  h,
  w,
  className,
}: {
  /** The real line's height class, e.g. "h-5" for text-sm. */
  h: string;
  w: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center", h, className)}>
      <Skeleton className={cn("h-[60%]", w)} />
    </div>
  );
}

function TipIcon() {
  return <Info className="h-3 w-3 text-muted-foreground/40" aria-hidden />;
}

// ─── Header: shipment number, total, route, key figures ────────────────────
// Labels ("Total quoted", "From", "To", the four figure labels) are fixed and
// render for real. Only the values wait.

function FigureSkeleton({
  label,
  tip = false,
  sub = true,
}: {
  label: string;
  tip?: boolean;
  sub?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tip && <TipIcon />}
      </p>
      <Line h="h-6" w="w-24" className="mt-1.5" />
      {sub && <Line h="h-4" w="w-20" className="mt-0.5" />}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <header className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <Line h="h-8 sm:h-9" w="w-56" />
          <Line h="h-5" w="w-72 max-w-full" className="mt-2" />
        </div>
        <div className="shrink-0 text-right">
          <Line h="h-8 sm:h-9" w="w-32" className="justify-end" />
          <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            Total quoted
            <TipIcon />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">From</p>
          <Line h="h-7" w="w-28" className="mt-1" />
          <Line h="h-5" w="w-36" />
        </div>
        <div className="flex items-center gap-1.5 self-end pb-6 text-muted-foreground/50">
          <span className="h-px w-6 bg-border sm:w-12" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="h-px w-6 bg-border sm:w-12" />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted-foreground">To</p>
          <Line h="h-7" w="w-28" className="mt-1 justify-end" />
          <Line h="h-5" w="w-36" className="justify-end" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-4">
        <FigureSkeleton label="Boxes" />
        <FigureSkeleton label="Actual weight" tip />
        <FigureSkeleton label="Service" sub={false} />
        <FigureSkeleton label="Declared value" />
      </div>
    </header>
  );
}

// ─── Status: current stage, tracking number, journey rail ──────────────────
// The rail's step names are fixed, so the rail is drawn for real with no step
// reached yet; the loaded rail then fills in up to the current step.

export function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Status</SectionTitle>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-xl">
          <Line h="h-7" w="w-36" />
          <Line h="h-[22.75px]" w="w-80 max-w-full" className="mt-1.5" />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Tracking number</p>
          <Line h="h-6" w="w-32" className="mt-1 justify-end" />
        </div>
      </div>

      <div className="pt-2">
        <div className="relative">
          <div className="absolute left-0 right-0 top-2.75 h-px bg-border" />
          <div className="relative flex justify-between">
            {JOURNEY_STEPS.map((step) => (
              <div key={step.label} className="flex min-w-0 flex-col items-center gap-2">
                <div className="relative z-10 h-5.5 w-5.5 rounded-full bg-background ring-1 ring-inset ring-border" />
                <span className="max-w-18 text-center text-xs leading-tight text-muted-foreground/50">
                  {step.label}
                </span>
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

function AddressBlockSkeleton({ label }: { label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Line h="h-6" w="w-36" className="mt-1.5" />
      <Line h="h-5" w="w-28" className="mt-0.5" />
      <div className="mt-3 space-y-0.5">
        <Line h="h-[22.75px]" w="w-full" />
        <Line h="h-[22.75px]" w="w-3/4" />
        <Line h="h-[22.75px]" w="w-1/3" />
      </div>
    </div>
  );
}

export function AddressesSkeleton() {
  return (
    <div className="space-y-6">
      <SectionTitle>Addresses</SectionTitle>
      <div className="grid gap-8 sm:grid-cols-2">
        <AddressBlockSkeleton label="Sender · Consignor" />
        <div className="sm:border-l sm:pl-8">
          <AddressBlockSkeleton label="Receiver · Consignee" />
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

function KVSkeleton({ label, tip = false, w }: { label: string; tip?: boolean; w: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tip && <TipIcon />}
      </span>
      <span className="flex h-4 items-center">
        <Skeleton className={cn("h-2.5", w)} />
      </span>
    </div>
  );
}

/**
 * Row labels are fixed and render for real. "Export type" (exports only) and
 * "Cash on delivery" (domestic COD only) depend on the shipment, so they are
 * not drawn; "Booked" is, since nearly every shipment on this page has one.
 */
export function BookingSummarySkeleton() {
  return (
    <div className="space-y-5">
      <SectionTitle>Booking</SectionTitle>
      <div>
        <Line h="h-5" w="w-32" />
        <Line h="h-4" w="w-24" />
      </div>
      <div className="space-y-2.5">
        <KVSkeleton label="Type" tip w="w-20" />
        <KVSkeleton label="Created" w="w-24" />
        <KVSkeleton label="Booked" w="w-24" />
        <KVSkeleton label="Last updated" w="w-24" />
        <KVSkeleton label="Reference" tip w="w-28" />
      </div>
    </div>
  );
}
