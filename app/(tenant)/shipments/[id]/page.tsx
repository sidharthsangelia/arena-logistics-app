import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { ShipmentStatus } from "@/generated/prisma";
import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  MapPin,
  Package,
  Truck,
  Wallet,
  Mail,
  Phone,
  Info,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Circle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data fetch — tenant-scoped (unchanged from original)
// ---------------------------------------------------------------------------

async function getShipment(id: string) {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/sign-in");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true, name: true },
  });
  if (!org) redirect("/sign-in");

  const shipment = await prisma.shipment.findFirst({
    where: { id, orgId: org.id },
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      bookedAt: true,
      internalNotes: true,
      billingSameAsDelivery: true,
      quotedTotal: true,
      currency: true,
      markupPercentApplied: true,
      chargesSnapshot: true,
      totalActualWeightKg: true,
      totalChargeableWeightKg: true,
      selectedVendorId: true,
      selectedVendorName: true,
      selectedProductName: true,
      mawbNumber: true,
      hawbNumber: true,
      carrierAirline: true,
      vendorTrackingUrl: true,

      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
        },
      },
      pickupAddress: {
        select: {
          contactName: true,
          contactPhone: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
        },
      },
      deliveryAddress: {
        select: {
          contactName: true,
          contactPhone: true,
          line1: true,
          line2: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
        },
      },
      billingAddress: {
        select: {
          contactName: true,
          line1: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
        },
      },
      packages: {
        select: {
          id: true,
          description: true,
          quantity: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          weightKg: true,
          declaredValue: true,
          declaredCurrency: true,
          hsCode: true,
        },
        orderBy: { createdAt: "asc" },
      },
      documents: {
        select: {
          id: true,
          docType: true,
          label: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
        },
        where: { visibleToClient: true },
        orderBy: { uploadedAt: "asc" },
      },

      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedByType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      walletTransactions: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          createdAt: true,
          notes: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!shipment) notFound();
  return { shipment, orgName: org.name };
}

// ---------------------------------------------------------------------------
// Status config — matches ops side exactly
// ---------------------------------------------------------------------------

export const STATUS_CONFIG: Record<
  ShipmentStatus,
  {
    label: string;
    description: string;
    className: string;
    dotClassName: string;
  }
> = {
  DRAFT: {
    label: "Draft",
    description:
      "Your booking is being prepared and has not been submitted yet.",
    className: "bg-secondary text-secondary-foreground border-border",
    dotClassName: "bg-muted-foreground/40",
  },
  PENDING_PAYMENT: {
    label: "Pending Payment",
    description:
      "Your shipment is awaiting payment confirmation before it can be processed.",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    dotClassName: "bg-amber-500",
  },
  BOOKED: {
    label: "Booked",
    description:
      "Your shipment has been confirmed and is in the operations queue for processing.",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
    dotClassName: "bg-blue-500",
  },
  PROCESSING: {
    label: "Processing",
    description:
      "Our operations team is actively preparing your shipment — labels, AWB, and carrier booking.",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800",
    dotClassName: "bg-indigo-500",
  },
  DOCUMENTS_PENDING: {
    label: "Documents Pending",
    description:
      "We need additional documents from you to proceed. Please check your email or contact support.",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
    dotClassName: "bg-orange-500",
  },
  IN_TRANSIT: {
    label: "In Transit",
    description:
      "Your shipment has been handed over to the carrier and is on its way to the destination.",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
    dotClassName: "bg-sky-500",
  },
  CUSTOMS_HOLD: {
    label: "Customs Hold",
    description:
      "Your shipment is being held at customs. Our team is working to resolve this. We will contact you if any action is needed.",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
    dotClassName: "bg-red-500",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    description: "Your shipment is out for final delivery today.",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
    dotClassName: "bg-violet-500",
  },
  DELIVERED: {
    label: "Delivered",
    description:
      "Your shipment has been successfully delivered to the destination.",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    description:
      "This shipment has been cancelled. Contact support if you believe this is an error.",
    className: "bg-secondary text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground/30",
  },
  ON_HOLD: {
    label: "On Hold",
    description:
      "Your shipment is temporarily on hold. Our team will reach out with more information.",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
    dotClassName: "bg-yellow-500",
  },
};

// ---------------------------------------------------------------------------
// Journey steps — the progress rail shown to clients
// ---------------------------------------------------------------------------

type JourneyStep = {
  status: ShipmentStatus[];
  label: string;
  tooltip: string;
};

