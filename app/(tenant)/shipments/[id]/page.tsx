import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { ShipmentStatus } from "@/generated/prisma";

import {
  ArrowLeft, ArrowRight, Clock, ExternalLink,
  FileCheck2, FileText, MapPin, Package, Scale,
  Truck, User, Wallet, Building2, MapPinned, Mail, Phone,
} from "lucide-react";
import Link from "next/link";

import { Badge }     from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn }        from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async function getShipment(id: string) {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/sign-in");

  const org = await prisma.org.findUnique({
    where:  { clerkOrgId },
    select: { id: true, name: true },
  });
  if (!org) redirect("/sign-in");

  const shipment = await prisma.shipment.findFirst({
    where:  { id, orgId: org.id },
    select: {
      id: true, shipmentNumber: true, status: true,
      createdAt: true, updatedAt: true, bookedAt: true,
      internalNotes: true, billingSameAsDelivery: true,
      quotedTotal: true, currency: true,
      markupPercentApplied: true, chargesSnapshot: true,
      totalActualWeightKg: true, totalChargeableWeightKg: true,
      selectedVendorId: true, selectedVendorName: true, selectedProductName: true,
      client: {
        select: {
          id: true, companyName: true, contactName: true, email: true, phone: true,
        },
      },
      pickupAddress: {
        select: {
          contactName: true, contactPhone: true, line1: true, line2: true,
          city: true, state: true, country: true, postalCode: true,
        },
      },
      deliveryAddress: {
        select: {
          contactName: true, contactPhone: true, line1: true, line2: true,
          city: true, state: true, country: true, postalCode: true,
        },
      },
      billingAddress: {
        select: {
          contactName: true, line1: true, city: true, state: true,
          country: true, postalCode: true,
        },
      },
      packages: {
        select: {
          id: true, description: true, quantity: true,
          lengthCm: true, widthCm: true, heightCm: true,
          weightKg: true, declaredValue: true, declaredCurrency: true, hsCode: true,
        },
        orderBy: { createdAt: "asc" },
      },
      documents: {
        select: {
          id: true, docType: true, label: true, fileUrl: true,
          fileName: true, fileSize: true, mimeType: true, uploadedAt: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
      statusHistory: {
        select: {
          id: true, fromStatus: true, toStatus: true, note: true,
          changedByType: true, createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      walletTransactions: {
        select: {
          id: true, type: true, status: true, amount: true,
          currency: true, createdAt: true, notes: true,
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
// Status config — shadcn neutral palette only
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ShipmentStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT:             { label: "Draft",            variant: "secondary"   },
  PENDING_PAYMENT:   { label: "Pending payment",  variant: "outline"     },
  BOOKED:            { label: "Booked",           variant: "default"     },
  PROCESSING:        { label: "Processing",       variant: "default"     },
  DOCUMENTS_PENDING: { label: "Docs pending",     variant: "outline"     },
  IN_TRANSIT:        { label: "In transit",       variant: "default"     },
  CUSTOMS_HOLD:      { label: "Customs hold",     variant: "destructive" },
  OUT_FOR_DELIVERY:  { label: "Out for delivery", variant: "default"     },
  DELIVERED:         { label: "Delivered",        variant: "secondary"   },
  CANCELLED:         { label: "Cancelled",        variant: "secondary"   },
  ON_HOLD:           { label: "On hold",          variant: "outline"     },
};

// Dot colour for timeline — only foreground shades, no brand colours
const TIMELINE_DOT: Record<ShipmentStatus, string> = {
  DRAFT:             "bg-muted-foreground/30",
  PENDING_PAYMENT:   "bg-muted-foreground/50",
  BOOKED:            "bg-muted-foreground/70",
  PROCESSING:        "bg-muted-foreground/70",
  DOCUMENTS_PENDING: "bg-muted-foreground/50",
  IN_TRANSIT:        "bg-foreground",
  CUSTOMS_HOLD:      "bg-destructive",
  OUT_FOR_DELIVERY:  "bg-foreground",
  DELIVERED:         "bg-foreground",
  CANCELLED:         "bg-muted-foreground/30",
  ON_HOLD:           "bg-muted-foreground/50",
};

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
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);
}

function fmtKg(v: unknown): string {
  const n = dec(v);
  return n ? `${n.toFixed(2)} kg` : "—";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtBytes(n: number): string {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

/** Uppercase micro-label */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

/** Horizontal key / value row with a bottom border */
function KVRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b last:border-0 border-border/50">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-xs text-right text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

/** Section card with a titled header and optional right-side badge */
function Section({
  icon: Icon,
  title,
  meta,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </div>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {children}
    </Card>
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
  const geo = [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ");
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <Label>{role === "pickup" ? "Sender · Consignor" : "Receiver · Consignee"}</Label>
      <div className="space-y-0.5 text-sm">
        {addr.contactName && (
          <p className="font-semibold text-foreground">{addr.contactName}</p>
        )}
        {addr.contactPhone && (
          <p className="text-muted-foreground text-xs">{addr.contactPhone}</p>
        )}
        <div className="pt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>{addr.line1}</p>
          {addr.line2 && <p>{addr.line2}</p>}
          <p>{geo}</p>
          <p>{addr.country}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ShipmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { shipment: s } = await getShipment(params.id);
  const statusCfg  = STATUS_CONFIG[s.status];
  const charges    = s.chargesSnapshot as Record<string, unknown> | null;
  const totalPieces = s.packages.reduce((a, p) => a + p.quantity, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-5">

        {/* ── Back nav ─────────────────────────────────────────────────────── */}
        <Link
          href="/shipments"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          All shipments
        </Link>

        {/* ── Header card ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-6 space-y-5">

            {/* Identity row */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-mono text-xl font-bold tracking-tight">
                    {s.shipmentNumber}
                  </h1>
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Booked {s.bookedAt ? fmtDate(s.bookedAt) : fmtDate(s.createdAt)}
                  {s.selectedVendorName && ` · ${s.selectedVendorName}`}
                  {s.selectedProductName && ` ${s.selectedProductName}`}
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-2xl font-bold tabular-nums">
                  {fmt(s.quotedTotal, s.currency)}
                </p>
                <p className="text-xs text-muted-foreground">Total quoted</p>
              </div>
            </div>

            {/* Route strip */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border px-5 py-4">
              <div>
                <Label>From</Label>
                <p className="mt-1 text-base font-semibold">{s.pickupAddress.city}</p>
                <p className="text-xs text-muted-foreground">
                  {s.pickupAddress.country}
                  {s.pickupAddress.contactName && ` · ${s.pickupAddress.contactName}`}
                </p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground/40">
                <div className="h-px w-8 bg-border" />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <div className="h-px w-8 bg-border" />
              </div>
              <div className="text-right">
                <Label>To</Label>
                <p className="mt-1 text-base font-semibold">{s.deliveryAddress.city}</p>
                <p className="text-xs text-muted-foreground">
                  {s.deliveryAddress.country}
                  {s.deliveryAddress.contactName && ` · ${s.deliveryAddress.contactName}`}
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Packages",
                  value: `${s.packages.length} item${s.packages.length !== 1 ? "s" : ""}`,
                  sub: `${totalPieces} pieces`,
                },
                {
                  label: "Actual weight",
                  value: fmtKg(s.totalActualWeightKg),
                  sub: `Chargeable ${fmtKg(s.totalChargeableWeightKg)}`,
                },
                {
                  label: "Carrier",
                  value: s.selectedVendorName ?? "—",
                  sub: s.selectedProductName ?? undefined,
                },
                {
                  label: "Client",
                  value: s.client?.companyName ?? "Own org",
                  sub: s.client?.contactName ?? undefined,
                },
              ].map(({ label, value, sub }) => (
                <div key={label} className="rounded-lg border p-3.5">
                  <Label>{label}</Label>
                  <p className="mt-1.5 text-sm font-semibold leading-tight">{value}</p>
                  {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1fr_264px] xl:items-start">

          {/* ── Left: main sections ─────────────────────────────────────────── */}
          <div className="space-y-5 min-w-0">

            {/* Route detail */}
            <Section icon={MapPin} title="Route">
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <AddressBlock role="pickup"   addr={s.pickupAddress} />
                <AddressBlock role="delivery" addr={s.deliveryAddress} />
              </div>

              {!s.billingSameAsDelivery && s.billingAddress && (
                <div className="border-t px-4 py-3">
                  <Label>Billing address</Label>
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    {s.billingAddress.contactName && (
                      <p className="font-medium text-foreground">{s.billingAddress.contactName}</p>
                    )}
                    <p>{s.billingAddress.line1}</p>
                    <p>
                      {[s.billingAddress.city, s.billingAddress.state, s.billingAddress.postalCode]
                        .filter(Boolean).join(", ")}
                    </p>
                    <p>{s.billingAddress.country}</p>
                  </div>
                </div>
              )}
            </Section>

            {/* Pricing */}
            <Section icon={Truck} title="Pricing">
              <div className="px-4 py-3 space-y-0">
                <KVRow label="Service"  value={[s.selectedVendorName, s.selectedProductName].filter(Boolean).join(" — ")} />
                {s.markupPercentApplied && (
                  <KVRow label="Markup" value={`${dec(s.markupPercentApplied).toFixed(1)}%`} />
                )}
              </div>

              {charges && Array.isArray((charges as any).charges) && (
                <>
                  <Separator />
                  <div className="divide-y divide-border/50">
                    {((charges as any).charges as { name: string; amount: number; currency: string }[]).map(
                      (c, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-muted-foreground">{c.name}</span>
                          <span className="tabular-nums">{fmt(c.amount, c.currency)}</span>
                        </div>
                      ),
                    )}
                    <div className="flex items-center justify-between bg-muted/30 px-4 py-2.5 text-sm font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{fmt(s.quotedTotal, s.currency)}</span>
                    </div>
                  </div>
                </>
              )}
            </Section>

            {/* Packages */}
            <Section
              icon={Package}
              title="Packages"
              meta={`${s.packages.length} items · ${totalPieces} pieces`}
            >
              {s.packages.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                  No packages recorded.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left">
                          {["#", "Description", "Qty", "Dimensions", "Weight", "Value", "HSN"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {s.packages.map((pkg, i) => (
                          <tr key={pkg.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">
                              {pkg.description}
                            </td>
                            <td className="px-4 py-3 text-center">{pkg.quantity}</td>
                            <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                              {dec(pkg.lengthCm)}×{dec(pkg.widthCm)}×{dec(pkg.heightCm)} cm
                            </td>
                            <td className="px-4 py-3 tabular-nums">{fmtKg(pkg.weightKg)}</td>
                            <td className="px-4 py-3 tabular-nums">
                              {pkg.declaredValue
                                ? fmt(pkg.declaredValue, pkg.declaredCurrency ?? "INR")
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {pkg.hsCode ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-5 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{totalPieces}</span> pieces
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">{fmtKg(s.totalActualWeightKg)}</span> actual
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">{fmtKg(s.totalChargeableWeightKg)}</span> chargeable
                    </span>
                  </div>
                </>
              )}
            </Section>

            {/* Documents */}
            <Section
              icon={FileText}
              title="Documents"
              meta={s.documents.length > 0 ? `${s.documents.length} files` : undefined}
            >
              {s.documents.length === 0 ? (
                <p className="px-4 py-8 text-sm text-center text-muted-foreground">
                  No documents uploaded yet.
                </p>
              ) : (
                <div className="divide-y divide-border/40">
                  {s.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                        <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{doc.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.fileName} · {fmtBytes(doc.fileSize)} · {fmtDate(doc.uploadedAt)}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    </a>
                  ))}
                </div>
              )}
            </Section>

            {/* Status history */}
            <Section icon={Clock} title="Status history">
              {s.statusHistory.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                  No status events recorded.
                </p>
              ) : (
                <div className="px-4 py-4">
                  <ol className="relative ml-1">
                    {/* Vertical guide line */}
                    <div className="absolute left-[3px] top-1.5 bottom-4 w-px bg-border" />

                    {s.statusHistory.map((evt, i) => {
                      const cfg     = STATUS_CONFIG[evt.toStatus];
                      const dot     = TIMELINE_DOT[evt.toStatus] ?? "bg-muted-foreground/30";
                      const isLast  = i === s.statusHistory.length - 1;

                      return (
                        <li key={evt.id} className="relative pl-6 pb-5 last:pb-0">
                          <span
                            className={cn(
                              "absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full ring-2 ring-background",
                              dot,
                            )}
                          />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={cfg?.variant ?? "secondary"} className="text-xs">
                                {cfg?.label ?? evt.toStatus}
                              </Badge>
                              {isLast && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  Current
                                </span>
                              )}
                            </div>
                            {evt.fromStatus && (
                              <p className="text-xs text-muted-foreground">
                                from {STATUS_CONFIG[evt.fromStatus]?.label ?? evt.fromStatus}
                              </p>
                            )}
                            {evt.note && (
                              <p className="rounded bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground inline-block">
                                {evt.note}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground/60">
                              {fmtDateTime(evt.createdAt)} · {evt.changedByType}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </Section>

            {/* Wallet transactions */}
            {s.walletTransactions.length > 0 && (
              <Section icon={Wallet} title="Wallet transactions">
                <div className="divide-y divide-border/40">
                  {s.walletTransactions.map((txn) => {
                    const isCredit = txn.type === "TOP_UP" || txn.type === "REFUND";
                    return (
                      <div key={txn.id} className="flex items-center justify-between px-4 py-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-foreground">
                            {txn.type.replace(/_/g, " ")}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{fmtDateTime(txn.createdAt)}</p>
                          {txn.notes && (
                            <p className="text-[10px] text-muted-foreground/70">{txn.notes}</p>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <p className={cn(
                            "text-sm font-semibold tabular-nums",
                            isCredit ? "text-foreground" : "text-foreground",
                          )}>
                            {isCredit ? "+" : "−"}{fmt(txn.amount, txn.currency)}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {txn.status.toLowerCase()}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>

          {/* ── Right: sidebar ────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Booking details */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/30">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Booking
                </p>
              </div>

              {/* Client */}
              {s.client ? (
                <div className="p-4 border-b">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-[10px] font-bold text-muted-foreground">
                      {s.client.companyName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{s.client.companyName}</p>
                      {s.client.contactName && (
                        <p className="text-xs text-muted-foreground">{s.client.contactName}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
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
                  <p className="text-xs text-muted-foreground">Booked for own organisation.</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="px-4 py-1">
                <KVRow label="Created"  value={fmtDateTime(s.createdAt)} />
                <KVRow label="Booked"   value={s.bookedAt ? fmtDateTime(s.bookedAt) : null} />
                <KVRow label="Updated"  value={fmtDateTime(s.updatedAt)} />
              </div>

              {/* Internal notes */}
              {s.internalNotes && (
                <div className="border-t px-4 py-3 space-y-1.5">
                  <Label>Internal notes</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {s.internalNotes}
                  </p>
                </div>
              )}
            </Card>

            {/* Shipment ID */}
            <Card>
              <CardContent className="px-4 py-3 space-y-1">
                <Label>Shipment ID</Label>
                <p className="font-mono text-[10px] text-muted-foreground break-all">
                  {s.id}
                </p>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}