import { prisma } from "@/utils/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PartyType, ShipmentMode, ShipmentStatus } from "@/generated/prisma";

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
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Scale,
  Receipt,
  StickyNote,
  FileWarning,
  Wallet,
  History,
  ReceiptText,
  Bell,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { StatusUpdatePanel } from "@/components/booking/arena/StatusUpdatePanel";
import { DomesticCourierPanel } from "@/components/booking/arena/DomesticCourierPanel";
import { InternalNotesPanel } from "@/components/booking/arena/InternalNotesPanel";
import { DocumentManager } from "@/components/booking/arena/DocumentManager";
import { KycDocsCard } from "@/components/booking/arena/KycDocsCard";
import { PaymentCollectionCard } from "@/components/booking/arena/PaymentCollectionCard";
import { CopyButton } from "@/components/booking/CopyButton";
import { PackageBoxList } from "@/components/booking/PackageBoxList";
import {
  num,
  fmtDatetime,
  fmtMoney,
  fmtNum,
  STATUS_ACCENT,
  CardTitleRow,
  HeroStat,
  CollapsibleCard,
  CollapsibleSection,
  SectionBlock,
  InfoRow,
  AddressCard,
  Field,
} from "@/components/booking/arena/DetailPrimitives";
import { toCollectionRow } from "@/lib/wallet/adminLedger";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  DOMESTIC_DOC_CONFIGS,
  EWAY_BILL_THRESHOLD,
  isCompanyParty,
} from "@/lib/booking/domesticDocs";
import {
  KYC_KEY_TO_DOC_TYPE,
  requiredDomesticKycKeys,
} from "@/lib/booking/kyc";

