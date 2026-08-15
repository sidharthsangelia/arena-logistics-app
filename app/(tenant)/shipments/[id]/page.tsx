import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { ShipmentStatus, FirstMileStatus } from "@/generated/prisma";
import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Printer,
  Receipt,
  Info,
  AlertTriangle,
  Check,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getShipmentTaxInvoiceAction } from "@/actions/invoices/taxInvoices.action";
import { PackageBoxList } from "@/components/booking/PackageBoxList";
import { FirstMilePickupCard } from "@/components/booking/FirstMilePickupCard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { brandServiceName } from "@/lib/branding/serviceName";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import {
  toNumber,
  formatMoney,
  formatWeight,
  formatDate,
  formatDateTime,
  formatFileSize,
} from "@/utils/format";
import { formatEnumLabel } from "@/utils/helpers";
import { SHIPMENT_TYPE_INFO, shipmentTypeLabel } from "@/lib/booking/cargo";
import {
  HeaderSkeleton,
  StatusSkeleton,
  FirstMileSkeleton,
  AddressesSkeleton,
  PackagesSkeleton,
  PricingSkeleton,
  DocumentsSkeleton,
  WalletTransactionsSkeleton,
  BookingSummarySkeleton,
  StatusHistorySkeleton,
} from "./skeletons";

// ---------------------------------------------------------------------------
// Data fetch — tenant-scoped. The org lookup is fast (single indexed query)
// and awaited up front; the shipment itself is fetched as one query and
// handed down as a shared promise. Every section below awaits that same promise
// independently inside its own <Suspense>, so the page shell (back link,
// grid layout) paints immediately and each section streams in the instant the
// query resolves, with a layout-matched skeleton until then.
// ---------------------------------------------------------------------------

async function getTenantOrgId() {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/sign-in");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) redirect("/sign-in");

  return org.id;
}

async function getShipment(id: string, orgId: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { id, orgId },
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      bookedAt: true,
      internalNotes: true,
      billingSameAsDelivery: true,
      // INTERNATIONAL or DOMESTIC. Decides which of the mode-specific blocks on
      // this page render at all: a domestic shipment has no customs category
      // and no air waybill, and an international one has no cash on delivery.
      mode: true,
      // The customs export category picked on the packages step. Null on drafts,
      // on rows created before the field existed, and on every domestic
      // shipment, so every read of it here has a "Not set" path.
      shipmentType: true,
      // Cash on delivery — domestic only. codAmount is the goods value the
      // courier collects from the receiver, NOT part of what was charged.
      codEnabled: true,
      codAmount: true,
      domesticAwbNumber: true,
      domesticTrackingUrl: true,
      // The courier booking behind a domestic shipment. Read so the label card
      // can tell "still being issued" apart from "something went wrong", which
      // are the same blank space to a customer otherwise.
      domesticCourierStatus: true,
      domesticCourierName: true,
      domesticLabelDocumentId: true,
      // Arena's own rendering of the same waybill, filed beside the courier's
      // while both are in use. Domestic only; an export carries the carrier's
      // label alone.
      arenaLabelDocumentId: true,
      // And the same three for an export. Read for exactly the same reason:
      // the label card has to tell "still being issued" apart from "something
      // went wrong", which are the same blank space to a customer otherwise.
      intlBookingStatus: true,
      intlAwbNumber: true,
      intlCarrierName: true,
      intlLabelDocumentId: true,
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

      // First-mile (door → hub) leg — rendered only when opted in
      pickupIncluded: true,
      firstMileStatus: true,
      firstMileVendorName: true,
      firstMileCharge: true,
      firstMileHubLabel: true,
      firstMileTrackingNumber: true,
      firstMileTrackingUrl: true,
      firstMilePickupScheduledAt: true,
      firstMilePickedUpAt: true,
      firstMileHubArrivedAt: true,
      firstMileStatusUpdatedAt: true,

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
          contents: {
            select: {
              id: true,
              description: true,
              hsCode: true,
              quantity: true,
              unitValue: true,
              currency: true,
            },
            orderBy: { createdAt: "asc" },
          },
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
        // Newest first — the timeline shows the most recent event at the top.
        orderBy: { createdAt: "desc" },
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
  return shipment;
}

type ShipmentPromise = ReturnType<typeof getShipment>;

