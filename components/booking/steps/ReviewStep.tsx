"use client";

import {
  User,
  Building2,
  MapPinned,
  Shield,
  FileText,
  Package,
  Truck,
  CheckCircle2,
  FileCheck2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { BookingFormData, FileMeta, PackageForm } from "@/types/booking.types";

// ---------------------------------------------------------------------------
// Shared display helpers
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader icon={icon} title={title} />
      <div className="space-y-1.5 pl-6">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address block (shared for consignor / consignee)
// ---------------------------------------------------------------------------

function AddressBlock({ data }: { data: BookingFormData["consignor"] }) {
  const addressParts = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.state,
    data.postalCode,
    data.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Row label="Contact" value={data.contactName} />
      <Row label="Company" value={data.companyName} />
      <Row label="Email" value={data.email} />
      <Row label="Phone" value={data.phone} />
      <Row label="Address" value={addressParts} />
    </>
  );
}

// ---------------------------------------------------------------------------
// KYC section
// ---------------------------------------------------------------------------

const KYC_LABELS: Record<string, string> = {
  pan: "PAN Card",
  aadhaar: "Aadhaar Card",
  gst: "GST Certificate",
  iec: "IEC Certificate",
};

function KycBlock({ docs }: { docs: BookingFormData["kycDocs"] }) {
  const uploaded = Object.entries(docs).filter(([, v]) => v !== null) as [
    string,
    FileMeta,
  ][];

  if (uploaded.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No documents uploaded.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {uploaded.map(([key, meta]) => (
        <div key={key} className="flex items-center gap-2 text-sm">
          <FileCheck2 className="h-4 w-4 text-green-600" />
          <span className="text-muted-foreground">{KYC_LABELS[key] ?? key}</span>
          <span className="ml-auto font-medium truncate max-w-48">{meta.fileName}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice section
// ---------------------------------------------------------------------------

function InvoiceBlock({ data }: { data: BookingFormData }) {
  if (data.invoiceMode === "UPLOAD") {
    return data.uploadedInvoice ? (
      <Row label="File" value={data.uploadedInvoice.fileName} />
    ) : (
      <p className="text-sm text-muted-foreground">No invoice uploaded.</p>
    );
  }

  const { items } = data.generatedInvoice;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No invoice items.</p>;

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{item.description}</span>
            <span>
              {item.currency} {item.unitValue.toLocaleString()} × {item.quantity}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            HSN: {item.hsCode} · Origin: {item.countryOfOrigin}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Packages section
// ---------------------------------------------------------------------------

function PackageBlock({ packages }: { packages: PackageForm[] }) {
  if (packages.length === 0)
    return <p className="text-sm text-muted-foreground">No packages added.</p>;

  const totalWeight = packages.reduce(
    (s, p) => s + p.weightKg * p.quantity,
    0,
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{packages.length}</span>{" "}
          package{packages.length !== 1 ? "s" : ""}
        </span>
        <span>
          <span className="font-medium text-foreground">
            {totalWeight.toFixed(2)} kg
          </span>{" "}
          total
        </span>
      </div>

      {packages.map((pkg, i) => (
        <div key={pkg.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">
              Package {i + 1} — {pkg.description}
            </span>
            <span className="text-muted-foreground">
              {pkg.quantity} × {pkg.weightKg} kg
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {pkg.lengthCm}×{pkg.widthCm}×{pkg.heightCm} cm ·{" "}
            {pkg.hsCode && `HSN ${pkg.hsCode} · `}
            Value: {pkg.declaredValue.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service section
// ---------------------------------------------------------------------------

function ServiceBlock({ service }: { service: BookingFormData["selectedService"] }) {
  if (!service)
    return (
      <p className="text-sm text-destructive">No service selected.</p>
    );

  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/5 px-4 py-3">
      <div>
        <p className="font-semibold">{service.vendorName}</p>
        <p className="text-sm text-muted-foreground">{service.productName}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {service.transitDays} day{service.transitDays !== 1 ? "s" : ""} transit
          </span>
          <Badge variant="outline" className="text-xs">
            {service.productCode}
          </Badge>
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-primary">
          {service.currency}{" "}
          {service.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground">incl. taxes</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewStep
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  data: BookingFormData;
}

export default function ReviewStep({ data }: ReviewStepProps) {
  const shipmentOwnerLabel: Record<string, string> = {
    SELF: "My Saved Profile",
    EXISTING_CLIENT: data.selectedClient?.companyName ?? "Existing Client",
    OTHER_PERSON: "Another Person",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review & Confirm</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Check every detail before submitting. You can go back to any step to
          make changes.
        </p>
      </div>

      {/* Shipment owner */}
      <Section icon={User} title="Shipment Owner">
        <Row
          label="Shipping for"
          value={shipmentOwnerLabel[data.shipmentOwnerMode]}
        />
      </Section>

      <Separator />

      {/* Consignor */}
      <Section icon={Building2} title="Consignor (Sender)">
        <AddressBlock data={data.consignor} />
      </Section>

      <Separator />

      {/* Consignee */}
      <Section icon={MapPinned} title="Consignee (Receiver)">
        <AddressBlock data={data.consignee} />
      </Section>

      <Separator />

      {/* KYC */}
      <Section icon={Shield} title="KYC Documents">
        <KycBlock docs={data.kycDocs} />
      </Section>

      <Separator />

      {/* Invoice */}
      <Section
        icon={FileText}
        title={`Invoice — ${data.invoiceMode === "UPLOAD" ? "Uploaded" : "Generated"}`}
      >
        <InvoiceBlock data={data} />
      </Section>

      <Separator />

      {/* Packages */}
      <Section icon={Package} title="Packages">
        <PackageBlock packages={data.packages} />
      </Section>

      <Separator />

      {/* Service */}
      <Section icon={Truck} title="Shipping Service">
        <ServiceBlock service={data.selectedService} />
      </Section>

      {/* Confirmation notice */}
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        <p>
          By clicking <strong>Submit Booking</strong>, you confirm that all
          information provided is accurate and agree to the carrier terms of
          service.
        </p>
      </div>
    </div>
  );
}