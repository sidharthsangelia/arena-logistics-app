import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ShipmentStatus } from "@/generated/prisma";

import {
  ArrowLeft,
  Package,
  MapPin,
  Truck,
  FileText,
  Clock,
  Building2,
  User,
  Phone,
  Mail,
  Hash,
  Weight,
  Ruler,
  DollarSign,
  StickyNote,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
// Formatters
// ---------------------------------------------------------------------------

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDatetime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(amount: unknown, currency = "INR") {
  if (amount == null) return "—";
  const n =
    typeof amount === "object" && amount !== null && "toNumber" in amount
      ? (amount as { toNumber(): number }).toNumber()
      : Number(amount);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtNum(v: unknown, suffix = "") {
  if (v == null) return "—";
  const n =
    typeof v === "object" && v !== null && "toNumber" in v
      ? (v as { toNumber(): number }).toNumber()
      : Number(v);
  return isNaN(n) ? "—" : `${n.toFixed(2)}${suffix}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {Icon && (
        <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
    </div>
  );
}

function AddressCard({
  title,
  address,
}: {
  title: string;
  address: {
    contactName?: string | null;
    contactPhone?: string | null;
    label?: string | null;
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
      <SectionLabel>{title}</SectionLabel>
      {address.contactName && (
        <p className="text-sm font-semibold text-foreground">
          {address.contactName}
        </p>
      )}
      {address.contactPhone && (
        <InfoRow icon={Phone} label="Phone" value={address.contactPhone} />
      )}
      <div className="flex items-start gap-2.5 text-sm">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-foreground leading-relaxed">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      </div>
    </div>
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
    (sum, p) =>
      sum + (p.declaredValue ? Number(p.declaredValue) : 0) * p.quantity,
    0,
  );

  const allStatuses = Object.entries(STATUS_CONFIG).map(([value, c]) => ({
    value: value as ShipmentStatus,
    label: c.label,
  }));

  return (
    <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
      {/* ── Breadcrumb + header ── */}
      <div className="flex items-start gap-4">
        <Button asChild variant="ghost" size="icon" className="shrink-0 mt-0.5">
          <Link href="/arena-dashboard/bookings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold font-mono text-foreground tracking-tight">
              {s.shipmentNumber}
            </h1>
            <Badge
              variant="outline"
              className={`text-xs font-medium ${cfg.className}`}
            >
              {cfg.label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{s.org.name}</span>
              {s.client && <span> · for {s.client.companyName}</span>}
            </span>
            {s.bookedAt && <span>Booked {fmtDatetime(s.bookedAt)}</span>}
            <span>Created {fmtDatetime(s.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── LEFT / MAIN column (2 cols) ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Org & client info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Organisation</CardTitle>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <SectionLabel>Tenant org</SectionLabel>
                  <p className="text-sm font-semibold text-foreground">
                    {s.org.name}
                  </p>
                  <InfoRow icon={Hash} label="Slug" value={s.org.slug} />
                  <InfoRow icon={Mail} label="Email" value={s.org.email} />
                  <InfoRow icon={Phone} label="Phone" value={s.org.phone} />
                  <InfoRow
                    icon={User}
                    label="Contact"
                    value={s.org.contactName}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {s.org.plan}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {Number(s.org.markupPercent).toFixed(1)}% markup
                    </Badge>
                  </div>
                </div>

                {s.client && (
                  <div className="space-y-2">
                    <SectionLabel>Client (shipment for)</SectionLabel>
                    <p className="text-sm font-semibold text-foreground">
                      {s.client.companyName}
                    </p>
                    <InfoRow
                      icon={User}
                      label="Contact"
                      value={s.client.contactName}
                    />
                    <InfoRow icon={Mail} label="Email" value={s.client.email} />
                    <InfoRow
                      icon={Phone}
                      label="Phone"
                      value={s.client.phone}
                    />
                    <Badge variant="outline" className="text-[10px] mt-1">
                      {s.client.companyKind}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Addresses */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Addresses</CardTitle>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <AddressCard
                  title="Pickup (Consignor)"
                  address={s.pickupAddress}
                />
                <AddressCard
                  title="Delivery (Consignee)"
                  address={s.deliveryAddress}
                />
                {s.billingAddress && !s.billingSameAsDelivery && (
                  <AddressCard title="Billing" address={s.billingAddress} />
                )}
                {s.billingSameAsDelivery && (
                  <div>
                    <SectionLabel>Billing</SectionLabel>
                    <p className="text-xs text-muted-foreground">
                      Same as delivery address
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Packages */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">
                    Packages
                    <span className="ml-2 text-muted-foreground font-normal">
                      ({s.packages.length})
                    </span>
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Total weight:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {fmtNum(s.totalActualWeightKg, " kg")}
                    </span>
                  </span>
                  <span>
                    Declared:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {fmtMoney(totalDeclared)}
                    </span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs pl-5">Description</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Weight</TableHead>
                    <TableHead className="text-xs text-right">
                      L × W × H
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      HS Code
                    </TableHead>
                    <TableHead className="text-xs text-right pr-5">
                      Declared Value
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.packages.map((pkg, i) => (
                    <TableRow
                      key={pkg.id}
                      className={i % 2 !== 0 ? "bg-muted/10" : ""}
                    >
                      <TableCell className="pl-5 text-sm font-medium">
                        {pkg.description}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {pkg.quantity}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmtNum(pkg.weightKg, " kg")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {fmtNum(pkg.lengthCm)} × {fmtNum(pkg.widthCm)} ×{" "}
                        {fmtNum(pkg.heightCm)} cm
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {pkg.hsCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums pr-5">
                        {pkg.declaredValue
                          ? fmtMoney(
                              pkg.declaredValue,
                              pkg.declaredCurrency ?? "INR",
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Service / carrier */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Selected Service</CardTitle>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {s.selectedVendorId ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Carrier
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {s.selectedVendorName ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Product
                    </p>
                    <p className="text-sm text-foreground">
                      {s.selectedProductName ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Quoted Total
                    </p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {fmtMoney(s.quotedTotal, s.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Markup Applied
                    </p>
                    <p className="text-sm text-foreground tabular-nums">
                      {s.markupPercentApplied
                        ? `${Number(s.markupPercentApplied).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Chargeable Weight
                    </p>
                    <p className="text-sm text-foreground tabular-nums">
                      {fmtNum(s.totalChargeableWeightKg, " kg")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                      Cargo Type
                    </p>
                    <p className="text-sm text-foreground">
                      {s.declaredCargoType ?? "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No service selected yet.
                </p>
              )}

              {s.chargesSnapshot && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                    View charges snapshot
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
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">Wallet Transactions</CardTitle>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs pl-5">Type</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">
                        Amount
                      </TableHead>
                      <TableHead className="text-xs text-right pr-5">
                        Balance After
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.walletTransactions.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="pl-5 text-xs font-medium">
                          {txn.type}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {txn.status}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {fmtMoney(txn.amount, txn.currency)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums pr-5 text-muted-foreground">
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

        {/* ── RIGHT sidebar (1 col) ── */}
        <div className="space-y-6">
          {/* Status update */}
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
          {/* Internal notes */}
          <InternalNotesPanel
            shipmentId={s.id}
            initialNotes={s.internalNotes ?? ""}
          />

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">Status History</CardTitle>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {s.statusHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No history yet.</p>
              ) : (
                <ol className="relative ml-2 border-l border-border space-y-4">
                  {s.statusHistory.map((evt) => {
                    const toCfg = STATUS_CONFIG[evt.toStatus];
                    return (
                      <li key={evt.id} className="pl-4">
                        <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/40" />
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                              className={`text-[10px] py-0 px-1.5 ${toCfg?.className ?? ""}`}
                            >
                              {toCfg?.label ?? evt.toStatus}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtDatetime(evt.createdAt)} · {evt.changedByType}
                          </p>
                          {evt.note && (
                            <p className="text-xs text-foreground bg-muted/50 rounded px-2 py-1 mt-1">
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

          {/* Quick meta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Shipment Meta</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-2.5">
              <InfoRow icon={Hash} label="ID" value={s.id} />
              <InfoRow label="Created" value={fmtDatetime(s.createdAt)} />
              <InfoRow label="Booked" value={fmtDatetime(s.bookedAt)} />
              <InfoRow label="Last updated" value={fmtDatetime(s.updatedAt)} />
              <InfoRow label="Currency" value={s.currency} />
              <InfoRow
                label="Docs"
                value={`${s.documents.length} file${s.documents.length !== 1 ? "s" : ""}`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
