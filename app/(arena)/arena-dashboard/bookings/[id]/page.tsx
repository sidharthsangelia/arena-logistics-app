import { prisma } from "@/utils/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ShipmentStatus, FirstMileStatus, ShipmentMode } from "@/generated/prisma";

import {
  ArrowLeft,
  Package,
  MapPin,
  Truck,
  Clock,
  Building2,
  User,
  Phone,
  Mail,
  Hash,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  Banknote,
  FileWarning,
  PackageX,
  Bell,
  ChevronDown,
  RefreshCw,
  Home,
  Scale,
  Receipt,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusUpdatePanel } from "@/components/booking/arena/StatusUpdatePanel";
import { InternalNotesPanel } from "@/components/booking/arena/InternalNotesPanel";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { CarrierTrackingPanel } from "@/components/booking/arena/CarrierTrackingPanel";
import { DocumentManager } from "@/components/booking/arena/DocumentManager";
import { CopyButton } from "@/components/booking/CopyButton";
import {
  num,
  fmtDatetime,
  fmtMoney,
  fmtNum,
  STATUS_ACCENT,
  SectionLabel,
  HeroStat,
  CollapsibleCard,
  CardTitleRow,
  InfoRow,
  AddressCard,
  Field,
} from "@/components/booking/arena/DetailPrimitives";
import { PackageBoxList } from "@/components/booking/PackageBoxList";
import { FirstMilePickupCard } from "@/components/booking/FirstMilePickupCard";
import { FirstMileStatusPanel } from "@/components/booking/arena/FirstMileStatusPanel";
import { FirstMilePickupBooking } from "@/components/booking/arena/FirstMilePickupBooking";
import { KycDocsCard } from "@/components/booking/arena/KycDocsCard";
import { PaymentCollectionCard } from "@/components/booking/arena/PaymentCollectionCard";
import { toCollectionRow } from "@/lib/wallet/adminLedger";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  KYC_DOC_CONFIGS,
  WAIVED_REQUIRED_KYC_KEYS,
  requiredKycDocTypes,
} from "@/lib/booking/kyc";
import { FIRST_MILE_STAGES } from "@/lib/booking/firstMileStatus";
import { CSB4_MAX_VALUE, SHIPMENT_TYPE_INFO } from "@/lib/booking/cargo";
import { PartyType } from "@/generated/prisma";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async function getShipment(id: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          markupPercent: true,
          plan: true,
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          companyKind: true,
        },
      },
      pickupAddress: true,
      deliveryAddress: true,
      billingAddress: true,
      packages: {
        orderBy: { createdAt: "asc" },
        include: {
          contents: { orderBy: { createdAt: "asc" } },
        },
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
      },
      // Feeds the payment card for bookings that shipped before paying.
      paymentCollections: {
        orderBy: { collectedAt: "desc" },
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
      },
      walletTransactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          balanceAfter: true,
          createdAt: true,
        },
      },
    },
  });

  if (!shipment) notFound();

  // Domestic bookings have their own page, with the panels that actually apply
  // to a courier parcel. Redirecting rather than rendering here keeps every
  // pre-existing link — notification rows, ledger rows, bookmarks — working
  // after the split, instead of quietly showing ops a page of blank panels.
  if (shipment.mode === ShipmentMode.DOMESTIC) {
    redirect(`/arena-dashboard/domestic-bookings/${shipment.id}`);
  }

  return shipment;
}