// ---------------------------------------------------------------------------
// Domestic booking detail — the ops view of one India → India courier shipment.
//
// A deliberate twin of /arena-dashboard/bookings/[id] rather than that page
// with conditionals. Almost everything the export page puts in front of ops has
// no meaning here: there is no customs category, no MAWB or HAWB, no airline,
// no door-to-hub first-mile leg, and no export KYC matrix. Rendering all of
// that as empty panels would make ops scan past most of the page to reach the
// three things that DO matter on a domestic parcel — the courier, the GST
// paperwork, and any cash collection.
//
// The two pages share their look through DetailPrimitives, and their rows
// through one Shipment table. It is only the view that is split.
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
        include: { contents: { orderBy: { createdAt: "asc" } } },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
      paymentCollections: { orderBy: { collectedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
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

  // An international shipment opened at a domestic URL is sent to the page that
  // can actually show it, rather than rendered here with half its panels blank.
  if (shipment.mode !== ShipmentMode.DOMESTIC) {
    redirect(`/arena-dashboard/bookings/${shipment.id}`);
  }

  return shipment;
}

/** Newest KYC document per type from the relevant party's vault. */
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
// Needs attention — the one block ops must not skim past.
//
// Domestic-specific by design. Every signal here is something a person has to
// act on, ranked worst first, and the block disappears entirely when the
// shipment is clean rather than reassuring anyone with a row of green ticks.
// ---------------------------------------------------------------------------

type AttnTone = "danger" | "warn" | "info";

const TONE_TEXT: Record<AttnTone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

function NeedsAttention({
  items,
}: {
  items: {
    tone: AttnTone;
    icon: React.ComponentType<{ className?: string }>;
    text: string;
  }[];
}) {
  if (items.length === 0) return null;

  const order: Record<AttnTone, number> = { danger: 0, warn: 1, info: 2 };
  const sorted = [...items].sort((a, b) => order[a.tone] - order[b.tone]);
  const worst = sorted[0].tone;

  // The only boxed block on the page, and deliberately so: everything else is
  // flat, which is exactly what makes this one read as an alarm.
  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 bg-muted/20 px-5 py-4",
        worst === "danger"
          ? "border-l-red-500"
          : worst === "warn"
            ? "border-l-amber-400"
            : "border-l-sky-400",
      )}
    >
      <p className="flex items-center gap-2">
        <Bell className={cn("h-4 w-4 shrink-0", TONE_TEXT[worst])} />
        <span className="text-sm font-semibold text-foreground">
          Needs attention
        </span>
        <span className="text-xs text-muted-foreground">
          {sorted.length} item{sorted.length > 1 ? "s" : ""}
        </span>
      </p>
      <ul className="mt-3 space-y-2">
        {sorted.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_TEXT[item.tone])}
              />
              <span className="leading-relaxed text-foreground">
                {item.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DomesticBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await getShipment(id);
  const kycDocs = await getPartyKycDocs(s.orgId, s.clientId);

  // Only admins may reverse a recorded payment; any member may record one.
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

  // Who the sender was, judged the same way the booking flow judged it: by
  // whether they gave a company name. Read off the persisted pickup Address
  // rather than stored as its own boolean, so what ops sees here is derived
  // from the very address on screen and cannot disagree with it.
  const senderIsCompany = isCompanyParty(s.pickupAddress);

  // What paperwork this consignment should be carrying. Derived here rather
  // than trusted, for the same reason the booking action re-derives it.
  const attachedDocTypes = new Set(s.documents.map((d) => d.docType));
  const missingDocs = DOMESTIC_DOC_CONFIGS.filter((config) => {
    if (attachedDocTypes.has(config.docType)) return false;
    if (config.key === "taxInvoice") return senderIsCompany;
    if (config.key === "eWayBill") return totalDeclared > EWAY_BILL_THRESHOLD;
    return false;
  });

  const requiredKycKeys = requiredDomesticKycKeys(senderIsCompany);
  const missingKycCount = requiredKycKeys.filter(
    (key) => !kycDocs.some((d) => d.docType === KYC_KEY_TO_DOC_TYPE[key]),
  ).length;

  const pushedToCourier = Boolean(s.domesticCourierOrderId);
  const hasAwb = Boolean(s.domesticAwbNumber);
  // The label the booking job filed, if it got that far. Found by id rather
  // than by docType because ops can upload an airway bill of their own and the
  // two must not be confused for one another.
  const labelDocument = s.domesticLabelDocumentId
    ? (s.documents.find((d) => d.id === s.domesticLabelDocumentId) ?? null)
    : null;
  // Arena's own rendering of the same waybill, filed beside the courier's.
  const arenaLabelDocument = s.arenaLabelDocumentId
    ? (s.documents.find((d) => d.id === s.arenaLabelDocumentId) ?? null)
    : null;

  const allStatuses = Object.entries(STATUS_CONFIG).map(([value, c]) => ({
    value: value as ShipmentStatus,
    label: c.label,
  }));

  const charges = s.chargesSnapshot as {
    charges?: { name: string; amount: number; currency: string }[];
  } | null;

  const route = `${s.pickupAddress.city} ${s.pickupAddress.postalCode} → ${s.deliveryAddress.city} ${s.deliveryAddress.postalCode}`;

  const isOpen =
    s.status !== ShipmentStatus.DELIVERED &&
    s.status !== ShipmentStatus.CANCELLED;

  const attention: {
    tone: AttnTone;
    icon: React.ComponentType<{ className?: string }>;
    text: string;
  }[] = [];

  if (s.status === ShipmentStatus.ON_HOLD) {
    attention.push({
      tone: "danger",
      icon: AlertTriangle,
      text: "Shipment is on hold.",
    });
  }
  if (missingDocs.length > 0) {
    attention.push({
      tone: "danger",
      icon: FileWarning,
      text: `Missing ${missingDocs.map((d) => d.label.toLowerCase()).join(" and ")}. ${
        missingDocs.some((d) => d.key === "eWayBill")
          ? `The declared value is over ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}, so the parcel cannot legally move without one.`
          : "The sender is a company, so a GST invoice should be on file."
      }`,
    });
  }
  if (s.paymentDeferred && collection && collection.owed > 0) {
    attention.push({
      tone: "warn",
      icon: Wallet,
      text: `${fmtMoney(collection.owed, s.currency)} still to collect from the customer.`,
    });
  }
  // The courier order places itself when the booking is paid for, so the only
  // thing worth flagging is when that did not happen. A booking still in flight
  // is normal for a minute and says so quietly in the courier panel instead.
  if (isOpen && s.domesticCourierStatus === "FAILED") {
    attention.push({
      tone: "danger",
      icon: Truck,
      text: `The courier would not take this booking${
        s.domesticCourierError ? `: ${s.domesticCourierError}` : "."
      } The customer has paid and holds no waybill.`,
    });
  }
  if (isOpen && s.domesticCourierStatus === "CANCELLED") {
    attention.push({
      tone: "warn",
      icon: Truck,
      text: "The courier order was cancelled. The shipment itself is still open.",
    });
  }
  if (
    isOpen &&
    pushedToCourier &&
    !hasAwb &&
    s.domesticCourierStatus !== "FAILED"
  ) {
    attention.push({
      tone: "info",
      icon: Truck,
      text: "Order placed with the courier, no AWB back yet.",
    });
  }
  if (missingKycCount > 0) {
    attention.push({
      tone: "warn",
      icon: FileWarning,
      text: "The sender is an individual and no Aadhaar is on file for them.",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      {/* ── Back ── */}
      <Link
        href="/arena-dashboard/domestic-bookings"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Domestic bookings
      </Link>

      {/* ── Hero. No card — the status colour stays as the accent rule down the
          left, which is the part ops reads from across the room. ── */}
      <header className={cn("border-l-4 pl-5", STATUS_ACCENT[s.status])}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CopyButton
            value={s.shipmentNumber}
            label="Shipment number"
            mono
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          />
          <Badge
            variant="outline"
            className={cn("px-2.5 py-1 text-xs font-semibold", cfg.className)}
          >
            {cfg.label}
          </Badge>
          {/* COD and deferred payment change what has to happen at handover, so
              they stay as chips rather than sinking into a line of prose. */}
          {s.codEnabled && (
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[11px]">
              <Banknote className="h-3 w-3" />
              COD {fmtMoney(s.codAmount, "INR")}
            </Badge>
          )}
          {s.paymentDeferred && (
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[11px]">
              <Wallet className="h-3 w-3" />
              Payment deferred
            </Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Domestic</span> ·{" "}
          {route}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-3 lg:grid-cols-5">
          <HeroStat icon={Building2} label="Booked by" value={s.org.name} />
          <HeroStat
            icon={Truck}
            label="Courier"
            value={s.selectedProductName ?? "Not selected"}
            warn={!s.selectedProductName}
          />
          <HeroStat
            icon={Layers}
            label="Boxes"
            value={`${totalBoxes} (${totalItemLines} item${totalItemLines === 1 ? "" : "s"})`}
          />
          <HeroStat
            icon={Scale}
            label="Actual weight"
            value={fmtNum(s.totalActualWeightKg, " kg")}
          />
          <HeroStat
            icon={Receipt}
            label="Freight charged"
            value={fmtMoney(s.quotedTotal, s.currency)}
            strong
          />
        </div>
      </header>

      <NeedsAttention items={attention} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Main column: review. Flat sections — ops is reading here, so
            nothing is boxed except what needs acting on. ── */}
        <div className="min-w-0 space-y-8">
          {/* Addresses */}
          <SectionBlock icon={MapPin} title="Addresses">
            <div className="grid gap-8 sm:grid-cols-2">
              <AddressCard title="Pickup from" address={s.pickupAddress} />
              <AddressCard title="Deliver to" address={s.deliveryAddress} />
              {s.billingAddress && !s.billingSameAsDelivery && (
                <AddressCard
                  title="Bill to"
                  address={s.billingAddress}
                  flag="Different party"
                />
              )}
            </div>
          </SectionBlock>

          {/* Goods */}
          <SectionBlock
            icon={Package}
            title="Goods"
            right={`${totalBoxes} box${totalBoxes === 1 ? "" : "es"} · declared ${fmtMoney(totalDeclared, "INR")}`}
          >
            <PackageBoxList
              packages={s.packages}
              fallbackCurrency={s.currency ?? "INR"}
              variant="ops"
            />
          </SectionBlock>

          {/* GST paperwork — the domestic counterpart to the customs block on
              the export page. Listed as a checklist rather than a file list,
              because what ops needs to know is what is MISSING. */}
          <SectionBlock
            icon={ReceiptText}
            title="GST paperwork"
            right={
              senderIsCompany
                ? "Sender is a company"
                : "Sender is an individual"
            }
          >
            <p className="text-sm text-muted-foreground">
              Declared value {fmtMoney(totalDeclared, "INR")}
              {totalDeclared > EWAY_BILL_THRESHOLD &&
                ` · over the ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")} e-way bill threshold`}
            </p>
            <ul className="divide-y divide-border/60">
              {DOMESTIC_DOC_CONFIGS.map((config) => {
                const attached = s.documents.find(
                  (d) => d.docType === config.docType,
                );
                const required =
                  config.key === "taxInvoice"
                    ? senderIsCompany
                    : config.key === "eWayBill"
                      ? totalDeclared > EWAY_BILL_THRESHOLD
                      : false;

                return (
                  <li
                    key={config.key}
                    className="flex items-start gap-2.5 py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    {attached ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : required ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    ) : (
                      <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {config.label}
                        <span
                          className={cn(
                            "ml-2 text-xs font-normal text-muted-foreground",
                            required &&
                              !attached &&
                              "font-medium text-red-600 dark:text-red-400",
                          )}
                        >
                          {required ? "Required" : "Optional"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {attached
                          ? attached.fileName
                          : required
                            ? "Not on file"
                            : "Not provided"}
                      </p>
                    </div>
                    {attached && (
                      <a
                        href={attached.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionBlock>

          {/* Party KYC — Aadhaar only, and only for an individual sender. */}
          {requiredKycKeys.length > 0 && (
            <KycDocsCard
              docs={kycDocs}
              shipmentType={null}
              requiredKeys={requiredKycKeys}
              partyLabel={s.client?.companyName ?? s.org.name}
              kycWaived={s.kycWaivedAtBooking}
            />
          )}

          {/* Documents. The uploader keeps its card — it is a form, and the
              rest of this column is not. */}
          <SectionBlock
            icon={FileWarning}
            title="Shipment documents"
            right={`${s.documents.length} file${s.documents.length === 1 ? "" : "s"}`}
          >
            <DocumentManager shipmentId={s.id} documents={s.documents} />
          </SectionBlock>

          {/* Pricing */}
          <CollapsibleSection
            icon={Receipt}
            title="Pricing"
            summary={fmtMoney(s.quotedTotal, s.currency)}
          >
            <div className="space-y-2 text-sm">
              {charges?.charges?.map((c, i) => (
                <div
                  key={i}
                  className="flex justify-between text-muted-foreground"
                >
                  <span>{c.name}</span>
                  <span className="text-foreground tabular-nums">
                    {fmtMoney(c.amount, c.currency)}
                  </span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Charged to customer</span>
                <span className="tabular-nums">
                  {fmtMoney(s.quotedTotal, s.currency)}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Includes this org&apos;s {fmtNum(s.markupPercentApplied, "%")}{" "}
                markup, snapshotted at booking.
              </p>
              {s.codEnabled && (
                <p className="rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800 dark:border-amber-600 dark:bg-amber-950/20 dark:text-amber-300">
                  Separately, the courier collects{" "}
                  {fmtMoney(s.codAmount, "INR")} from the receiver and Shipmozo
                  remits it. That is the goods value, not our freight, and it is
                  not part of the figure above.
                </p>
              )}
            </div>
          </CollapsibleSection>

          {/* Status history */}
          <CollapsibleSection
            icon={History}
            title="Status history"
            summary={`${s.statusHistory.length} event${s.statusHistory.length === 1 ? "" : "s"}`}
          >
            <ul className="space-y-3">
              {s.statusHistory.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-foreground">
                      {e.fromStatus
                        ? `${STATUS_CONFIG[e.fromStatus]?.label ?? e.fromStatus} → `
                        : ""}
                      <span className="font-medium">
                        {STATUS_CONFIG[e.toStatus]?.label ?? e.toStatus}
                      </span>
                    </p>
                    {e.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.note}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDatetime(e.createdAt)} · {e.changedByType}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          {/* Reference */}
          <CollapsibleSection icon={Package} title="Booking reference">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Created" value={fmtDatetime(s.createdAt)} />
              <Field label="Booked" value={fmtDatetime(s.bookedAt)} />
              <Field label="Last updated" value={fmtDatetime(s.updatedAt)} />
              <Field
                label="Courier order id"
                value={s.domesticCourierOrderId}
              />
              <Field label="AWB" value={s.domesticAwbNumber} />
              <Field
                label="Pushed to courier"
                value={fmtDatetime(s.domesticCourierBookedAt)}
              />
            </div>
          </CollapsibleSection>
        </div>

        {/* ── Operate rail ── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Customer */}
          <Card className="gap-0 py-0">
            <CardTitleRow icon={Building2} title="Customer" />
            <CardContent className="space-y-2.5 py-4">
              <InfoRow icon={Building2} label="Org" value={s.org.name} />
              {s.client && (
                <InfoRow
                  icon={User}
                  label="Client"
                  value={s.client.companyName}
                />
              )}
              <InfoRow
                icon={Mail}
                label="Email"
                value={s.client?.email ?? s.org.email}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={s.client?.phone ?? s.org.phone}
              />
              <InfoRow
                icon={MapPin}
                label="Sender"
                value={senderIsCompany ? "Company" : "Individual"}
              />
            </CardContent>
          </Card>

          {/* Status — the primary control, so it is always open and carries an
              emphasis ring. */}
          <Card className="gap-0 py-0 ring-2 ring-primary/20">
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
            <CardContent className="py-4">
              <StatusUpdatePanel
                shipmentId={s.id}
                currentStatus={s.status}
                allStatuses={allStatuses}
              />
            </CardContent>
          </Card>

          {/* Courier. The order is placed automatically when the booking is
              paid for, so this is a read-out most of the time; the controls are
              for the runs that failed. */}
          <Card className="gap-0 py-0">
            <CardTitleRow icon={Truck} title="Courier" />
            <CardContent className="py-4">
              <DomesticCourierPanel
                shipmentId={s.id}
                state={{
                  status: s.domesticCourierStatus,
                  vendorName: s.selectedVendorName,
                  selectedProductName: s.selectedProductName,
                  courierName: s.domesticCourierName,
                  orderId: s.domesticCourierOrderId,
                  awbNumber: s.domesticAwbNumber,
                  trackingUrl: s.domesticTrackingUrl,
                  labelUrl: labelDocument?.fileUrl ?? null,
                  arenaLabelUrl: arenaLabelDocument?.fileUrl ?? null,
                  error: s.domesticCourierError,
                  attempts: s.domesticCourierAttempts,
                  bookedAt: s.domesticCourierBookedAt?.toISOString() ?? null,
                }}
              />
            </CardContent>
          </Card>

          {/* Payment collection, when this org ships before paying. */}
          {collection && (
            <PaymentCollectionCard
              collection={collection}
              isArenaAdmin={isArenaAdmin}
            />
          )}

          {/* Wallet */}
          <CollapsibleCard
            icon={Wallet}
            title="Wallet"
            summary={`${s.walletTransactions.length} txn`}
          >
            <ul className="space-y-2.5">
              {s.walletTransactions.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No wallet activity on this shipment.
                </li>
              )}
              {s.walletTransactions.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {t.type.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDatetime(t.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {fmtMoney(t.amount, t.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleCard>

          {/* Internal notes */}
          <CollapsibleCard
            icon={StickyNote}
            title="Internal notes"
            summary={s.internalNotes ? "Has notes" : "None"}
            defaultOpen={Boolean(s.internalNotes)}
          >
            <InternalNotesPanel
              shipmentId={s.id}
              initialNotes={s.internalNotes ?? ""}
            />
          </CollapsibleCard>
        </div>
      </div>
    </div>
  );
}
