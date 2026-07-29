"use client";

import { useState } from "react";
import {
  User, Building2, MapPinned, Shield, FileText,
  ShieldAlert, FileCheck2, Clock3,
  MapPin, ArrowRight, Scale, Wallet, Home, PackageCheck,
  Plane, Truck, Banknote, ReceiptText, AlertCircle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ProhibitedItemsDialog } from "../ProhibitedItemsDialog";
import type {
  BookingFormData,
  FileMeta,
  ShipmentTypeValue,
} from "@/types/booking.types";
import { WalletPaymentSummary } from "../WalletPaymentSummary";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { brandServiceName } from "@/lib/branding/serviceName";
import {
  KYC_DOC_CONFIGS,
  requiredKycKeys,
  requiredDomesticKycKeys,
} from "@/lib/booking/kyc";
import {
  totalChargeableWeight,
  totalBoxCount,
  totalDeclaredValue,
  boxDeclaredValue,
} from "@/lib/booking/cargo";
import {
  DOMESTIC_DOC_CONFIGS,
  DOMESTIC_DOC_LABEL_BY_KEY,
  domesticDocRequirement,
  isCompanyParty,
  missingDomesticDocs,
} from "@/lib/booking/domesticDocs";
import { domesticCodAmount } from "@/lib/booking/domesticRequest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function Section({
  icon: Icon,
  title,
  children,
  aside,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          {title}
        </div>
        {aside}
      </div>
      <div className="space-y-1.5 pl-8">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function AddressBlock({ data }: { data: BookingFormData["consignor"] }) {
  const addrLine = [data.addressLine1, data.addressLine2].filter(Boolean).join(", ");
  const geoLine = [data.city, data.state, data.postalCode].filter(Boolean).join(", ");

  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      {data.contactName && <p className="font-medium text-foreground">{data.contactName}</p>}
      {data.companyName && <p className="text-muted-foreground">{data.companyName}</p>}
      {data.email && <p className="text-muted-foreground">{data.email}</p>}
      {data.phone && <p className="text-muted-foreground">{data.phone}</p>}
      {addrLine && <p className="pt-1 text-xs text-muted-foreground">{addrLine}</p>}
      {geoLine && (
        <p className="text-xs text-muted-foreground">
          {geoLine}
          {data.country ? `, ${data.country}` : ""}
        </p>
      )}
    </div>
  );
}

// Drive labels off the shared KYC matrix so a new doc key (e.g. companyPan,
// lut) never silently renders as its raw key here.
const KYC_LABELS: Record<string, string> = Object.fromEntries(
  KYC_DOC_CONFIGS.map((c) => [c.key, c.label]),
);

const SHIPMENT_TYPE_LABELS: Record<ShipmentTypeValue, string> = {
  CSB4: "CSB-IV",
  CSB5: "CSB-V",
  COMMERCIAL: "Commercial",
};

/**
 * KYC completeness for this booking. `required` is the set of doc keys it
 * demands — the export matrix keyed by shipment type internationally, Aadhaar
 * for an individual sender domestically — and `missing` are the ones not yet on
 * the form. The server re-verifies against the vault at submit; this is the
 * friendly heads-up so the user isn't surprised by a rejection on the last click.
 */
function kycStatusOf(data: BookingFormData) {
  const required =
    data.mode === "DOMESTIC"
      ? requiredDomesticKycKeys(isCompanyParty(data.consignor))
      : requiredKycKeys(data.shipmentType);
  const missing = required.filter((k) => !data.kycDocs[k]);
  return { required, missing, complete: missing.length === 0 };
}

function KycStatusBadge({ data }: { data: BookingFormData }) {
  const { required, missing } = kycStatusOf(data);
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        <PackageCheck className="h-3 w-3" />
        {required.length}/{required.length} ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      <Clock3 className="h-3 w-3" />
      {missing.length} still needed
    </span>
  );
}