// KYC docs live in a per-party vault (the shipment's client, or the org when
// there is no client). Ops reads them straight here — the (arena) layout
// already gates access — so they never have to leave the booking page. We keep
// the newest document per type.
async function getPartyKycDocs(orgId: string, clientId: string | null) {
  const rows = await prisma.kycDocument.findMany({
    where: clientId
      ? { partyType: PartyType.CLIENT, clientId }
      : { partyType: PartyType.ORG, orgId },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      docType: true,
      label: true,
      docNumber: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      verifiedAt: true,
      expiresAt: true,
      uploadedAt: true,
    },
  });

  const now = Date.now();
  const seen = new Set<string>();
  const latest = [];
  for (const r of rows) {
    if (seen.has(r.docType)) continue;
    seen.add(r.docType);
    latest.push({
      id: r.id,
      docType: r.docType,
      label: r.label,
      docNumber: r.docNumber,
      fileUrl: r.fileUrl,
      fileName: r.fileName,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      verifiedAt: r.verifiedAt,
      expired: r.expiresAt != null && r.expiresAt.getTime() < now,
      uploadedAt: r.uploadedAt,
    });
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Shipment-type reference (mirrors the KYC matrix in lib/booking/kyc.ts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Needs attention — the one place ops must not skim past. Collapses every
// action-worthy signal on the shipment (holds, unpaid, missing type/carrier/
// AWB/HSN, multipiece) into a single ranked list. Renders nothing when clear.
// ---------------------------------------------------------------------------

type AttnTone = "danger" | "warn" | "info";

interface AttnItem {
  tone: AttnTone;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}

const TONE_TEXT: Record<AttnTone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

function NeedsAttention({
  status,
  paymentDeferred,
  paymentSettled,
  shipmentType,
  totalDeclared,
  currency,
  selectedVendorId,
  totalBoxes,
  missingHsnCount,
  missingKycCount,
  hasAwb,
  pickupIncluded,
  firstMileArrivedAtHub,
  firstMileHasTracking,
}: {
  status: ShipmentStatus;
  paymentDeferred: boolean;
  /** True once the money is fully in, or the balance was written off. */
  paymentSettled: boolean;
  shipmentType: string | null;
  totalDeclared: number;
  currency: string;
  selectedVendorId: string | null;
  totalBoxes: number;
  missingHsnCount: number;
  missingKycCount: number;
  hasAwb: boolean;
  pickupIncluded: boolean;
  firstMileArrivedAtHub: boolean;
  firstMileHasTracking: boolean;
}) {
  const closed = status === "DELIVERED" || status === "CANCELLED";
  const items: AttnItem[] = [];

  if (status === "PENDING_PAYMENT")
    items.push({
      tone: "danger",
      icon: Banknote,
      text: "Payment is not confirmed. Do not process until it clears.",
    });
  if (status === "DOCUMENTS_PENDING")
    items.push({
      tone: "danger",
      icon: FileWarning,
      text: "Documents are pending from the customer. Follow up before processing.",
    });
  if (status === "CUSTOMS_HOLD")
    items.push({
      tone: "danger",
      icon: AlertTriangle,
      text: "Held at customs. Action is required to release it.",
    });
  if (status === "ON_HOLD")
    items.push({
      tone: "warn",
      icon: AlertTriangle,
      text: "This shipment is on hold.",
    });

  // Door pickup booked but no courier tracking captured — ops can't tell the
  // customer where the parcel is on the first leg. Drops off once it's at the
  // hub (the leg is done) or the shipment is closed.
  if (
    pickupIncluded &&
    !firstMileArrivedAtHub &&
    !firstMileHasTracking &&
    !closed
  )
    items.push({
      tone: "info",
      icon: Truck,
      text: "Door pickup is booked but no courier tracking is recorded. Add it so the customer can follow the pickup leg.",
    });

  // Drops off once the money is in. Nagging about a payment that has already
  // been recorded trains ops to ignore this panel. Once the door-pickup parcel
  // is at the hub, this is the moment to actually collect, so the copy sharpens.
  if (paymentDeferred && !paymentSettled && !closed)
    items.push(
      pickupIncluded && firstMileArrivedAtHub
        ? {
            tone: "warn",
            icon: Banknote,
            text: "The parcel has arrived at the hub. Collect the pay-on-arrival amount now, then record it below.",
          }
        : {
            tone: "warn",
            icon: Banknote,
            text: "Pay on arrival. Collect payment when the parcel reaches the hub, then record it below.",
          },
    );

  if (!shipmentType)
    items.push({
      tone: "warn",
      icon: ShieldCheck,
      text: "Shipment type is not set. Confirm it before processing.",
    });
  else if (shipmentType === "CSB4" && totalDeclared >= CSB4_MAX_VALUE)
    items.push({
      tone: "danger",
      icon: ShieldCheck,
      text: `Declared value ${fmtMoney(totalDeclared, currency)} is at or above the ${fmtMoney(CSB4_MAX_VALUE)} CSB-IV limit. Rebook as CSB-V or Commercial.`,
    });

  if (!selectedVendorId && !closed)
    items.push({
      tone: "warn",
      icon: Truck,
      text: "No carrier or service has been selected yet.",
    });

  const awbRelevant =
    status === "IN_TRANSIT" ||
    status === "OUT_FOR_DELIVERY" ||
    status === "CUSTOMS_HOLD" ||
    status === "DELIVERED";
  if (awbRelevant && !hasAwb)
    items.push({
      tone: "warn",
      icon: PackageX,
      text: "AWB is not recorded. Add the MAWB / HAWB for tracking.",
    });

  if (missingKycCount > 0)
    items.push({
      tone: "danger",
      icon: FileWarning,
      text: `${missingKycCount} required KYC document${missingKycCount > 1 ? "s are" : " is"} missing from the vault. See KYC documents below.`,
    });

  if (missingHsnCount > 0)
    items.push({
      tone: "warn",
      icon: FileWarning,
      text: `${missingHsnCount} item${missingHsnCount > 1 ? "s have" : " has"} no HSN code. Customs may hold the shipment.`,
    });

  if (totalBoxes > 1)
    items.push({
      tone: "info",
      icon: Layers,
      text: `Multipiece shipment: ${totalBoxes} boxes must be handed over together.`,
    });

  if (items.length === 0) return null;

  const topTone: AttnTone = items.some((i) => i.tone === "danger")
    ? "danger"
    : items.some((i) => i.tone === "warn")
      ? "warn"
      : "info";

  const accentBorder = {
    danger: "border-l-red-500",
    warn: "border-l-amber-400",
    info: "border-l-sky-400",
  }[topTone];

  return (
    <Card className={cn("border-l-4", accentBorder)}>
      <CardHeader className="border-b py-3">
        <div className="flex items-center gap-2">
          <Bell className={cn("h-4 w-4", TONE_TEXT[topTone])} />
          <CardTitle className="text-sm">Needs attention</CardTitle>
          <Badge variant="secondary" className="ml-auto text-xs">
            {items.length} item{items.length > 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <it.icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_TEXT[it.tone])}
              />
              <span className="leading-relaxed text-foreground">{it.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Compliance banner — quick customs / KYC read for ops
// ---------------------------------------------------------------------------

function ComplianceCheck({
  shipmentType,
  totalDeclared,
  currency,
  kycWaived = false,
}: {
  shipmentType: string | null;
  totalDeclared: number;
  currency: string;
  /** Shipment.kycWaivedAtBooking — this booking was let through on a waiver. */
  kycWaived?: boolean;
}) {
  const info = shipmentType ? SHIPMENT_TYPE_INFO[shipmentType] : null;
  // Lists what this booking was actually required to produce. Under a waiver
  // that is Aadhaar alone, so the panel does not tell ops to chase a GST
  // certificate an admin already said was not needed.
  const requiredDocs = shipmentType
    ? KYC_DOC_CONFIGS.filter((c) =>
        kycWaived
          ? (WAIVED_REQUIRED_KYC_KEYS as readonly string[]).includes(c.key)
          : c.requiredFor.includes(
              shipmentType as "CSB4" | "CSB5" | "COMMERCIAL",
            ),
      ).map((c) => c.label)
    : [];

  // CSB-IV is only valid below the value threshold; flag when it is exceeded.
  const csb4Exceeded =
    shipmentType === "CSB4" && totalDeclared >= CSB4_MAX_VALUE;

  let tone: "ok" | "warn" | "danger";
  let message: string;

  if (!shipmentType) {
    tone = "warn";
    message = "Shipment type is not set. Confirm before processing.";
  } else if (csb4Exceeded) {
    tone = "danger";
    message = `Declared value ${fmtMoney(totalDeclared, currency)} is at or above the ${fmtMoney(CSB4_MAX_VALUE)} CSB-IV limit. This should be booked as CSB-V or Commercial.`;
  } else if (shipmentType === "CSB4") {
    tone = "ok";
    message = `Within the ${fmtMoney(CSB4_MAX_VALUE)} CSB-IV limit.`;
  } else {
    tone = "ok";
    message = `${info?.label} shipment. Declared value ${fmtMoney(totalDeclared, currency)}.`;
  }

  const toneStyles = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
    warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    danger:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  }[tone];

  const Icon =
    tone === "ok" ? CheckCircle2 : tone === "warn" ? Info : AlertTriangle;

  return (
    <Card>
      <CardTitleRow
        icon={ShieldCheck}
        title="Customs & compliance"
        right={
          info ? (
            <Badge variant="outline" className="text-xs font-medium">
              {info.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-amber-600">
              Type not set
            </Badge>
          )
        }
      />
      <CardContent className="space-y-4 pt-4">
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed",
            toneStyles,
          )}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{message}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <SectionLabel>Total declared value</SectionLabel>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {fmtMoney(totalDeclared, currency)}
            </p>
          </div>
          <div>
            <SectionLabel>Required KYC</SectionLabel>
            {requiredDocs.length ? (
              <div className="flex flex-wrap gap-1.5">
                {requiredDocs.map((d) => (
                  <Badge
                    key={d}
                    variant="secondary"
                    className="text-[10px] font-normal"
                  >
                    {d}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Set shipment type</p>
            )}
          </div>
        </div>

        {info && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {info.blurb}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getShipment(id);
  const kycDocs = await getPartyKycDocs(s.orgId, s.clientId);

  // Only admins may reverse a recorded payment. Any member may record one, which
  // is why the payment card lives here rather than only on the admin-only wallets
  // screen. See components/booking/arena/PaymentCollectionCard.tsx.
  const { isArenaAdmin } = await getArenaAuth();
  const collection = s.paymentDeferred ? toCollectionRow(s) : null;

  const cfg = STATUS_CONFIG[s.status] ?? {
    label: s.status,
    className: "bg-secondary text-secondary-foreground border-border",
  };

  const totalDeclared = s.packages.reduce(
    (sum, p) => sum + num(p.declaredValue) * p.quantity,
    0,
  );
  const totalBoxes = s.packages.reduce((a, p) => a + p.quantity, 0);
  const totalItemLines = s.packages.reduce(
    (a, p) => a + (p.contents?.length ?? 0),
    0,
  );
  const missingHsnCount = s.packages.reduce(
    (a, p) => a + (p.contents?.filter((c) => !c.hsCode).length ?? 0),
    0,
  );
  const hasAwb = Boolean(s.hawbNumber || s.mawbNumber);
  const isMultipiece = totalBoxes > 1;
  // Door pickup drives all the first-mile UI. Legacy rows created before the
  // first-mile lifecycle existed have a null status, so default it to SCHEDULED
  // at render — pickupIncluded is the real signal, not the presence of a status.
  const hasFirstMile = s.pickupIncluded;
  const firstMileStatus = s.firstMileStatus ?? FirstMileStatus.SCHEDULED;
  const firstMileArrivedAtHub =
    firstMileStatus === FirstMileStatus.ARRIVED_AT_HUB;
  // Judged against what this booking was actually asked for. A waived booking
  // only ever needed an Aadhaar card, so counting it against the full matrix
  // would put a booking ops deliberately let through into the triage banner.
  const missingKycCount = s.shipmentType
    ? requiredKycDocTypes(s.shipmentType, s.kycWaivedAtBooking).filter(
        (dt) => !kycDocs.some((d) => d.docType === dt),
      ).length
    : 0;

  const allStatuses = Object.entries(STATUS_CONFIG).map(([value, c]) => ({
    value: value as ShipmentStatus,
    label: c.label,
  }));

  const charges = s.chargesSnapshot as {
    charges?: { name: string; amount: number; currency: string }[];
  } | null;

  // AWB only matters once the shipment is moving; open that rail panel by
  // default when it is relevant but still blank, so ops fills it in.
  const awbRelevant =
    s.status === "IN_TRANSIT" ||
    s.status === "OUT_FOR_DELIVERY" ||
    s.status === "CUSTOMS_HOLD" ||
    s.status === "DELIVERED";
  const firstMileNeedsAction =
    hasFirstMile && !firstMileArrivedAtHub && !s.firstMileTrackingNumber;
  const route = `${s.pickupAddress.city} → ${s.deliveryAddress.city}${
    s.deliveryAddress.country ? `, ${s.deliveryAddress.country}` : ""
  }`;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-6 py-8">
      {/* ── Back ── */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1.5 text-muted-foreground"
      >
        <Link href="/arena-dashboard/bookings">
          <ArrowLeft className="h-4 w-4" />
          Bookings
        </Link>
      </Button>

      {/* ── Hero: identity + status + at-a-glance facts ── */}
      <Card className={cn("border-l-4", STATUS_ACCENT[s.status])}>
        <CardContent className="space-y-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <CopyButton
                value={s.shipmentNumber}
                label="Shipment number"
                mono
                className="text-2xl font-bold tracking-tight"
              />
              <Badge
                variant="outline"
                className={cn("px-2.5 py-1 text-xs font-semibold", cfg.className)}
              >
                {cfg.label}
              </Badge>
              {s.paymentDeferred && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  <Banknote className="mr-1 h-3 w-3" />
                  Payment on arrival
                </Badge>
              )}
              {isMultipiece && (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-100 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                >
                  <Layers className="mr-1 h-3 w-3" />
                  Multipiece · {totalBoxes} boxes
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{s.org.name}</span>
                {s.client && <span> · for {s.client.companyName}</span>}
              </span>
              {s.bookedAt && <span>· Booked {fmtDatetime(s.bookedAt)}</span>}
              <span>· Created {fmtDatetime(s.createdAt)}</span>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <HeroStat icon={MapPin} label="Route" value={route} />
            <HeroStat
              icon={Scale}
              label="Chargeable wt"
              value={fmtNum(s.totalChargeableWeightKg, " kg")}
            />
            <HeroStat
              icon={Banknote}
              label="Declared value"
              value={fmtMoney(totalDeclared, s.currency)}
            />
            <HeroStat
              icon={Receipt}
              label="Quoted total"
              value={fmtMoney(s.quotedTotal, s.currency)}
              strong
            />
            <HeroStat
              icon={Truck}
              label="Carrier"
              value={s.selectedVendorName ?? "Not selected"}
              warn={!s.selectedVendorId}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Needs attention — the loud triage banner, full width ── */}
      <NeedsAttention
        status={s.status}
        paymentDeferred={s.paymentDeferred}
        paymentSettled={collection ? collection.owed <= 0 : false}
        shipmentType={s.shipmentType}
        totalDeclared={totalDeclared}
        currency={s.currency}
        selectedVendorId={s.selectedVendorId}
        totalBoxes={totalBoxes}
        missingHsnCount={missingHsnCount}
        missingKycCount={missingKycCount}
        hasAwb={hasAwb}
        pickupIncluded={s.pickupIncluded}
        firstMileArrivedAtHub={firstMileArrivedAtHub}
        firstMileHasTracking={Boolean(s.firstMileTrackingNumber)}
      />

      {/* ── Grid: LEFT reviews the shipment, RIGHT operates on it ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── LEFT / MAIN column: review ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Money owed on this booking, if it shipped before paying */}
          {collection && (
            <PaymentCollectionCard
              collection={collection}
              isArenaAdmin={isArenaAdmin}
            />
          )}

          {/* First-mile (door → hub) pickup leg — only when opted in */}
          {hasFirstMile && (
            <FirstMilePickupCard
              status={firstMileStatus}
              hubLabel={s.firstMileHubLabel}
              courierName={s.firstMileVendorName}
              charge={s.firstMileCharge ? num(s.firstMileCharge) : null}
              currency={s.currency}
              trackingNumber={s.firstMileTrackingNumber}
              trackingUrl={s.firstMileTrackingUrl}
              pickupFromLabel={[
                s.pickupAddress.city,
                s.pickupAddress.postalCode,
              ]
                .filter(Boolean)
                .join(" ")}
              scheduledAt={s.firstMilePickupScheduledAt}
              pickedUpAt={s.firstMilePickedUpAt}
              hubArrivedAt={s.firstMileHubArrivedAt}
              updatedAt={s.firstMileStatusUpdatedAt}
              collapsible={firstMileArrivedAtHub}
            />
          )}

          {/* Compliance */}
          <ComplianceCheck
            shipmentType={s.shipmentType}
            totalDeclared={totalDeclared}
            currency={s.currency}
            kycWaived={s.kycWaivedAtBooking}
          />

          {/* KYC documents — view / download right here */}
          <KycDocsCard
            docs={kycDocs}
            shipmentType={s.shipmentType}
            partyLabel={s.client?.companyName ?? s.org.name}
            kycWaived={s.kycWaivedAtBooking}
          />

          {/* Parties */}
          <Card>
            <CardTitleRow icon={Building2} title="Parties" />
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <SectionLabel>Booking org</SectionLabel>
                  <p className="text-sm font-semibold text-foreground">
                    {s.org.name}
                  </p>
                  <InfoRow icon={Hash} label="Slug" value={s.org.slug} />
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={s.org.email}
                    copyLabel="Org email"
                  />
                  <InfoRow
                    icon={Phone}
                    label="Phone"
                    value={s.org.phone}
                    copyLabel="Org phone"
                  />
                  <InfoRow
                    icon={User}
                    label="Contact"
                    value={s.org.contactName}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {s.org.plan}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {num(s.org.markupPercent).toFixed(1)}% markup
                    </Badge>
                  </div>
                </div>

                {s.client ? (
                  <div className="space-y-2">
                    <SectionLabel>Shipping for (client)</SectionLabel>
                    <p className="text-sm font-semibold text-foreground">
                      {s.client.companyName}
                    </p>
                    <InfoRow
                      icon={User}
                      label="Contact"
                      value={s.client.contactName}
                    />
                    <InfoRow
                      icon={Mail}
                      label="Email"
                      value={s.client.email}
                      copyLabel="Client email"
                    />
                    <InfoRow
                      icon={Phone}
                      label="Phone"
                      value={s.client.phone}
                      copyLabel="Client phone"
                    />
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {s.client.companyKind}
                    </Badge>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <SectionLabel>Shipping for</SectionLabel>
                    <p className="text-sm text-muted-foreground">
                      The org is shipping on its own behalf.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Addresses */}
          <Card>
            <CardTitleRow icon={MapPin} title="Addresses" />
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <AddressCard title="Pickup" address={s.pickupAddress} />
                <AddressCard title="Delivery" address={s.deliveryAddress} />
                {s.billingAddress && !s.billingSameAsDelivery && (
                  <AddressCard
                    title="Billing"
                    address={s.billingAddress}
                    flag="Separate billing party"
                  />
                )}
                {s.billingSameAsDelivery && (
                  <div>
                    <SectionLabel>Billing</SectionLabel>
                    <p className="text-xs text-muted-foreground">
                      Same as delivery address.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Packages / packing list */}
          <Card className="overflow-hidden">
            <CardTitleRow
              icon={Package}
              title="Boxes & packing list"
              right={
                <span className="text-xs text-muted-foreground">
                  {totalBoxes} box{totalBoxes !== 1 ? "es" : ""} ·{" "}
                  {totalItemLines} item{totalItemLines !== 1 ? "s" : ""}
                </span>
              }
            />
            <PackageBoxList
              packages={s.packages}
              fallbackCurrency={s.currency}
              variant="ops"
            />
          </Card>

          {/* Service + charges */}
          <Card>
            <CardTitleRow icon={Truck} title="Service & pricing" />
            <CardContent className="pt-4">
              {s.selectedVendorId ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                  <Field label="Carrier" value={s.selectedVendorName} strong />
                  <Field label="Product" value={s.selectedProductName} />
                  <Field
                    label="Quoted total"
                    value={fmtMoney(s.quotedTotal, s.currency)}
                    strong
                  />
                  <Field
                    label="Markup applied"
                    value={
                      s.markupPercentApplied != null
                        ? `${num(s.markupPercentApplied).toFixed(1)}%`
                        : null
                    }
                  />
                  <Field
                    label="Chargeable weight"
                    value={fmtNum(s.totalChargeableWeightKg, " kg")}
                  />
                  <Field label="Cargo type" value={s.declaredCargoType} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No service selected yet.
                </p>
              )}

              {/* Readable charge breakdown */}
              {charges?.charges && charges.charges.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-lg border">
                  <div className="divide-y divide-border/50">
                    {charges.charges.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-4 py-2.5 text-sm"
                      >
                        <span className="text-muted-foreground">{c.name}</span>
                        <span className="font-medium tabular-nums">
                          {fmtMoney(c.amount, c.currency)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 text-sm font-bold">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {fmtMoney(s.quotedTotal, s.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {s.chargesSnapshot && (
                <details className="mt-4">
                  <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
                    View raw charges snapshot
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-[10px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(s.chargesSnapshot, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <DocumentManager shipmentId={s.id} documents={s.documents} />

          {/* Internal notes — ops-only scratchpad */}
          <Card>
            <CardTitleRow icon={StickyNote} title="Internal notes" />
            <CardContent className="pt-4">
              <InternalNotesPanel
                shipmentId={s.id}
                initialNotes={s.internalNotes ?? ""}
              />
            </CardContent>
          </Card>

          {s.walletTransactions.length > 0 && (
            <CollapsibleCard
              icon={Wallet}
              title="Wallet transactions"
              summary={`${s.walletTransactions.length} recent`}
              contentClassName="px-0 pb-0 pt-0"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-5 text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                    <TableHead className="pr-5 text-right text-xs">
                      Balance after
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.walletTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="pl-5 text-xs font-medium">
                        {txn.type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {txn.status.toLowerCase()}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {fmtMoney(txn.amount, txn.currency)}
                      </TableCell>
                      <TableCell className="pr-5 text-right text-xs tabular-nums text-muted-foreground">
                        {fmtMoney(txn.balanceAfter, txn.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleCard>
          )}

          <CollapsibleCard icon={Info} title="Shipment meta">
            <div className="space-y-2.5">
              <InfoRow
                icon={Hash}
                label="ID"
                value={s.id}
                copyLabel="Shipment ID"
              />
              <InfoRow label="Created" value={fmtDatetime(s.createdAt)} />
              <InfoRow label="Booked" value={fmtDatetime(s.bookedAt)} />
              <InfoRow label="Last updated" value={fmtDatetime(s.updatedAt)} />
              <InfoRow label="Currency" value={s.currency} />
              <InfoRow
                label="Documents"
                value={`${s.documents.length} file${s.documents.length !== 1 ? "s" : ""}`}
              />
            </div>
          </CollapsibleCard>
        </div>

        {/* ── RIGHT / rail: operate on the shipment (sticky) ── */}
        <div className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-6">
            {/* Primary action — always open, given the emphasis ring */}
            <Card className="ring-2 ring-primary/20">
              <CardTitleRow
                icon={RefreshCw}
                title="Update status"
                right={
                  <Badge
                    variant="outline"
                    className={cn("text-xs font-medium", cfg.className)}
                  >
                    {cfg.label}
                  </Badge>
                }
              />
              <CardContent className="pt-4">
                <StatusUpdatePanel
                  shipmentId={s.id}
                  currentStatus={s.status}
                  allStatuses={allStatuses}
                />
              </CardContent>
            </Card>

            {/* Carrier / AWB — opens itself when the shipment is moving but blank */}
            <CollapsibleCard
              icon={Truck}
              title="Carrier / AWB"
              summary={hasAwb ? "Recorded" : "Not set"}
              defaultOpen={awbRelevant && !hasAwb}
            >
              <CarrierTrackingPanel
                shipmentId={s.id}
                initial={{
                  mawbNumber: s.mawbNumber,
                  hawbNumber: s.hawbNumber,
                  carrierAirline: s.carrierAirline,
                  vendorTrackingUrl: s.vendorTrackingUrl,
                  awbUpdatedAt: s.awbUpdatedAt,
                }}
              />
            </CollapsibleCard>

            {/* Door pickup (first mile) — book with Shipmozo, then advance the
                leg by hand if the webhook has not moved it. Gated on opt-in;
                legacy rows may have no first-mile status yet. */}
            {s.pickupIncluded && (
              <CollapsibleCard
                icon={Home}
                title="Door pickup (first mile)"
                summary={FIRST_MILE_STAGES[firstMileStatus].label}
                defaultOpen={firstMileNeedsAction}
              >
                <div className="space-y-4">
                  <FirstMilePickupBooking
                    shipmentId={s.id}
                    courierName={s.firstMileVendorName}
                    charge={s.firstMileCharge ? num(s.firstMileCharge) : null}
                    currency={s.currency}
                    pickupFromLabel={[
                      s.pickupAddress.city,
                      s.pickupAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    pickupContact={s.pickupAddress.contactName}
                    hubLabel={s.firstMileHubLabel}
                    weightKg={num(s.totalActualWeightKg)}
                    boxes={totalBoxes}
                    booked={{
                      awb: s.firstMileTrackingNumber,
                      orderId: s.firstMileShipmozoOrderId,
                      bookedAt: s.firstMileBookedAt
                        ? fmtDatetime(s.firstMileBookedAt)
                        : null,
                    }}
                  />
                  <Separator />
                  <FirstMileStatusPanel
                    shipmentId={s.id}
                    initial={{
                      status: firstMileStatus,
                      trackingNumber: s.firstMileTrackingNumber,
                      trackingUrl: s.firstMileTrackingUrl,
                      pickupScheduledAt: s.firstMilePickupScheduledAt,
                      updatedAt: s.firstMileStatusUpdatedAt,
                    }}
                  />
                </div>
              </CollapsibleCard>
            )}

            {/* ── Audit trail — reference beside the status control that writes
                to it. Collapsed by default to keep the rail operational. ── */}
            <CollapsibleCard
              icon={Clock}
              title="Status history"
              summary={
                s.statusHistory.length === 0
                  ? "No events"
                  : `${s.statusHistory.length} event${s.statusHistory.length !== 1 ? "s" : ""}`
              }
            >
              {s.statusHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No events recorded yet.
                </p>
              ) : (
                <ol className="relative ml-2 space-y-4 border-l border-border">
                  {s.statusHistory.map((evt, i) => {
                    const toCfg = STATUS_CONFIG[evt.toStatus];
                    const isCurrent = i === 0;
                    return (
                      <li key={evt.id} className="pl-4">
                        <div
                          className={cn(
                            "absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/40",
                            isCurrent && "bg-foreground",
                          )}
                        />
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {evt.fromStatus && (
                              <>
                                <span className="text-[10px] text-muted-foreground">
                                  {STATUS_CONFIG[evt.fromStatus]?.label ??
                                    evt.fromStatus}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  →
                                </span>
                              </>
                            )}
                            <Badge
                              variant="outline"
                              className={`px-1.5 py-0 text-[10px] ${toCfg?.className ?? ""}`}
                            >
                              {toCfg?.label ?? evt.toStatus}
                            </Badge>
                            {isCurrent && (
                              <span className="rounded-full border border-border bg-foreground/5 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtDatetime(evt.createdAt)} · by{" "}
                            {evt.changedByType.toLowerCase()}
                          </p>
                          {evt.note && (
                            <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs text-foreground">
                              {evt.note}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CollapsibleCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field — label over value, for the service grid
// ---------------------------------------------------------------------------

