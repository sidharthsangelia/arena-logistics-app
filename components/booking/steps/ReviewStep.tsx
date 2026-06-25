"use client";

import {
  User, Building2, MapPinned, Shield, FileText,
  Package, Truck, CheckCircle2, FileCheck2,
  MapPin, ArrowRight, Scale,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BookingFormData, FileMeta, PackageForm } from "@/types/booking.types";

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

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address block
// ---------------------------------------------------------------------------

function AddressBlock({ data }: { data: BookingFormData["consignor"] }) {
  const addrLine = [data.addressLine1, data.addressLine2].filter(Boolean).join(", ");
  const geoLine  = [data.city, data.state, data.postalCode].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1 text-sm">
      {data.contactName && (
        <p className="font-medium text-foreground">{data.contactName}</p>
      )}
      {data.companyName && (
        <p className="text-muted-foreground">{data.companyName}</p>
      )}
      {data.email && <p className="text-muted-foreground">{data.email}</p>}
      {data.phone && <p className="text-muted-foreground">{data.phone}</p>}
      {addrLine && (
        <p className="pt-1 text-muted-foreground text-xs">{addrLine}</p>
      )}
      {geoLine && (
        <p className="text-xs text-muted-foreground">
          {geoLine}
          {data.country ? `, ${data.country}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KYC block
// ---------------------------------------------------------------------------

const KYC_LABELS: Record<string, string> = {
  pan: "PAN Card",
  aadhaar: "Aadhaar Card",
  gst: "GST Certificate",
  iec: "IEC Certificate",
};

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
// Invoice block
// ---------------------------------------------------------------------------

function InvoiceBlock({ data }: { data: BookingFormData }) {
  if (data.invoiceMode === "UPLOAD") {
    return data.uploadedInvoice ? (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <FileCheck2 className="h-4 w-4 shrink-0 text-green-600" />
        <span className="text-foreground">{data.uploadedInvoice.fileName}</span>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No invoice uploaded.</p>
    );
  }

  const { items } = data.generatedInvoice;
  if (!items.length) return <p className="text-sm text-muted-foreground">No items.</p>;

  const total = items.reduce((s, i) => s + i.unitValue * i.quantity, 0);

  return (
    <div className="rounded-lg border overflow-hidden text-sm">
      <div className="divide-y">
        {items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="font-medium truncate">{item.description}</p>
              <p className="text-xs text-muted-foreground">
                HSN {item.hsCode} · {item.countryOfOrigin}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p>{item.currency} {item.unitValue.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">× {item.quantity}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t bg-muted/30 px-4 py-2 text-xs font-medium">
        <span>Total declared value</span>
        <span>{items[0]?.currency} {total.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Packages block
// ---------------------------------------------------------------------------

function PackagesBlock({ packages }: { packages: PackageForm[] }) {
  if (!packages.length) return <p className="text-sm text-muted-foreground">No packages.</p>;

  const totalWeight = packages.reduce((s, p) => s + p.weightKg * p.quantity, 0);
  const totalPieces = packages.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="space-y-2">
      {/* Summary pill */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {totalPieces} piece{totalPieces !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Scale className="h-3 w-3" />
          {totalWeight.toFixed(2)} kg total
        </span>
      </div>

      {/* Package cards */}
      <div className="divide-y rounded-lg border overflow-hidden text-sm">
        {packages.map((pkg, i) => (
          <div key={pkg.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium truncate">
                {i + 1}. {pkg.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {pkg.lengthCm}×{pkg.widthCm}×{pkg.heightCm} cm
                {pkg.hsCode ? ` · HSN ${pkg.hsCode}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0 text-xs">
              <p className="font-medium">{pkg.quantity} × {pkg.weightKg} kg</p>
              <p className="text-muted-foreground">
                ₹{pkg.declaredValue.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service block — the hero of the review
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
// Route header bar
// ---------------------------------------------------------------------------

function RouteBar({ data }: { data: BookingFormData }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignor.city || "Origin"}
      </span>
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

export default function ReviewStep({ data }: { data: BookingFormData }) {
  const ownerLabel: Record<string, string> = {
    SELF: "My saved profile",
    EXISTING_CLIENT: data.selectedClient?.companyName ?? "Existing client",
    OTHER_PERSON: "Another person",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Review & Confirm</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Verify every detail before submitting. Go back to any step to make changes.
        </p>
      </div>

      {/* Route */}
      <RouteBar data={data} />

      {/* Selected service — top of review so it's the first thing seen */}
      <Section icon={Truck} title="Shipping Service">
        <ServiceBlock service={data.selectedService} />
      </Section>

      <Separator />

      {/* Shipment owner */}
      <Section icon={User} title="Booking For">
        <Row label="Shipping as" value={ownerLabel[data.shipmentOwnerMode]} />
      </Section>

      <Separator />

      {/* Sender + Receiver side by side on wider screens */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Section icon={Building2} title="Sender">
          <AddressBlock data={data.consignor} />
        </Section>
        <Section icon={MapPinned} title="Receiver">
          <AddressBlock data={data.consignee} />
        </Section>
      </div>

      <Separator />

      {/* Packages */}
      <Section icon={Package} title="Packages">
        <PackagesBlock packages={data.packages} />
      </Section>

      <Separator />

      {/* Invoice */}
      <Section
        icon={FileText}
        title="Invoice"
        aside={
          <span className="text-xs text-muted-foreground">
            {data.invoiceMode === "UPLOAD" ? "Uploaded" : "Generated"}
          </span>
        }
      >
        <InvoiceBlock data={data} />
      </Section>

      <Separator />

      {/* KYC */}
      <Section icon={Shield} title="KYC Documents">
        <KycBlock docs={data.kycDocs} />
      </Section>

      {/* Confirmation notice */}
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <p>
          By clicking <strong>Submit Booking</strong> you confirm all details are
          accurate and agree to the carrier's terms of service.
        </p>
      </div>
    </div>
  );
}