const JOURNEY_STEPS: JourneyStep[] = [
  {
    status: [
      "DRAFT" as ShipmentStatus,
      "PENDING_PAYMENT" as ShipmentStatus,
      "BOOKED" as ShipmentStatus,
    ],
    label: "Booked",
    tooltip: "Shipment booking confirmed by our system.",
  },
  {
    status: [
      "PROCESSING" as ShipmentStatus,
      "DOCUMENTS_PENDING" as ShipmentStatus,
    ],
    label: "Processing",
    tooltip: "Our ops team is preparing labels, AWB, and carrier booking.",
  },
  {
    status: [
      "IN_TRANSIT" as ShipmentStatus,
      "CUSTOMS_HOLD" as ShipmentStatus,
      "ON_HOLD" as ShipmentStatus,
    ],
    label: "In Transit",
    tooltip: "Shipment has been handed to the carrier and is moving.",
  },
  {
    status: ["OUT_FOR_DELIVERY" as ShipmentStatus],
    label: "Out for Delivery",
    tooltip: "On the delivery vehicle heading to the final destination.",
  },
  {
    status: ["DELIVERED" as ShipmentStatus],
    label: "Delivered",
    tooltip: "Successfully delivered to the destination.",
  },
];

function getJourneyState(currentStatus: ShipmentStatus) {
  if (currentStatus === "CANCELLED") return { activeIdx: -1, cancelled: true };

  const activeIdx = JOURNEY_STEPS.findIndex((step) =>
    step.status.includes(currentStatus),
  );
  return { activeIdx, cancelled: false };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function dec(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "toNumber" in (v as object))
    return (v as { toNumber(): number }).toNumber();
  return Number(v);
}