function KycBlock({ data }: { data: BookingFormData }) {
  const uploaded = Object.entries(data.kycDocs).filter(([, v]) => v !== null) as [string, FileMeta][];
  const { missing } = kycStatusOf(data);

  if (uploaded.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents added yet.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {uploaded.map(([key, meta]) => (
          <div key={key} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{KYC_LABELS[key] ?? key}</p>
              <p className="truncate text-muted-foreground">{meta.fileName}</p>
            </div>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-amber-700">
          Still needed for {SHIPMENT_TYPE_LABELS[data.shipmentType]}:{" "}
          {missing.map((k) => KYC_LABELS[k] ?? k).join(", ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domestic GST paperwork — the counterpart to KycBlock above.
//
// It lists what this consignment needs and why, because both answers are
// DERIVED (from the company-name fields and the declared value) rather than
// chosen. A customer who sees "Tax invoice — required" without being told it is
// because the sender is a company has no way to know they typed a company name
// by accident three steps back.
// ---------------------------------------------------------------------------

function DomesticDocsStatusBadge({ data }: { data: BookingFormData }) {
  const { required } = domesticDocRequirement(data);
  const missing = missingDomesticDocs(data);

  if (required.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        None required
      </span>
    );
  }
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        <PackageCheck className="h-3 w-3" />
        {required.length}/{required.length} ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      <Clock3 className="h-3 w-3" />
      {missing.length} still needed
    </span>
  );
}

function DomesticDocsBlock({ data }: { data: BookingFormData }) {
  const { required, senderIsCompany, receiverIsCompany } =
    domesticDocRequirement(data);
  const missing = missingDomesticDocs(data);
  const docs = data.domesticDocs;

  const attached = DOMESTIC_DOC_CONFIGS.filter((c) => docs?.[c.key]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Worked out from a{" "}
        <span className="font-medium text-foreground">
          {senderIsCompany ? "company" : "individual"}
        </span>{" "}
        sender and a{" "}
        <span className="font-medium text-foreground">
          {receiverIsCompany ? "company" : "individual"}
        </span>{" "}
        receiver.
      </p>

      {attached.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {attached.map((config) => (
            <div
              key={config.key}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
            >
              <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {config.label}
                  {required.includes(config.key) ? "" : " (optional)"}
                </p>
                <p className="truncate text-muted-foreground">
                  {docs[config.key]!.fileName}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {required.length === 0
            ? "No documents are required for this shipment."
            : "No documents attached yet."}
        </p>
      )}

      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Still needed:{" "}
          {missing.map((k) => DOMESTIC_DOC_LABEL_BY_KEY[k] ?? k).join(", ")}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipment items block. Currency lives once at `data.currency`, so a
// mixed-currency total is not structurally possible.
// ---------------------------------------------------------------------------

function ShipmentItemsBlock({ data }: { data: BookingFormData }) {
  const { boxes, currency, invoiceMode, uploadedInvoice } = data;

  if (!boxes.length) {
    return <p className="text-sm text-muted-foreground">No boxes added.</p>;
  }

  const chargeable = totalChargeableWeight(boxes);
  const boxCount = totalBoxCount(boxes);
  const totalValue = totalDeclaredValue(boxes);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Scale className="h-3 w-3" />
          {boxCount} box{boxCount !== 1 ? "es" : ""} ·{" "}
          {chargeable.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg chargeable
        </span>
        {invoiceMode === "UPLOAD" && uploadedInvoice && (
          <span className="flex items-center gap-1 text-emerald-600">
            <FileCheck2 className="h-3 w-3" />
            {uploadedInvoice.fileName} attached
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border text-sm">
        <div className="divide-y">
          {boxes.map((box, bi) => {
            const boxValue = boxDeclaredValue(box);
            return (
              <div key={box.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    Box {bi + 1}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {box.lengthCm}×{box.widthCm}×{box.heightCm} cm · {box.weightKg} kg
                      {box.quantity > 1 ? ` · ×${box.quantity}` : ""}
                    </span>
                  </p>
                  <p className="shrink-0 text-xs font-medium">
                    {currency} {(boxValue * box.quantity).toLocaleString("en-IN")}
                  </p>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {box.contents.map((it) => (
                    <li key={it.id}>
                      {it.description || "Item"}
                      {it.hsCode ? ` · HSN ${it.hsCode}` : ""} · {it.quantity} ×{" "}
                      {currency} {it.unitValue.toLocaleString("en-IN")}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between border-t bg-muted/30 px-4 py-2 text-xs font-medium">
          <span>Total declared value</span>
          <span>{currency} {totalValue.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service + first-mile blocks
// ---------------------------------------------------------------------------

function ServiceBlock({ service }: { service: BookingFormData["selectedService"] }) {
  const isArena = useIsArenaOrg();
  if (!service) {
    return <p className="text-sm text-destructive">No service selected.</p>;
  }

  // The main leg: the international carrier on an export booking, the
  // door-to-door courier on a domestic one. (The intl door → hub first mile is
  // a separate block below.) White-label Shipmozo own-brand names as "Arena"
  // for customers so the review screen matches the service card they just
  // picked. Display-only.
  const displayName = isArena
    ? service.productName
    : brandServiceName(service.productName);

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">{displayName}</p>
          {isArena && (
            <Badge variant="outline" className="text-xs">{service.vendorName}</Badge>
          )}
          {service.transitDays > 0 && (
            <p className="pt-0.5 text-xs text-muted-foreground">
              Delivers in about {service.transitDays} day{service.transitDays !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-foreground">{fmt(service.price, service.currency)}</p>
          <p className="text-xs text-muted-foreground">incl. GST</p>
        </div>
      </div>
    </div>
  );
}

/** The first-mile charge that actually applies to this booking (0 if none). */
export function firstMileChargeOf(data: BookingFormData): number {
  return data.pickupIncluded && data.firstMile ? data.firstMile.price : 0;
}

function FirstMileBlock({ data }: { data: BookingFormData }) {
  const isArena = useIsArenaOrg();
  const { firstMile, firstMileHubLabel } = data;
  if (!firstMile) {
    return <p className="text-sm text-destructive">No pickup courier selected.</p>;
  }
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">{firstMile.productName}</p>
          {isArena && (
            <Badge variant="outline" className="text-xs">{firstMile.vendorName}</Badge>
          )}
          <p className="pt-0.5 text-xs text-muted-foreground">
            Door pickup to {firstMileHubLabel || "carrier hub"}
            {firstMile.transitDays > 0 && `, about ${firstMile.transitDays} day${firstMile.transitDays !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-foreground">{fmt(firstMile.price, firstMile.currency)}</p>
          <p className="text-xs text-muted-foreground">incl. GST</p>
        </div>
      </div>
    </div>
  );
}

function RouteBar({ data }: { data: BookingFormData }) {
  const isDomestic = data.mode === "DOMESTIC";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignor.city || "Origin"}
        {isDomestic && data.consignor.postalCode
          ? ` ${data.consignor.postalCode}`
          : ""}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignee.city || "Destination"}
        {isDomestic
          ? data.consignee.postalCode
            ? ` ${data.consignee.postalCode}`
            : ""
          : `, ${data.consignee.country}`}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="gap-1 text-[11px]">
          {isDomestic ? (
            <>
              <Truck className="h-3 w-3" />
              Domestic
            </>
          ) : (
            SHIPMENT_TYPE_LABELS[data.shipmentType]
          )}
        </Badge>
        {isDomestic && data.codEnabled && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Banknote className="h-3 w-3" />
            Cash on delivery
          </Badge>
        )}
        {!isDomestic && data.pickupIncluded && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Home className="h-3 w-3" />
            Door pickup
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charge breakdown — international service + door-pickup first mile → total.
// ---------------------------------------------------------------------------

function ChargeBreakdown({ data }: { data: BookingFormData }) {
  const service = data.selectedService;
  if (!service) return null;
  const isDomestic = data.mode === "DOMESTIC";
  const firstMile = firstMileChargeOf(data);
  const total = service.price + firstMile;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>{isDomestic ? "Courier delivery" : "International shipping"}</span>
        <span className="text-foreground">{fmt(service.price, service.currency)}</span>
      </div>
      {data.pickupIncluded && data.firstMile && (
        <div className="mt-1 flex justify-between text-muted-foreground">
          <span>Door pickup (first mile)</span>
          <span className="text-foreground">{fmt(firstMile, service.currency)}</span>
        </div>
      )}
      <Separator className="my-2" />
      <div className="flex justify-between text-base font-semibold text-foreground">
        <span>Total payable</span>
        <span>{fmt(total, service.currency)}</span>
      </div>

      {/* COD sits BELOW the total on purpose. It is not part of what the
          customer pays Arena — it is money the courier collects from the
          receiver and remits onward — and folding it into the total would
          read as a charge. */}
      {isDomestic && data.codEnabled && (
        <div className="mt-3 flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
          <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Separately, the courier collects{" "}
            <span className="font-semibold text-foreground">
              {fmt(domesticCodAmount(data), "INR")}
            </span>{" "}
            from the receiver on delivery and remits it to you. It is not part
            of the total above.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deferred payment panel — shown for skipPayment orgs. No wallet, no debit;
// the charge is collected when the parcel reaches the hub.
// ---------------------------------------------------------------------------

function DeferredPaymentPanel({
  amountRupees,
  currency,
}: {
  amountRupees: number;
  currency: string;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-start gap-3 text-sm">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Pay on arrival at hub</p>
          <p className="text-muted-foreground">
            No payment is taken now. This booking is placed straight away and our
            team collects{" "}
            <span className="font-semibold text-foreground">{fmt(amountRupees, currency)}</span>{" "}
            when your parcel reaches the carrier hub.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewStep
// ---------------------------------------------------------------------------

interface WalletSufficiencyInfo {
  loading: boolean;
  sufficient: boolean;
  balance: number | null;
}

interface ReviewStepProps {
  data: BookingFormData;
  /**
   * Org has payments turned off (Org.skipPayment). When true, no wallet
   * balance is checked and no debit happens — the booking is placed with
   * payment deferred (collected at the hub). The wallet summary is replaced
   * by an informational "pay on arrival" panel.
   */
  skipPayment?: boolean;
  /**
   * Fired whenever the wallet balance check (initial load, manual refresh,
   * post-topup refresh) changes. The wizard uses this to gate/enable the
   * "Pay & Place Booking" button. Never fired when skipPayment is true.
   */
  onWalletStatusChange?: (info: WalletSufficiencyInfo) => void;
  /**
   * Fired after a top-up completes successfully. The wizard uses this to
   * auto-submit the booking so the user doesn't have to click Pay twice.
   */
  onTopUpSuccess?: () => void;
  /** Whether the final declaration at the bottom of this step is ticked. */
  accepted?: boolean;
  /** Ticking it enables the booking button in the wizard's footer. */
  onAcceptedChange?: (accepted: boolean) => void;
}

export default function ReviewStep({
  data,
  skipPayment = false,
  onWalletStatusChange,
  onTopUpSuccess,
  accepted = false,
  onAcceptedChange,
}: ReviewStepProps) {
  const [prohibitedOpen, setProhibitedOpen] = useState(false);
  const isDomestic = data.mode === "DOMESTIC";

  const ownerLabel: Record<string, string> = {
    SELF: "My saved profile",
    EXISTING_CLIENT: data.selectedClient?.companyName ?? "Existing client",
    OTHER_PERSON: "Another person",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review and confirm</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A quick check before you book. Use Back to change anything.
        </p>
      </div>

      <RouteBar data={data} />

      {/* Who + where */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Section icon={Building2} title="Sender">
          <AddressBlock data={data.consignor} />
          {!data.pickupSameAsSender && (
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Home className="h-3 w-3" />
                Parcel collected from
              </p>
              <AddressBlock data={data.pickup} />
            </div>
          )}
        </Section>
        <Section icon={MapPinned} title="Receiver">
          <AddressBlock data={data.consignee} />
          {!data.billingSameAsDelivery && (
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileText className="h-3 w-3" />
                Invoice billed to
              </p>
              <AddressBlock data={data.billing} />
            </div>
          )}
        </Section>
      </div>

      <Section icon={User} title="Booking for">
        <Row label="Shipping as" value={ownerLabel[data.shipmentOwnerMode]} />
      </Section>

      <Separator />

      {/* What */}
      <Section
        icon={FileText}
        title={isDomestic ? "Items" : "Items and invoice"}
        aside={
          isDomestic ? undefined : (
            <span className="text-xs text-muted-foreground">
              {data.invoiceMode === "UPLOAD" ? "Invoice uploaded" : "Invoice generated"}
            </span>
          )
        }
      >
        <ShipmentItemsBlock data={data} />
      </Section>

      {isDomestic ? (
        <Section
          icon={ReceiptText}
          title="GST documents"
          aside={<DomesticDocsStatusBadge data={data} />}
        >
          <DomesticDocsBlock data={data} />
        </Section>
      ) : (
        <Section
          icon={Shield}
          title="Customs documents"
          aside={<KycStatusBadge data={data} />}
        >
          <KycBlock data={data} />
        </Section>
      )}

      {/* Domestic still collects an Aadhaar from an individual sender. Shown as
          its own short section rather than folded into the GST documents above,
          because it belongs to the PARTY and is reused across their shipments,
          while everything above belongs to this one consignment. */}
      {isDomestic && requiredDomesticKycKeys(isCompanyParty(data.consignor)).length > 0 && (
        <Section
          icon={Shield}
          title="Proof of identity"
          aside={<KycStatusBadge data={data} />}
        >
          <KycBlock data={data} />
        </Section>
      )}

      <Separator />

      {/* Service */}
      <Section
        icon={isDomestic ? Truck : Plane}
        title={isDomestic ? "Courier" : "Shipping service"}
      >
        <ServiceBlock service={data.selectedService} />
      </Section>

      {!isDomestic && data.pickupIncluded && (
        <Section icon={Home} title="Door pickup (first mile)">
          <FirstMileBlock data={data} />
        </Section>
      )}

      <Separator />

      {/* Pay */}
      <Section icon={Wallet} title="Payment">
        {data.selectedService ? (
          <div className="space-y-3">
            {/* Always show the breakdown so the total payable is unmistakable. */}
            <ChargeBreakdown data={data} />

            {skipPayment ? (
              <DeferredPaymentPanel
                amountRupees={data.selectedService.price + firstMileChargeOf(data)}
                currency={data.selectedService.currency}
              />
            ) : (
              <WalletPaymentSummary
                requiredAmountRupees={data.selectedService.price + firstMileChargeOf(data)}
                currency={data.selectedService.currency}
                onSufficiencyChange={onWalletStatusChange}
                onTopUpSuccess={onTopUpSuccess}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-destructive">No service selected.</p>
        )}
      </Section>

      {/* ── Final declaration ── the booking button stays disabled until this
          is ticked (see BookingWizard). Deliberately the last thing on the
          page, so it is read after the details it refers to. */}
      <div className="rounded-lg border p-4 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="booking-declaration"
            checked={accepted}
            onCheckedChange={(checked) => onAcceptedChange?.(checked === true)}
            className="mt-0.5"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="booking-declaration"
              className="cursor-pointer text-sm font-medium"
            >
              I have checked this booking
            </Label>
            <p className="text-sm text-muted-foreground">
              {isDomestic
                ? "The pickup and delivery addresses are right, the items and their declared value are correct, the courier and total are what I want, and nothing in my boxes is on the prohibited items list."
                : "The pickup and delivery addresses are right, the service and total are what I want, and nothing in my boxes is on the prohibited items list."}
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setProhibitedOpen(true)}
            >
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              {isDomestic
                ? "See what you cannot send within India"
                : "See what you cannot send by air"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Placing the booking also means you accept the carrier&apos;s
              terms of service.
            </p>
          </div>
        </div>
      </div>

      <ProhibitedItemsDialog
        open={prohibitedOpen}
        onOpenChange={setProhibitedOpen}
        mode={data.mode}
      />
    </div>
  );
}
