import { prisma } from "@/utils/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShipmentStatus } from "@/generated/prisma";

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
import { CopyButton } from "@/components/booking/arena/CopyButton";
import { PackageBoxList } from "@/components/booking/PackageBoxList";
import { KYC_DOC_CONFIGS } from "@/lib/booking/kyc";
import { CSB4_MAX_VALUE } from "@/lib/booking/cargo";
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
  return shipment;
}

// ---------------------------------------------------------------------------
// Shipment-type reference (mirrors the KYC matrix in lib/booking/kyc.ts)
// ---------------------------------------------------------------------------

const SHIPMENT_TYPE_INFO: Record<string, { label: string; blurb: string }> = {
  CSB4: {
    label: "CSB-IV",
    blurb: "Low-value exports under the CSB-IV limit. No IEC required.",
  },
  CSB5: {
    label: "CSB-V",
    blurb: "Commercial exports under IEC. GST and IEC required.",
  },
  COMMERCIAL: {
    label: "Commercial",
    blurb: "Full commercial cargo. Company KYC, IEC and LUT required.",
  },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "toNumber" in (v as object))
    return (v as { toNumber(): number }).toNumber();
  return Number(v) || 0;
}

function fmtDatetime(d: Date | null | undefined) {
  if (!d) return "Not set";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(amount: unknown, currency = "INR") {
  if (amount == null) return "Not set";
  const n = num(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtNum(v: unknown, suffix = "") {
  if (v == null) return "Not set";
  const n = num(v);
  return `${n.toFixed(2)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function CardTitleRow({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <CardHeader className="border-b py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        {right}
      </div>
    </CardHeader>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  copyLabel,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  /** When set, render the value as a copyable field for ops. */
  copyLabel?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {Icon && (
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground">{label}: </span>
        {copyLabel ? (
          <CopyButton
            value={value}
            label={copyLabel}
            className="align-middle text-sm font-medium"
          />
        ) : (
          <span className="font-medium text-foreground">{value}</span>
        )}
      </div>
    </div>
  );
}

function AddressCard({
  title,
  address,
  flag,
}: {
  title: string;
  /** Optional attention chip after the title, e.g. a separate billing party. */
  flag?: string;
  address: {
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
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(" "),
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        {flag && (
          <span className="mb-3 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            {flag}
          </span>
        )}
      </div>
      {address.contactName && (
        <p className="text-sm font-semibold text-foreground">
          {address.contactName}
        </p>
      )}
      {address.contactPhone && (
        <InfoRow icon={Phone} label="Phone" value={address.contactPhone} />
      )}
      <div className="flex items-start gap-2.5 text-sm">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="leading-relaxed text-foreground">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  shipmentType,
  totalDeclared,
  currency,
  selectedVendorId,
  totalBoxes,
  missingHsnCount,
  hasAwb,
}: {
  status: ShipmentStatus;
  paymentDeferred: boolean;
  shipmentType: string | null;
  totalDeclared: number;
  currency: string;
  selectedVendorId: string | null;
  totalBoxes: number;
  missingHsnCount: number;
  hasAwb: boolean;
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

  if (paymentDeferred && !closed)
    items.push({
      tone: "warn",
      icon: Banknote,
      text: "Pay on arrival. Collect payment when the parcel reaches the hub.",
    });

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
          <Badge variant="secondary" className="ml-auto text-[11px]">
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
}: {
  shipmentType: string | null;
  totalDeclared: number;
  currency: string;
}) {
  const info = shipmentType ? SHIPMENT_TYPE_INFO[shipmentType] : null;
  const requiredDocs = shipmentType
    ? KYC_DOC_CONFIGS.filter((c) =>
        c.requiredFor.includes(shipmentType as "CSB4" | "CSB5" | "COMMERCIAL"),
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
            <Badge variant="outline" className="text-[11px] font-medium">
              {info.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] text-amber-600">
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

  const allStatuses = Object.entries(STATUS_CONFIG).map(([value, c]) => ({
    value: value as ShipmentStatus,
    label: c.label,
  }));

  const charges = s.chargesSnapshot as {
    charges?: { name: string; amount: number; currency: string }[];
  } | null;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0">
          <Link href="/arena-dashboard/bookings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton
              value={s.shipmentNumber}
              label="Shipment number"
              mono
              className="text-xl font-bold tracking-tight"
            />
            <Badge
              variant="outline"
              className={`text-xs font-medium ${cfg.className}`}
            >
              {cfg.label}
            </Badge>
            {s.paymentDeferred && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
              >
                <Banknote className="mr-1 h-3 w-3" />
                Payment on arrival
              </Badge>
            )}
            {isMultipiece && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              >
                <Layers className="mr-1 h-3 w-3" />
                Multipiece · {totalBoxes} boxes
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{s.org.name}</span>
              {s.client && <span> · for {s.client.companyName}</span>}
            </span>
            {s.bookedAt && <span>Booked {fmtDatetime(s.bookedAt)}</span>}
            <span>Created {fmtDatetime(s.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── LEFT / MAIN column ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Needs attention — first thing ops sees */}
          <NeedsAttention
            status={s.status}
            paymentDeferred={s.paymentDeferred}
            shipmentType={s.shipmentType}
            totalDeclared={totalDeclared}
            currency={s.currency}
            selectedVendorId={s.selectedVendorId}
            totalBoxes={totalBoxes}
            missingHsnCount={missingHsnCount}
            hasAwb={hasAwb}
          />

          {/* Compliance */}
          <ComplianceCheck
            shipmentType={s.shipmentType}
            totalDeclared={totalDeclared}
            currency={s.currency}
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
                <div className="flex items-center gap-2">
                  {isMultipiece && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      <Layers className="h-3 w-3" />
                      Multipiece
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {totalBoxes} box{totalBoxes !== 1 ? "es" : ""} ·{" "}
                    {totalItemLines} item{totalItemLines !== 1 ? "s" : ""}
                  </span>
                </div>
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

          {/* Wallet transactions */}
          {s.walletTransactions.length > 0 && (
            <Card className="overflow-hidden">
              <CardTitleRow icon={Wallet} title="Wallet transactions" />
              <CardContent className="p-0">
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
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── RIGHT sidebar ── */}
        <div className="space-y-6">
          {/* Actions first — this is where ops spends most of its time */}
          <StatusUpdatePanel
            shipmentId={s.id}
            currentStatus={s.status}
            allStatuses={allStatuses}
          />
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

          {/* Quick contact — pinned for fast follow-up on holds / docs */}
          <Card>
            <CardTitleRow icon={User} title="Quick contact" />
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <SectionLabel>Booking org</SectionLabel>
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
              </div>
              {s.client && (s.client.email || s.client.phone) && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <SectionLabel>Client</SectionLabel>
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Internal notes */}
          <InternalNotesPanel
            shipmentId={s.id}
            initialNotes={s.internalNotes ?? ""}
          />

          {/* Timeline — newest first */}
          <Card>
            <CardTitleRow icon={Clock} title="Status history" />
            <CardContent className="pt-4">
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
            </CardContent>
          </Card>

          {/* Meta */}
          <Card>
            <CardTitleRow icon={Info} title="Shipment meta" />
            <CardContent className="space-y-2.5 pt-4">
              <InfoRow icon={Hash} label="ID" value={s.id} copyLabel="Shipment ID" />
              <InfoRow label="Created" value={fmtDatetime(s.createdAt)} />
              <InfoRow label="Booked" value={fmtDatetime(s.bookedAt)} />
              <InfoRow label="Last updated" value={fmtDatetime(s.updatedAt)} />
              <InfoRow label="Currency" value={s.currency} />
              <InfoRow
                label="Documents"
                value={`${s.documents.length} file${s.documents.length !== 1 ? "s" : ""}`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field — label over value, for the service grid
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | null;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm text-foreground tabular-nums",
          strong && "font-semibold",
        )}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}
