"use client";

import {
  User, Building2, MapPinned, Shield, FileText,
  Truck, CheckCircle2, FileCheck2,
  MapPin, ArrowRight, Scale, Wallet, Home,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { BookingFormData, FileMeta } from "@/types/booking.types";
import { WalletPaymentSummary } from "../WalletPaymentSummary";
import { KYC_DOC_CONFIGS } from "@/lib/booking/kyc";
import {
  totalActualWeight,
  totalBoxCount,
  totalDeclaredValue,
  boxDeclaredValue,
} from "@/lib/booking/cargo";
 

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

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          {title}
        </div>
        {aside}
      </div>
      <div className="pl-8 space-y-1.5">{children}</div>
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
  const geoLine  = [data.city, data.state, data.postalCode].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1 text-sm">
      {data.contactName && <p className="font-medium text-foreground">{data.contactName}</p>}
      {data.companyName && <p className="text-muted-foreground">{data.companyName}</p>}
      {data.email && <p className="text-muted-foreground">{data.email}</p>}
      {data.phone && <p className="text-muted-foreground">{data.phone}</p>}
      {addrLine && <p className="pt-1 text-muted-foreground text-xs">{addrLine}</p>}
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

function KycBlock({ docs }: { docs: BookingFormData["kycDocs"] }) {
  const uploaded = Object.entries(docs).filter(([, v]) => v !== null) as [string, FileMeta][];
  if (uploaded.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents uploaded.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {uploaded.map(([key, meta]) => (
        <div key={key} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{KYC_LABELS[key] ?? key}</p>
            <p className="truncate text-muted-foreground">{meta.fileName}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipment items block — replaces the separate Invoice + Packages blocks.
// Currency lives once at `data.currency`, so a mixed-currency total is no
// longer structurally possible.
// ---------------------------------------------------------------------------

function ShipmentItemsBlock({ data }: { data: BookingFormData }) {
  const { boxes, currency, invoiceMode, uploadedInvoice } = data;

  if (!boxes.length) {
    return <p className="text-sm text-muted-foreground">No boxes added.</p>;
  }

  const totalWeight = totalActualWeight(boxes);
  const boxCount = totalBoxCount(boxes);
  const totalValue = totalDeclaredValue(boxes);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Scale className="h-3 w-3" />
          {boxCount} box{boxCount !== 1 ? "es" : ""} · {totalWeight.toFixed(2)} kg total
        </span>
        {invoiceMode === "UPLOAD" && uploadedInvoice && (
          <span className="flex items-center gap-1 text-green-600">
            <FileCheck2 className="h-3 w-3" />
            {uploadedInvoice.fileName} attached
          </span>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden text-sm">
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
                    {currency}{" "}
                    {(boxValue * box.quantity).toLocaleString("en-IN")}
                  </p>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {box.contents.map((it) => (
                    <li key={it.id}>
                      {it.description || "—"} · HSN {it.hsCode || "—"} · {it.quantity} ×{" "}
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
// Service block
// ---------------------------------------------------------------------------

function ServiceBlock({ service }: { service: BookingFormData["selectedService"] }) {
  if (!service) {
    return <p className="text-sm text-destructive">No service selected.</p>;
  }

  return (
    <div className="rounded-lg border-2 border-primary bg-primary/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{service.productName}</p>
          <Badge variant="outline" className="text-xs">
            {service.vendorName}
          </Badge>
          {service.transitDays > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              Estimated delivery in {service.transitDays} day{service.transitDays !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-primary">
            {fmt(service.price, service.currency)}
          </p>
          <p className="text-xs text-muted-foreground">incl. GST</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// First-mile (door → hub) block — only shown when door pickup was opted into
// AND a courier was chosen. Its charge is added to the shipment total below.
// ---------------------------------------------------------------------------

/** The first-mile charge that actually applies to this booking (0 if none). */
export function firstMileChargeOf(data: BookingFormData): number {
  return data.pickupIncluded && data.firstMile ? data.firstMile.price : 0;
}

function FirstMileBlock({ data }: { data: BookingFormData }) {
  const { firstMile, firstMileHubLabel } = data;
  if (!firstMile) {
    return (
      <p className="text-sm text-destructive">No pickup courier selected.</p>
    );
  }
  return (
    <div className="rounded-lg border bg-muted/30 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{firstMile.productName}</p>
          <Badge variant="outline" className="text-xs">{firstMile.vendorName}</Badge>
          <p className="text-xs text-muted-foreground pt-1">
            Door pickup → {firstMileHubLabel || "carrier hub"}
            {firstMile.transitDays > 0 && ` · ~${firstMile.transitDays} day${firstMile.transitDays !== 1 ? "s" : ""} to hub`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">
            {fmt(firstMile.price, firstMile.currency)}
          </p>
          <p className="text-xs text-muted-foreground">incl. GST</p>
        </div>
      </div>
    </div>
  );
}

function RouteBar({ data }: { data: BookingFormData }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">{data.consignor.city || "Origin"}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignee.city || "Destination"}, {data.consignee.country}
      </span>
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
   * Fired whenever the wallet balance check (initial load, manual refresh,
   * post-topup refresh) changes. The wizard uses this to gate/enable the
   * "Pay & Place Booking" button.
   */
  onWalletStatusChange?: (info: WalletSufficiencyInfo) => void;
  /**
   * Fired after a top-up completes successfully. The wizard uses this to
   * auto-submit the booking so the user doesn't have to click Pay twice.
   */
  onTopUpSuccess?: () => void;
}

export default function ReviewStep({ data, onWalletStatusChange, onTopUpSuccess }: ReviewStepProps) {
  const ownerLabel: Record<string, string> = {
    SELF: "My saved profile",
    EXISTING_CLIENT: data.selectedClient?.companyName ?? "Existing client",
    OTHER_PERSON: "Another person",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Review & Confirm</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Verify every detail before submitting. Go back to any step to make changes.
        </p>
      </div>

      <RouteBar data={data} />

      <Section icon={Truck} title="Shipping Service">
        <ServiceBlock service={data.selectedService} />
      </Section>

      {data.pickupIncluded && (
        <>
          <Separator />
          <Section icon={Home} title="Door Pickup (First Mile)">
            <FirstMileBlock data={data} />
          </Section>
        </>
      )}

      <Separator />

      <Section icon={User} title="Booking For">
        <Row label="Shipping as" value={ownerLabel[data.shipmentOwnerMode]} />
      </Section>

      <Separator />

      <div className="grid gap-6 sm:grid-cols-2">
        <Section icon={Building2} title="Sender">
          <AddressBlock data={data.consignor} />
        </Section>
        <Section icon={MapPinned} title="Receiver">
          <AddressBlock data={data.consignee} />
        </Section>
      </div>

      <Separator />

      <Section
        icon={FileText}
        title="Shipment Items & Invoice"
        aside={
          <span className="text-xs text-muted-foreground">
            {data.invoiceMode === "UPLOAD" ? "Invoice uploaded" : "Invoice generated"}
          </span>
        }
      >
        <ShipmentItemsBlock data={data} />
      </Section>

      <Separator />

      <Section icon={Shield} title="KYC Documents">
        <KycBlock docs={data.kycDocs} />
      </Section>

      <Separator />

      <Section icon={Wallet} title="Payment">
        {data.selectedService ? (
          <div className="space-y-3">
            {/* Charge breakdown — the wallet is debited for the combined total
                (international service + door-pickup first mile). */}
            {data.pickupIncluded && data.firstMile && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>International shipping</span>
                  <span className="text-foreground">
                    {fmt(data.selectedService.price, data.selectedService.currency)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-muted-foreground">
                  <span>Door pickup (first mile)</span>
                  <span className="text-foreground">
                    {fmt(data.firstMile.price, data.firstMile.currency)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold text-foreground">
                  <span>Total</span>
                  <span>
                    {fmt(
                      data.selectedService.price + firstMileChargeOf(data),
                      data.selectedService.currency,
                    )}
                  </span>
                </div>
              </div>
            )}
            <WalletPaymentSummary
              requiredAmountRupees={data.selectedService.price + firstMileChargeOf(data)}
              currency={data.selectedService.currency}
              onSufficiencyChange={onWalletStatusChange}
              onTopUpSuccess={onTopUpSuccess}
            />
          </div>
        ) : (
          <p className="text-sm text-destructive">No service selected.</p>
        )}
      </Section>

      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <p>
          By clicking <strong>Pay &amp; Place Booking</strong> you confirm all details are
          accurate and agree to the carrier's terms of service.
        </p>
      </div>
    </div>
  );
}