function packageTotals(shipment: Awaited<ShipmentPromise>) {
  // A box's `quantity` is how many identical boxes it stands for, so the box
  // count is the sum of those. Item lines are the individual goods declared.
  const totalBoxes = shipment.packages.reduce((a, p) => a + p.quantity, 0);
  const totalItemLines = shipment.packages.reduce(
    (a, p) => a + (p.contents?.length ?? 0),
    0,
  );
  const totalDeclared = shipment.packages.reduce(
    (sum, p) => sum + (toNumber(p.declaredValue) ?? 0) * p.quantity,
    0,
  );
  return { totalBoxes, totalItemLines, totalDeclared };
}

// ---------------------------------------------------------------------------
// Journey steps — the progress rail shown to clients
// ---------------------------------------------------------------------------

type JourneyStep = {
  status: ShipmentStatus[];
  label: string;
};

const JOURNEY_STEPS: JourneyStep[] = [
  {
    status: [
      "DRAFT" as ShipmentStatus,
      "PENDING_PAYMENT" as ShipmentStatus,
      "BOOKED" as ShipmentStatus,
    ],
    label: "Booked",
  },
  {
    status: [
      "PROCESSING" as ShipmentStatus,
      "DOCUMENTS_PENDING" as ShipmentStatus,
    ],
    label: "Processing",
  },
  {
    status: [
      "IN_TRANSIT" as ShipmentStatus,
      "CUSTOMS_HOLD" as ShipmentStatus,
      "ON_HOLD" as ShipmentStatus,
    ],
    label: "In transit",
  },
  {
    status: ["OUT_FOR_DELIVERY" as ShipmentStatus],
    label: "Out for delivery",
  },
  {
    status: ["DELIVERED" as ShipmentStatus],
    label: "Delivered",
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
// Layout primitives
//
// The page carries no card chrome at all: hierarchy comes from type size and
// weight, and the only rules on the page are the hairline under each section
// title and the one splitting the sidebar off. Anything that needs to stand
// out (a status, an alert, a money figure) earns it with size, weight or
// colour rather than a box.
//
// Six steps, used consistently everywhere on the page. Nothing is sized or
// weighted off this list, which is what keeps a page with this much data on it
// from turning into noise:
//
//   Display  text-3xl font-semibold tracking-tight  shipment number, total
//   Lead     text-xl  font-semibold tracking-tight  route cities, current status
//   Stat     text-base font-semibold                key figures, money
//   Heading  text-sm  font-semibold                 group and block titles
//   Eyebrow  text-xs  font-semibold uppercase       section titles, muted
//   Body     text-sm                                content, muted when secondary
//   Meta     text-xs  muted                         field labels, timestamps
//
// Weight carries the emphasis inside a step: font-semibold is reserved for the
// value a customer came to read, font-medium for its supporting detail.
// ---------------------------------------------------------------------------

/** Section heading: small caps over a single hairline, with optional right meta. */
function SectionTitle({
  children,
  meta,
  tooltip,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 cursor-help text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56 text-xs normal-case">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </h2>
      {meta && (
        <span className="text-xs text-muted-foreground">{meta}</span>
      )}
    </div>
  );
}

/** A labelled value: quiet label, then the value a step up in weight. */
function Field({
  label,
  value,
  sub,
  mono,
  align = "left",
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  mono?: boolean;
  align?: "left" | "right";
  tooltip?: string;
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <p
        className={cn(
          "flex items-center gap-1 text-xs text-muted-foreground",
          align === "right" && "justify-end",
        )}
      >
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 cursor-help text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56 text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </p>
      <p
        className={cn(
          "mt-1.5 text-base font-semibold text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Label left, value right — used down the sidebar. No dividers by design. */
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
    <div className="flex items-baseline justify-between gap-4">
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 cursor-help text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-52 text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      <span
        className={cn(
          "text-right text-xs font-medium text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** The one shape on the page that keeps a border: something needing attention. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
        {children}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address block — plain type, no container. The two blocks are told apart by
// their labels and a hairline between the columns, not by two boxes.
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
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">
        {isPickup ? "Sender · Consignor" : "Receiver · Consignee"}
      </p>
      {addr.contactName && (
        <p className="mt-1.5 text-base font-semibold text-foreground">
          {addr.contactName}
        </p>
      )}
      {addr.contactPhone && (
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {addr.contactPhone}
        </p>
      )}
      <div className="mt-3 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
        <p>{addr.line1}</p>
        {addr.line2 && <p>{addr.line2}</p>}
        <p>{geo}</p>
        <p className="font-medium text-foreground">{addr.country}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Journey progress rail
// ---------------------------------------------------------------------------

function JourneyRail({ currentStatus }: { currentStatus: ShipmentStatus }) {
  const { activeIdx } = getJourneyState(currentStatus);

  return (
    <div className="relative">
      {/* Background track */}
      <div className="absolute left-0 right-0 top-2.75 h-px bg-border" />

      {/* Filled track up to the active step */}
      {activeIdx > 0 && (
        <div
          className="absolute left-0 top-2.75 h-px bg-foreground/40 transition-all duration-500"
          style={{
            width: `${(activeIdx / (JOURNEY_STEPS.length - 1)) * 100}%`,
          }}
        />
      )}

      <div className="relative flex justify-between">
        {JOURNEY_STEPS.map((step, idx) => {
          const isLastStep = idx === JOURNEY_STEPS.length - 1;
          // The final step, once reached, is done rather than in progress.
          const isDone = idx < activeIdx || (idx === activeIdx && isLastStep);
          const isActive = idx === activeIdx && !isLastStep;

          return (
            <div
              key={step.label}
              className="flex min-w-0 flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "relative z-10 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-background transition-colors duration-300",
                  isDone && "bg-foreground",
                  isActive && "ring-2 ring-inset ring-foreground",
                  !isDone && !isActive && "ring-1 ring-inset ring-border",
                )}
              >
                {isDone && <Check className="h-3 w-3 text-background" />}
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                )}
              </div>
              <span
                className={cn(
                  "max-w-18 text-center text-xs leading-tight",
                  isDone && "text-muted-foreground",
                  isActive && "font-semibold text-foreground",
                  !isDone && !isActive && "text-muted-foreground/50",
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections — each awaits the same shared shipment promise, and each is
// wrapped in its own <Suspense> by the page below. Splitting it this way
// means every section gets a skeleton that matches its own shape, and a slow
// render in one never holds up the others.
// ---------------------------------------------------------------------------

async function ShipmentHeader({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  const { totalBoxes, totalItemLines, totalDeclared } = packageTotals(s);
  const isDomestic = s.mode === "DOMESTIC";
  const exportType =
    !isDomestic && s.shipmentType ? SHIPMENT_TYPE_INFO[s.shipmentType] : null;

  // The one-line subtitle under the shipment number: what kind of shipment
  // this is, then when it happened. All of it used to be badges. The mode is
  // rendered ahead of this list, in foreground weight, because it is the one
  // part of the line that changes what the rest of the page means.
  const meta: React.ReactNode[] = [];
  if (exportType) {
    meta.push(
      <Tooltip key="export-type">
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">
            {exportType.label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs">
          {exportType.blurb}
        </TooltipContent>
      </Tooltip>,
    );
  }
  if (isDomestic && s.codEnabled) {
    meta.push(
      <Tooltip key="cod">
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">
            Cash on delivery
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-60 text-xs">
          The courier collects{" "}
          {formatMoney(s.codAmount, "INR", { fallback: "the goods value" })}{" "}
          from the receiver on delivery and remits it to you. This is the value
          of your goods, not the shipping charge.
        </TooltipContent>
      </Tooltip>,
    );
  }
  meta.push(`Created ${formatDate(s.createdAt)}`);
  if (s.bookedAt) meta.push(`Booked ${formatDate(s.bookedAt)}`);

  return (
    <header className="space-y-8">
      {/* Identity + price */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {s.shipmentNumber}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {isDomestic ? "Domestic" : "International"}
            </span>
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-muted-foreground/40">·</span>
                {item}
              </span>
            ))}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
            {formatMoney(s.quotedTotal, s.currency, { fallback: "Not set" })}
          </p>
          <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            Total quoted
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 cursor-help text-muted-foreground/40" />
              </TooltipTrigger>
              <TooltipContent className="max-w-56 text-xs">
                The price quoted to you at time of booking, including all
                surcharges and applicable markup.
              </TooltipContent>
            </Tooltip>
          </p>
        </div>
      </div>

      {/* Route */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">From</p>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
            {s.pickupAddress.city}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {s.pickupAddress.country}
            {s.pickupAddress.contactName && ` · ${s.pickupAddress.contactName}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-end pb-6 text-muted-foreground/50">
          <span className="h-px w-6 bg-border sm:w-12" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="h-px w-6 bg-border sm:w-12" />
        </div>
        <div className="min-w-0 text-right">
          <p className="text-xs text-muted-foreground">To</p>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
            {s.deliveryAddress.city}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {s.deliveryAddress.country}
            {s.deliveryAddress.contactName &&
              ` · ${s.deliveryAddress.contactName}`}
          </p>
        </div>
      </div>

      {/* Key figures — separated by space, not by dividers */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-4">
        <Field
          label="Boxes"
          value={`${totalBoxes} box${totalBoxes !== 1 ? "es" : ""}`}
          sub={`${totalItemLines} item${totalItemLines !== 1 ? "s" : ""} inside`}
        />
        <Field
          label="Actual weight"
          value={formatWeight(s.totalActualWeightKg, {
            fallback: "Not set",
            treatZeroAsUnset: true,
          })}
          sub={
            s.totalChargeableWeightKg
              ? `Chargeable ${formatWeight(s.totalChargeableWeightKg, {
                  fallback: "Not set",
                  treatZeroAsUnset: true,
                })}`
              : undefined
          }
          tooltip="Actual physical weight. Chargeable weight can be higher when the box size (volumetric weight) is greater."
        />
        {/* White-labelled, not raw: this whole route group is customer-facing
            (carrierBranding.md D11), so the sourcing vendor's own-brand service
            reads as "Arena Direct" here exactly as it did on the quote the
            customer accepted. */}
        <Field
          label="Service"
          value={brandServiceName(s.selectedProductName) || "Not assigned"}
        />
        <Field
          label="Declared value"
          value={
            totalDeclared > 0
              ? formatMoney(totalDeclared, undefined, { fallback: "Not set" })
              : "Not declared"
          }
          sub={s.client ? `For ${s.client.companyName}` : "Your own org"}
        />
      </div>
    </header>
  );
}

async function StatusSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  const cfg = STATUS_CONFIG[s.status];
  const { cancelled } = getJourneyState(s.status);
  const isDomestic = s.mode === "DOMESTIC";
  // Whichever waybill is on file. Domestic runs on the courier's AWB; an export
  // has two, and the House AWB is the one we generate and hand to the customer,
  // so it takes priority over the airline's Master AWB.
  const trackingNumber = isDomestic
    ? s.domesticAwbNumber
    : (s.hawbNumber ?? s.mawbNumber);

  return (
    <section className="space-y-6">
      <SectionTitle>Status</SectionTitle>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-xl">
          <p className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-foreground">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                cfg.dotClassName,
              )}
            />
            {cfg.label}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {cfg.description}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Tracking number</p>
          <p
            className={cn(
              "mt-1",
              trackingNumber
                ? "text-base font-mono font-semibold tracking-tight text-foreground"
                : "text-sm text-muted-foreground",
            )}
          >
            {trackingNumber ?? "Not added yet"}
          </p>
        </div>
      </div>

      {!cancelled && (
        <div className="pt-2">
          <JourneyRail currentStatus={s.status} />
        </div>
      )}

      {cancelled && (
        <Notice>
          This shipment has been cancelled. Contact support if you need help.
        </Notice>
      )}

      {s.status === "DOCUMENTS_PENDING" && (
        <Notice>
          Action required: our team needs additional documents. Please check
          your email or contact support.
        </Notice>
      )}
      {s.status === "CUSTOMS_HOLD" && (
        <Notice>
          Your shipment is under customs review. We are actively working to
          resolve this.
        </Notice>
      )}
      {s.status === "ON_HOLD" && (
        <Notice>
          Your shipment is temporarily on hold. Our team will be in touch with
          more details.
        </Notice>
      )}
    </section>
  );
}

async function FirstMileSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  if (!s.pickupIncluded) return null;

  // Legacy rows may have no status yet; default to Scheduled.
  const firstMileStatus = s.firstMileStatus ?? FirstMileStatus.SCHEDULED;

  return (
    <FirstMilePickupCard
      chrome="plain"
      status={firstMileStatus}
      hubLabel={s.firstMileHubLabel}
      courierName={s.firstMileVendorName}
      charge={toNumber(s.firstMileCharge) ?? 0}
      currency={s.currency ?? "INR"}
      trackingNumber={s.firstMileTrackingNumber}
      trackingUrl={s.firstMileTrackingUrl}
      pickupFromLabel={[s.pickupAddress.city, s.pickupAddress.postalCode]
        .filter(Boolean)
        .join(" ")}
      scheduledAt={s.firstMilePickupScheduledAt}
      pickedUpAt={s.firstMilePickedUpAt}
      hubArrivedAt={s.firstMileHubArrivedAt}
      updatedAt={s.firstMileStatusUpdatedAt}
      // Once the parcel has reached the hub this leg is done; collapse it so
      // it stops taking up space the international leg now owns.
      collapsible={firstMileStatus === FirstMileStatus.ARRIVED_AT_HUB}
    />
  );
}

async function AddressesSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;

  return (
    <section className="space-y-6">
      <SectionTitle>Addresses</SectionTitle>

      <div className="grid gap-8 sm:grid-cols-2">
        <AddressBlock role="pickup" addr={s.pickupAddress} />
        {/* The hairline between the columns is the only rule here: it separates
            sender from receiver without drawing two boxes. */}
        <div className="sm:border-l sm:pl-8">
          <AddressBlock role="delivery" addr={s.deliveryAddress} />
        </div>
      </div>

      {!s.billingSameAsDelivery && s.billingAddress && (
        <div className="border-t pt-5">
          <p className="text-xs text-muted-foreground">Billing address</p>
          <div className="mt-1.5 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
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
    </section>
  );
}

async function PackagesSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  const { totalBoxes, totalItemLines } = packageTotals(s);

  return (
    <section className="space-y-6">
      <SectionTitle
        meta={`${totalBoxes} box${totalBoxes !== 1 ? "es" : ""} · ${totalItemLines} item${totalItemLines !== 1 ? "s" : ""}`}
      >
        What&apos;s inside
      </SectionTitle>
      <PackageBoxList
        packages={s.packages}
        fallbackCurrency={s.currency ?? "INR"}
      />
    </section>
  );
}

async function PricingSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  const charges = s.chargesSnapshot as {
    charges?: { name: string; amount: number; currency: string }[];
  } | null;
  const lineItems = charges?.charges ?? [];

  // Collapsed by default. Most visits are about where the parcel is or which
  // paperwork to print, and the price is already settled: the total stays on
  // the summary row so nothing is hidden, and only the line items fold away.
  // Native <details> keeps this a server component, same as the first-mile card.
  return (
    <section>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 border-b pb-2.5 [&::-webkit-details-marker]:hidden">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Pricing
          </h2>
          <span className="flex items-baseline gap-3">
            <span className="text-base font-semibold tracking-tight tabular-nums text-foreground">
              {formatMoney(s.quotedTotal, s.currency, { fallback: "Not set" })}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              <span className="group-open:hidden">Show breakdown</span>
              <span className="hidden group-open:inline">Hide</span>
              <ChevronDown className="h-3.5 w-3.5 self-center transition-transform duration-200 group-open:rotate-180" />
            </span>
          </span>
        </summary>

        <div className="pt-5">
          <p className="text-sm text-muted-foreground">
            Locked in at booking. The total will not change even if rates move
            afterward.
          </p>

          <dl className="mt-5 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Service</dt>
              <dd className="text-sm text-foreground">
                {brandServiceName(s.selectedProductName) || "Not assigned"}
              </dd>
            </div>

            {lineItems.map((c, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="text-sm text-muted-foreground">{c.name}</dt>
                <dd className="text-sm tabular-nums text-foreground">
                  {formatMoney(c.amount, c.currency, { fallback: "Not set" })}
                </dd>
              </div>
            ))}

            <div className="flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-sm font-medium text-foreground">Total</dt>
              <dd className="text-lg font-semibold tracking-tight tabular-nums text-foreground">
                {formatMoney(s.quotedTotal, s.currency, { fallback: "Not set" })}
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Paperwork — one section, three groups
//
// The shipping label, Arena's tax invoice and the file list used to be three
// separate cards stacked on top of each other, which meant a customer looking
// for "my paperwork" had to work out which of three boxes owned the thing they
// wanted. They are one section now, split into labelled groups in the order
// they actually get used: print the label, keep the invoice, then everything
// else.
//
// Each group renders only when it has something to say, and the section itself
// renders an empty state only when all three are empty.
// ---------------------------------------------------------------------------

/** A labelled run of rows inside the paperwork section. */
function DocGroup({
  label,
  hint,
  children,
}: {
  label: string;
  /** One line saying what this group is for, in the customer's words. */
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 space-y-1">{children}</div>
    </section>
  );
}

/**
 * One downloadable thing. `title` is what the customer would call it, `subtitle`
 * is the small print, and `action` is either a download button or a plain line
 * explaining why there is nothing to download yet.
 */
function DocRow({
  icon: Icon,
  title,
  titleMono,
  subtitle,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  titleMono?: boolean;
  subtitle: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-foreground",
            titleMono && "font-mono",
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function DownloadButton({
  href,
  fileName,
}: {
  href: string;
  fileName?: string | null;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName ?? undefined}
      >
        <Download className="mr-1.5 h-4 w-4" aria-hidden />
        Download
      </a>
    </Button>
  );
}

/** The line that stands in for a download button while a file is still coming. */
function PendingNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="block max-w-44 text-right text-xs text-muted-foreground">
      {children}
    </span>
  );
}

async function DocumentsSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  const invoice = await getShipmentTaxInvoiceAction(s.id);

  // Domestic and international both produce a waybill we booked, so the label
  // group is resolved from whichever of the two applies rather than being
  // written twice. Everything below reads these three values and nothing else
  // about the mode.
  const isDomestic = s.mode === "DOMESTIC";

  const labelDocumentId = isDomestic
    ? s.domesticLabelDocumentId
    : s.intlLabelDocumentId;
  const awbNumber = isDomestic ? s.domesticAwbNumber : s.intlAwbNumber;
  const carrierName = isDomestic ? s.domesticCourierName : s.intlCarrierName;
  const bookingStatus = isDomestic
    ? s.domesticCourierStatus
    : s.intlBookingStatus;

  // Arena's own rendering of the same waybill, on domestic bookings. It is a
  // second file for one parcel, so it is shown INSIDE the label group with the
  // carrier's, never loose in the file list where it would read as a different
  // document altogether.
  const arenaLabelDocumentId = isDomestic ? s.arenaLabelDocumentId : null;

  // The waybill labels get their own group at the top, so they are filtered out
  // of the file list below. The same download in two places on one page just
  // makes the customer wonder which of them is the real one.
  const documents = s.documents.filter(
    (d) => d.id !== labelDocumentId && d.id !== arenaLabelDocumentId,
  );

  const labelDoc = labelDocumentId
    ? (s.documents.find((d) => d.id === labelDocumentId) ?? null)
    : null;

  const arenaLabelDoc = arenaLabelDocumentId
    ? (s.documents.find((d) => d.id === arenaLabelDocumentId) ?? null)
    : null;

  // A label group exists only where Arena booked the carrier through an API.
  // Legacy rows, and exports placed by hand before automatic booking existed,
  // sit at NOT_REQUIRED and show nothing rather than a promise we cannot keep.
  const showLabel = bookingStatus !== "NOT_REQUIRED";

  const invoiceReady =
    !!invoice && invoice.generationStatus === "READY" && !!invoice.fileUrl;

  const isEmpty = !showLabel && !invoice && documents.length === 0;

  return (
    <section className="space-y-6">
      <SectionTitle
        meta={
          documents.length > 0
            ? `${documents.length} file${documents.length > 1 ? "s" : ""} attached`
            : undefined
        }
      >
        Documents
      </SectionTitle>

      {isEmpty ? (
        <div className="flex flex-col items-start gap-1 py-2">
          <p className="text-sm text-foreground">Nothing to download yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {isDomestic
              ? "Anything you attached at booking, plus what our team adds later, shows up here."
              : "Your airway bill, invoices and customs paperwork show up here as they are issued."}
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {/* 1. The one thing that has to leave the screen and go on the box. */}
          {showLabel && (
            <DocGroup
              label={arenaLabelDoc ? "Shipping labels" : "Shipping label"}
              hint={
                arenaLabelDoc
                  ? "Two versions of the same waybill. Print either one and attach it to the parcel before the courier arrives."
                  : "Print this and attach it to the parcel before the courier arrives."
              }
            >
              <DocRow
                icon={Printer}
                title={awbNumber ?? "Being issued"}
                titleMono
                subtitle={
                  carrierName ? `Waybill · ${carrierName}` : "Carrier waybill"
                }
                action={
                  labelDoc ? (
                    <DownloadButton
                      href={labelDoc.fileUrl}
                      fileName={labelDoc.fileName}
                    />
                  ) : bookingStatus === "FAILED" ? (
                    <PendingNote>
                      Our team is arranging this. Your booking and payment are
                      safe.
                    </PendingNote>
                  ) : (
                    <PendingNote>
                      Usually ready within a minute of booking.
                    </PendingNote>
                  )
                }
              />

              {/* Arena's own rendering of the same waybill. Only ever shown
                  once it exists: a customer waiting on a label should be
                  watching one row, not two. */}
              {arenaLabelDoc && (
                <DocRow
                  icon={Printer}
                  title={awbNumber ?? "Being issued"}
                  titleMono
                  subtitle="Arena label · same waybill and barcode"
                  action={
                    <DownloadButton
                      href={arenaLabelDoc.fileUrl}
                      fileName={arenaLabelDoc.fileName}
                    />
                  }
                />
              )}
            </DocGroup>
          )}

          {/* 2. What Arena issued to the customer, as opposed to the customer's
                own paperwork in the group below. Absent on shipments booked
                before invoicing existed, and for the minute it takes the
                background job to finish. */}
          {invoice && (
            <DocGroup
              label="Tax invoice"
              hint="Arena's GST invoice for this booking. Keep it for your records."
            >
              <DocRow
                icon={Receipt}
                title={invoice.invoiceNumber ?? "Being prepared"}
                subtitle={
                  <>
                    {formatMoney(invoice.total, invoice.currency)}
                    {invoice.status === "UNPAID" && " · Unpaid"}
                  </>
                }
                action={
                  invoiceReady ? (
                    <DownloadButton
                      href={invoice.fileUrl as string}
                      fileName={invoice.fileName}
                    />
                  ) : (
                    <PendingNote>
                      Usually ready within a minute of booking.
                    </PendingNote>
                  )
                }
              />
            </DocGroup>
          )}

          {/* 3. Everything else on file: what the customer uploaded at booking
                and what ops added afterwards. */}
          {documents.length > 0 && (
            <DocGroup
              label="Supporting documents"
              hint={
                isDomestic
                  ? "Files attached to this booking, such as an e-way bill or delivery challan."
                  : "Files attached to this booking, such as the commercial invoice, packing list and customs forms."
              }
            >
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {doc.label}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatEnumLabel(doc.docType)} · {doc.fileName} ·{" "}
                      {formatFileSize(doc.fileSize)} ·{" "}
                      {formatDate(doc.uploadedAt)}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                </a>
              ))}
            </DocGroup>
          )}
        </div>
      )}
    </section>
  );
}

async function WalletTransactionsSection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;
  if (s.walletTransactions.length === 0) return null;

  return (
    <section className="space-y-5">
      <SectionTitle tooltip="Payment debits and credits linked to this shipment. Credits are top-ups and refunds; debits are the charges for this shipment.">
        Wallet activity
      </SectionTitle>

      <div className="space-y-4">
        {s.walletTransactions.map((txn) => {
          const isCredit = txn.type === "TOP_UP" || txn.type === "REFUND";
          return (
            <div
              key={txn.id}
              className="flex items-baseline justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {formatEnumLabel(txn.type)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(txn.createdAt)} ·{" "}
                  {formatEnumLabel(txn.status, "lower")}
                </p>
                {txn.notes && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {txn.notes}
                  </p>
                )}
              </div>
              <p
                className={cn(
                  "shrink-0 text-base font-semibold tabular-nums",
                  isCredit
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground",
                )}
              >
                {isCredit ? "+" : "−"}
                {formatMoney(txn.amount, txn.currency, { fallback: "Not set" })}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function BookingSummarySection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;

  return (
    <section className="space-y-5">
      <SectionTitle>Booking</SectionTitle>

      {s.client ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {s.client.companyName}
          </p>
          {s.client.contactName && (
            <p className="truncate text-xs text-muted-foreground">
              {s.client.contactName}
            </p>
          )}
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {s.client.email && <p className="truncate">{s.client.email}</p>}
            {s.client.phone && <p className="tabular-nums">{s.client.phone}</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Booked for your own organisation.
        </p>
      )}

      <div className="space-y-2.5">
        <KVRow
          label="Type"
          value={s.mode === "DOMESTIC" ? "Domestic" : "International"}
          tooltip={
            s.mode === "DOMESTIC"
              ? "Delivered within India by courier. No customs clearance is involved."
              : "Sent from India to another country by air. Customs clearance and export paperwork apply."
          }
        />
        {/* Only exports have a customs category, so the row is hidden rather
            than shown as "Not set" on a domestic shipment, where it would read
            as a missing value instead of one that does not apply. */}
        {s.mode !== "DOMESTIC" && (
          <KVRow
            label="Export type"
            value={shipmentTypeLabel(s.shipmentType) ?? "Not set"}
          />
        )}
        {s.mode === "DOMESTIC" && s.codEnabled && (
          <KVRow
            label="Cash on delivery"
            value={formatMoney(s.codAmount, "INR", { fallback: "Enabled" })}
            tooltip="Collected from the receiver on delivery and remitted to you. This is the declared value of your goods, separate from the shipping charge you already paid."
          />
        )}
        <KVRow label="Created" value={formatDateTime(s.createdAt)} />
        <KVRow
          label="Booked"
          value={s.bookedAt ? formatDateTime(s.bookedAt) : null}
        />
        <KVRow label="Last updated" value={formatDateTime(s.updatedAt)} />
        <KVRow
          label="Reference"
          value={s.id}
          mono
          tooltip="Internal system ID. Use the shipment number at the top of this page when contacting support."
        />
      </div>
    </section>
  );
}

async function StatusHistorySection({
  shipmentPromise,
}: {
  shipmentPromise: ShipmentPromise;
}) {
  const s = await shipmentPromise;

  return (
    <section className="space-y-5">
      <SectionTitle>History</SectionTitle>

      {s.statusHistory.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events recorded yet.</p>
      ) : (
        <div className="relative">
          {/* One vertical hairline threading the events together */}
          <div className="absolute bottom-3 left-0.75 top-2 w-px bg-border" />
          <ol>
            {s.statusHistory.map((evt, i) => {
              const evtCfg = STATUS_CONFIG[evt.toStatus];
              // History is newest-first, so the top row is current.
              const isCurrent = i === 0;
              return (
                <li key={evt.id} className="relative pb-5 pl-5 last:pb-0">
                  <span
                    className={cn(
                      "absolute left-0 top-1.5 h-1.75 w-1.75 rounded-full ring-2 ring-background",
                      evtCfg?.dotClassName ?? "bg-muted-foreground/30",
                    )}
                  />
                  <p
                    className={cn(
                      "text-sm text-foreground",
                      isCurrent && "font-semibold",
                    )}
                  >
                    {evtCfg?.label ?? formatEnumLabel(evt.toStatus)}
                    {isCurrent && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/70">
                    {formatDateTime(evt.createdAt)}
                  </p>
                  {evt.note && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {evt.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page — a thin, static shell. The back link and grid layout render
// instantly; every section below streams in independently as the (single,
// shared) shipment query resolves.
// ---------------------------------------------------------------------------

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getTenantOrgId();

  // Kick off the query once — every section below shares this promise. React
  // dedupes the underlying fetch, so this is still a single DB round trip.
  const shipmentPromise = getShipment(id, orgId);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
          {/* ── Back nav — static, never blocked ── */}
          <Link
            href="/shipments"
            className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            All shipments
          </Link>

          <div className="mt-8 space-y-12">
            <Suspense fallback={<HeaderSkeleton />}>
              <ShipmentHeader shipmentPromise={shipmentPromise} />
            </Suspense>

            <Suspense fallback={<StatusSkeleton />}>
              <StatusSection shipmentPromise={shipmentPromise} />
            </Suspense>

            <Suspense fallback={<FirstMileSkeleton />}>
              <FirstMileSection shipmentPromise={shipmentPromise} />
            </Suspense>

            {/* ── Two columns — the sidebar is split off by a single hairline ── */}
            <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_244px] xl:items-start xl:gap-x-10">
              <div className="min-w-0 space-y-12">
                <Suspense fallback={<AddressesSkeleton />}>
                  <AddressesSection shipmentPromise={shipmentPromise} />
                </Suspense>

                <Suspense fallback={<PackagesSkeleton />}>
                  <PackagesSection shipmentPromise={shipmentPromise} />
                </Suspense>

                {/* Paperwork sits above pricing: it is the thing customers come
                    back to this page for, and the price is already locked in and
                    shown at the top. */}
                <Suspense fallback={<DocumentsSkeleton />}>
                  <DocumentsSection shipmentPromise={shipmentPromise} />
                </Suspense>

                <Suspense fallback={<PricingSkeleton />}>
                  <PricingSection shipmentPromise={shipmentPromise} />
                </Suspense>

                <Suspense fallback={<WalletTransactionsSkeleton />}>
                  <WalletTransactionsSection shipmentPromise={shipmentPromise} />
                </Suspense>
              </div>

              <div className="space-y-10 xl:border-l xl:pl-10">
                <Suspense fallback={<BookingSummarySkeleton />}>
                  <BookingSummarySection shipmentPromise={shipmentPromise} />
                </Suspense>

                <Suspense fallback={<StatusHistorySkeleton />}>
                  <StatusHistorySection shipmentPromise={shipmentPromise} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