function fmt(amount: unknown, currency = "INR"): string {
  const n = dec(amount);
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtKg(v: unknown): string {
  const n = dec(v);
  return n ? `${n.toFixed(2)} kg` : "—";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function KVRow({
  label,
  value,
  mono,
  tooltip,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  tooltip?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b last:border-0 border-border/50">
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/40 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-48 text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <span
        className={cn(
          "text-xs text-right text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  meta,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-52 text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address block
// ---------------------------------------------------------------------------

function AddressBlock({
  role,
  addr,
}: {
  role: "pickup" | "delivery";
  addr: {
    contactName?: string | null;
    contactPhone?: string | null;
    line1: string;
    line2?: string | null;
    city: string;
    state?: string | null;
    country: string;
    postalCode: string;
  };
}) {
  const geo = [addr.city, addr.state, addr.postalCode]
    .filter(Boolean)
    .join(", ");
  const isPickup = role === "pickup";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isPickup ? "bg-foreground" : "bg-muted-foreground/40",
          )}
        />
        <MicroLabel>
          {isPickup ? "Sender · Consignor" : "Receiver · Consignee"}
        </MicroLabel>
      </div>
      <div className="space-y-1 text-sm">
        {addr.contactName && (
          <p className="font-semibold text-foreground">{addr.contactName}</p>
        )}
        {addr.contactPhone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            {addr.contactPhone}
          </div>
        )}
        <div className="pt-1 space-y-0.5 text-xs text-muted-foreground leading-relaxed">
          <p>{addr.line1}</p>
          {addr.line2 && <p>{addr.line2}</p>}
          <p>{geo}</p>
          <p className="font-medium text-foreground/70">{addr.country}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journey progress rail
// ---------------------------------------------------------------------------

function JourneyRail({ currentStatus }: { currentStatus: ShipmentStatus }) {
  const { activeIdx, cancelled } = getJourneyState(currentStatus);
  const cfg = STATUS_CONFIG[currentStatus];

  if (cancelled) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Shipment Cancelled
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This shipment has been cancelled. Contact support if you need help.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card px-5 py-5 space-y-4">
      {/* Status badge + description */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-2 w-2 rounded-full",
                cfg.dotClassName,
              )}
            />
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold px-2.5 py-0.5",
                cfg.className,
              )}
            >
              {cfg.label}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-60 text-xs leading-relaxed">
                {cfg.description}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground pl-4">
            {cfg.description}
          </p>
        </div>
      </div>

      {/* Step dots + connector line */}
      <div className="relative pt-1">
        {/* Background track */}
        <div className="absolute top-[13px] left-0 right-0 h-px bg-border" />

        {/* Filled track up to active step */}
        {activeIdx >= 0 && (
          <div
            className="absolute top-[13px] left-0 h-px bg-foreground/30 transition-all duration-500"
            style={{
              width: `${
                activeIdx === 0
                  ? "0%"
                  : `${(activeIdx / (JOURNEY_STEPS.length - 1)) * 100}%`
              }`,
            }}
          />
        )}

        <div className="relative flex justify-between">
          {JOURNEY_STEPS.map((step, idx) => {
            const isLastStep = idx === JOURNEY_STEPS.length - 1;
            // If this IS the active step AND it's the last step, treat it as done (fully ticked)
            const isDone = idx < activeIdx || (idx === activeIdx && isLastStep);
            const isActive = idx === activeIdx && !isLastStep;
            const isPending = idx > activeIdx;

            return (
              <Tooltip key={step.label}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-2 cursor-default">
                    {/* Dot */}
                    <div
                      className={cn(
                        "relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 transition-all duration-300",
                        isDone && "border-foreground bg-foreground",
                        isActive &&
                          "border-foreground bg-background shadow-sm ring-4 ring-foreground/10",
                        isPending && "border-border bg-background",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-background" />
                      ) : isActive ? (
                        <CircleDot className="h-3.5 w-3.5 text-foreground" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Label */}
                    <span
                      className={cn(
                        "text-center text-[10px] font-medium leading-tight max-w-[64px]",
                        isDone && "text-foreground",
                        isActive && "text-foreground font-semibold",
                        isPending && "text-muted-foreground/50",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-44 text-xs text-center">
                  {step.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Special alert for statuses needing attention */}
      {(currentStatus === "DOCUMENTS_PENDING" ||
        currentStatus === "CUSTOMS_HOLD" ||
        currentStatus === "ON_HOLD") && (
        <div className="flex items-start gap-2.5 rounded-md border border-orange-200 bg-orange-50 px-3.5 py-3 dark:border-orange-800/50 dark:bg-orange-950/20">
          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5 dark:text-orange-400" />
          <div className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
            {currentStatus === "DOCUMENTS_PENDING" &&
              "Action required: Our team needs additional documents. Please check your email or contact support."}
            {currentStatus === "CUSTOMS_HOLD" &&
              "Your shipment is under customs review. We are actively working to resolve this."}
            {currentStatus === "ON_HOLD" &&
              "Your shipment is temporarily on hold. Our team will be in touch with more details."}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { shipment: s } = await getShipment(id);

  const cfg = STATUS_CONFIG[s.status];
  const charges = s.chargesSnapshot as Record<string, unknown> | null;
  const totalPieces = s.packages.reduce((a, p) => a + p.quantity, 0);
  const totalDeclared = s.packages.reduce(
    (sum, p) => sum + (p.declaredValue ? dec(p.declaredValue) : 0) * p.quantity,
    0,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-5 py-8 space-y-5">
          {/* ── Back nav ── */}
          <Link
            href="/shipments"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            All shipments
          </Link>

          {/* ── Header card ── */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* Top bar with shipment number */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/20 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
                        {s.shipmentNumber}
                      </h1>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Your unique shipment tracking reference number.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {fmtDate(s.createdAt)}
                      {s.bookedAt && ` · Booked ${fmtDate(s.bookedAt)}`}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-default">
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {fmt(s.quotedTotal, s.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Total quoted
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-52">
                      The price quoted to you at time of booking, including all
                      surcharges and applicable markup.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Route strip */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 border-b">
                <div>
                  <MicroLabel>From</MicroLabel>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {s.pickupAddress.city}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.pickupAddress.country}
                    {s.pickupAddress.contactName &&
                      ` · ${s.pickupAddress.contactName}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground/40">
                  <div className="h-px w-8 bg-border" />
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  <div className="h-px w-8 bg-border" />
                </div>
                <div className="text-right">
                  <MicroLabel>To</MicroLabel>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {s.deliveryAddress.city}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.deliveryAddress.country}
                    {s.deliveryAddress.contactName &&
                      ` · ${s.deliveryAddress.contactName}`}
                  </p>
                </div>
              </div>

              {/* Quick stat tiles */}
              <div className="grid grid-cols-2 gap-0 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 border-b">
                {[
                  {
                    label: "Packages",
                    value: `${s.packages.length} item${s.packages.length !== 1 ? "s" : ""}`,
                    sub: `${totalPieces} piece${totalPieces !== 1 ? "s" : ""}`,
                    tooltip:
                      "Number of distinct package types and total individual pieces.",
                  },
                  {
                    label: "Actual weight",
                    value: fmtKg(s.totalActualWeightKg),
                    sub: s.totalChargeableWeightKg
                      ? `Chargeable: ${fmtKg(s.totalChargeableWeightKg)}`
                      : undefined,
                    tooltip:
                      "Actual physical weight. Chargeable weight may differ if volumetric weight is higher.",
                  },
                  {
                    label: "Carrier",
                    value: s.selectedVendorName ?? "—",
                    sub: s.selectedProductName ?? undefined,
                    tooltip:
                      "The carrier and service product selected for this shipment at time of booking.",
                  },
                  {
                    label: "Declared value",
                    value: totalDeclared > 0 ? fmt(totalDeclared) : "—",
                    sub: s.client ? `For ${s.client.companyName}` : "Own org",
                    tooltip:
                      "Total declared value of goods across all packages. Used for customs and insurance purposes.",
                  },
                ].map(({ label, value, sub, tooltip }) => (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col gap-1 px-4 py-4 cursor-default hover:bg-muted/20 transition-colors">
                        <MicroLabel>{label}</MicroLabel>
                        <p className="text-sm font-semibold text-foreground leading-tight">
                          {value}
                        </p>
                        {sub && (
                          <p className="text-xs text-muted-foreground">{sub}</p>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-52 text-xs">
                      {tooltip}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Journey progress rail */}
              <div className="p-5">
                <JourneyRail currentStatus={s.status} />
              </div>
            </CardContent>
          </Card>

          {(s.hawbNumber || s.mawbNumber) && (
            <Card className="overflow-hidden">
              <SectionHeader
                icon={Truck}
                title="Carrier Tracking"
                tooltip="Tracking reference issued by the airline/carrier handling your shipment."
              />
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {s.carrierAirline && (
                  <div>
                    <MicroLabel>Airline</MicroLabel>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {s.carrierAirline}
                    </p>
                  </div>
                )}
                {s.hawbNumber && (
                  <div>
                    <MicroLabel>AWB Number</MicroLabel>
                    <p className="mt-1 text-sm font-mono font-semibold text-foreground">
                      {s.hawbNumber}
                    </p>
                  </div>
                )}
                {s.vendorTrackingUrl && (
                  <div className="flex items-end">
                    <a
                      href={s.vendorTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
                    >
                      Track with {s.carrierAirline ?? "carrier"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── Two-column layout ── */}
          <div className="grid gap-5 xl:grid-cols-[1fr_260px] xl:items-start">
            {/* ── Left: main sections ── */}
            <div className="space-y-5 min-w-0">
              {/* Route detail */}
              <Card className="overflow-hidden">
                <SectionHeader
                  icon={MapPin}
                  title="Addresses"
                  tooltip="Pickup and delivery contact details and full addresses for this shipment."
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <AddressBlock role="pickup" addr={s.pickupAddress} />
                  <AddressBlock role="delivery" addr={s.deliveryAddress} />
                </div>

                {!s.billingSameAsDelivery && s.billingAddress && (
                  <div className="border-t px-4 py-3.5 space-y-2">
                    <MicroLabel>Billing address</MicroLabel>
                    <div className="text-xs text-muted-foreground space-y-0.5 leading-relaxed">
                      {s.billingAddress.contactName && (
                        <p className="font-medium text-foreground">
                          {s.billingAddress.contactName}
                        </p>
                      )}
                      <p>{s.billingAddress.line1}</p>
                      <p>
                        {[
                          s.billingAddress.city,
                          s.billingAddress.state,
                          s.billingAddress.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      <p>{s.billingAddress.country}</p>
                    </div>
                  </div>
                )}
              </Card>

              {/* Packages */}
              <Card className="overflow-hidden">
                <SectionHeader
                  icon={Package}
                  title="Packages"
                  meta={`${s.packages.length} items · ${totalPieces} pieces`}
                  tooltip="Individual package details including dimensions, weight, and declared value for customs."
                />
                {s.packages.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-center text-muted-foreground">
                    No packages recorded.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/20 text-left">
                            {[
                              { h: "#", tip: null },
                              {
                                h: "Description",
                                tip: "Contents of the package.",
                              },
                              {
                                h: "Qty",
                                tip: "Number of identical pieces in this package type.",
                              },
                              {
                                h: "Dimensions (cm)",
                                tip: "Length × Width × Height in centimetres.",
                              },
                              {
                                h: "Weight",
                                tip: "Physical weight per piece. Chargeable weight is calculated by the carrier.",
                              },
                              {
                                h: "Declared Value",
                                tip: "Value declared for customs and insurance purposes.",
                              },
                              {
                                h: "HS Code",
                                tip: "Harmonized System commodity code for customs classification.",
                              },
                            ].map(({ h, tip }) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground whitespace-nowrap"
                              >
                                {tip ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 cursor-default">
                                        {h}
                                        <Info className="h-2.5 w-2.5 text-muted-foreground/40" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-44 text-xs">
                                      {tip}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  h
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {s.packages.map((pkg, i) => (
                            <tr
                              key={pkg.id}
                              className="hover:bg-muted/20 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-muted-foreground/60">
                                {i + 1}
                              </td>
                              <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">
                                {pkg.description}
                              </td>
                              <td className="px-4 py-3 text-center tabular-nums">
                                {pkg.quantity}
                              </td>
                              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                                {dec(pkg.lengthCm).toFixed(0)}×
                                {dec(pkg.widthCm).toFixed(0)}×
                                {dec(pkg.heightCm).toFixed(0)}
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                {fmtKg(pkg.weightKg)}
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                {pkg.declaredValue ? (
                                  fmt(
                                    pkg.declaredValue,
                                    pkg.declaredCurrency ?? "INR",
                                  )
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-muted-foreground">
                                {pkg.hsCode ?? (
                                  <span className="text-muted-foreground/40">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-5 border-t bg-muted/10 px-4 py-2.5 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">
                          {totalPieces}
                        </span>{" "}
                        pieces
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">
                          {fmtKg(s.totalActualWeightKg)}
                        </span>{" "}
                        actual
                      </span>
                      {s.totalChargeableWeightKg && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default inline-flex items-center gap-1">
                              <span className="font-semibold text-foreground">
                                {fmtKg(s.totalChargeableWeightKg)}
                              </span>{" "}
                              chargeable
                              <Info className="h-2.5 w-2.5 text-muted-foreground/40" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-52">
                            Chargeable weight is the higher of actual weight and
                            volumetric weight. Carriers bill based on this.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {totalDeclared > 0 && (
                        <span>
                          <span className="font-semibold text-foreground">
                            {fmt(totalDeclared)}
                          </span>{" "}
                          declared
                        </span>
                      )}
                    </div>
                  </>
                )}
              </Card>

              {/* Pricing */}
              <Card className="overflow-hidden">
                <SectionHeader
                  icon={Truck}
                  title="Pricing breakdown"
                  tooltip="Full charge breakdown as quoted at time of booking. This price is locked in."
                />
                <div className="px-5 py-1">
                  <KVRow
                    label="Service"
                    value={[s.selectedVendorName, s.selectedProductName]
                      .filter(Boolean)
                      .join(" — ")}
                    tooltip="Carrier and product selected for this shipment."
                  />
                </div>

                {charges && Array.isArray((charges as any).charges) && (
                  <>
                    <Separator />
                    <div className="divide-y divide-border/40">
                      {(
                        (charges as any).charges as {
                          name: string;
                          amount: number;
                          currency: string;
                        }[]
                      ).map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-5 py-3 text-sm"
                        >
                          <span className="text-muted-foreground">
                            {c.name}
                          </span>
                          <span className="tabular-nums font-medium">
                            {fmt(c.amount, c.currency)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between bg-muted/30 px-5 py-3 text-sm font-bold">
                        <span>Total</span>
                        <span className="tabular-nums">
                          {fmt(s.quotedTotal, s.currency)}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {(!charges || !Array.isArray((charges as any).charges)) && (
                  <div className="px-5 pb-4">
                    <KVRow
                      label="Total quoted"
                      value={fmt(s.quotedTotal, s.currency)}
                    />
                  </div>
                )}
              </Card>

              {/* Documents */}
              <Card className="overflow-hidden">
                <SectionHeader
                  icon={FileText}
                  title="Documents"
                  meta={
                    s.documents.length > 0
                      ? `${s.documents.length} file${s.documents.length > 1 ? "s" : ""}`
                      : undefined
                  }
                  tooltip="Shipment documents such as commercial invoices, airway bills, and customs declarations."
                />
                {s.documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <FileText className="h-7 w-7 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No documents available yet.
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Documents such as AWB and invoices will appear here once
                      generated.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {s.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                          <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {doc.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.docType.replace(/_/g, " ")} · {doc.fileName} ·{" "}
                            {fmtBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </a>
                    ))}
                  </div>
                )}
              </Card>

              {/* Wallet transactions */}
              {s.walletTransactions.length > 0 && (
                <Card className="overflow-hidden">
                  <SectionHeader
                    icon={Wallet}
                    title="Wallet transactions"
                    tooltip="Payment debits and credits linked to this shipment."
                  />
                  <div className="divide-y divide-border/40">
                    {s.walletTransactions.map((txn) => {
                      const isCredit =
                        txn.type === "TOP_UP" || txn.type === "REFUND";
                      return (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between px-5 py-3.5"
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium text-foreground">
                              {txn.type.replace(/_/g, " ")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDateTime(txn.createdAt)}
                            </p>
                            {txn.notes && (
                              <p className="text-[10px] text-muted-foreground/70">
                                {txn.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-sm font-semibold tabular-nums">
                              {isCredit ? "+" : "−"}
                              {fmt(txn.amount, txn.currency)}
                            </p>
                            <Badge variant="outline" className="text-[10px]">
                              {txn.status.toLowerCase()}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>

            {/* ── Right sidebar ── */}
            <div className="space-y-4">
              {/* Booking summary sidebar card */}
              <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20">
                  <MicroLabel>Booking details</MicroLabel>
                </div>

                {/* Client */}
                {s.client ? (
                  <div className="p-4 border-b">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-bold text-muted-foreground">
                        {s.client.companyName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight text-foreground truncate">
                          {s.client.companyName}
                        </p>
                        {s.client.contactName && (
                          <p className="text-xs text-muted-foreground truncate">
                            {s.client.contactName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {s.client.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{s.client.email}</span>
                        </div>
                      )}
                      {s.client.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{s.client.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-b">
                    <p className="text-xs text-muted-foreground">
                      Booked for your own organisation.
                    </p>
                  </div>
                )}

                {/* Timestamps */}
                <div className="px-4 py-1.5">
                  <KVRow
                    label="Created"
                    value={fmtDateTime(s.createdAt)}
                    tooltip="When this booking was first created in the system."
                  />
                  <KVRow
                    label="Booked"
                    value={s.bookedAt ? fmtDateTime(s.bookedAt) : null}
                    tooltip="When payment was confirmed and the shipment entered the ops queue."
                  />
                  <KVRow
                    label="Last updated"
                    value={fmtDateTime(s.updatedAt)}
                    tooltip="When this shipment record was last modified."
                  />
                </div>
              </Card>

              {/* Status history */}
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <MicroLabel>Status history</MicroLabel>
                </div>
                {s.statusHistory.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-center text-muted-foreground">
                    No events recorded yet.
                  </p>
                ) : (
                  <div className="px-4 py-4">
                    <ol className="relative ml-1">
                      <div className="absolute left-[3px] top-2 bottom-4 w-px bg-border" />
                      {s.statusHistory.map((evt, i) => {
                        const evtCfg = STATUS_CONFIG[evt.toStatus];
                        const isLast = i === s.statusHistory.length - 1;
                        return (
                          <li
                            key={evt.id}
                            className="relative pl-5 pb-5 last:pb-0"
                          >
                            <span
                              className={cn(
                                "absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full ring-2 ring-background",
                                evtCfg?.dotClassName ??
                                  "bg-muted-foreground/30",
                              )}
                            />
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] font-medium px-1.5 py-0",
                                    evtCfg?.className,
                                  )}
                                >
                                  {evtCfg?.label ?? evt.toStatus}
                                </Badge>
                                {isLast && (
                                  <span className="rounded-full bg-foreground/5 border border-border px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                    Now
                                  </span>
                                )}
                              </div>
                              {evt.note && (
                                <p className="text-[10px] text-muted-foreground leading-relaxed bg-muted/50 rounded px-2 py-1">
                                  {evt.note}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground/50">
                                {fmtDateTime(evt.createdAt)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </Card>

              {/* Shipment ID */}
              <Card>
                <CardContent className="px-4 py-3 space-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-default">
                        <MicroLabel>Shipment ID</MicroLabel>
                        <p className="font-mono text-[10px] text-muted-foreground break-all mt-1 leading-relaxed">
                          {s.id}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      Internal system ID. Use the shipment number (above) when
                      contacting support.
                    </TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
