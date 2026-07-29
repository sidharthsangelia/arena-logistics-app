"use client";

import { AlertCircle, Building2, Info, ReceiptText, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BookingFormData, DomesticDocs } from "@/types/booking.types";
import {
  DOMESTIC_DOC_CONFIGS,
  EWAY_BILL_THRESHOLD,
  domesticDocRequirement,
  type DomesticDocKey,
} from "@/lib/booking/domesticDocs";
import { BoxEditor } from "../BoxEditor";
import { FileUploadField } from "../FileUploadField";

// ---------------------------------------------------------------------------
// DomesticShipmentDetailStep
//
// The domestic twin of ShipmentDetailStep. Same boxes (shared BoxEditor, since
// pricing works identically), and then everything customs-specific is gone:
//
//   • no CSB-IV / CSB-V / Commercial category — nothing clears customs
//   • no commercial invoice to generate — Arena does not raise GST invoices on
//     a customer's behalf, so an invoice is taken as an upload when one applies
//   • no door-pickup opt-in — a domestic booking IS a door-to-door courier
//     move, so there is nothing to opt into
//   • values are always rupees, so no currency picker
//
// In their place sits the GST paperwork. Which documents are required is
// derived, not asked: the company-name fields on the two address steps say who
// is a company, and the boxes say what the consignment is worth. The rules live
// in lib/booking/domesticDocs.ts, which the wizard's schema and the server-side
// check read too, so what this step shows and what the booking enforces cannot
// drift apart.
// ---------------------------------------------------------------------------

interface Props {
  data: BookingFormData;
  onChange: (data: Partial<BookingFormData>) => void;
  error?: string;
}

const DOC_ICON: Record<DomesticDocKey, React.ComponentType<{ className?: string }>> = {
  taxInvoice: ReceiptText,
  eWayBill: ReceiptText,
  deliveryChallan: ReceiptText,
};

function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** One document slot: label, why it applies, and the upload itself. */
function DocRow({
  docKey,
  label,
  hint,
  required,
  reason,
  value,
  onChange,
  invalid,
}: {
  docKey: DomesticDocKey;
  label: string;
  hint: string;
  required: boolean;
  reason?: string;
  value: DomesticDocs[DomesticDocKey];
  onChange: (file: DomesticDocs[DomesticDocKey]) => void;
  invalid: boolean;
}) {
  const Icon = DOC_ICON[docKey];

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4",
        invalid && "border-destructive/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h4 className="text-sm font-medium">{label}</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
          {required && reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Required here because {reason}.
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {required ? "Required" : "Optional"}
        </span>
      </div>

      <FileUploadField
        value={value}
        onChange={onChange}
        label="Click to upload or drag and drop"
      />

      {invalid && (
        <p
          className="flex items-center gap-1.5 text-xs text-destructive"
          aria-live="polite"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {label} is required for this shipment.
        </p>
      )}
    </div>
  );
}

export default function DomesticShipmentDetailStep({
  data,
  onChange,
  error,
}: Props) {
  const boxes = data.boxes ?? [];
  const docs = data.domesticDocs;

  const requirement = domesticDocRequirement(data);
  const {
    required,
    senderIsCompany,
    receiverIsCompany,
    declaredValue,
    needsEwayBill,
  } = requirement;

  // Only mark a slot red once the step has actually been submitted and failed;
  // an empty required upload is not an error the moment the page opens.
  const showErrors = !!error;

  const setDoc = (key: DomesticDocKey) => (file: DomesticDocs[DomesticDocKey]) => {
    onChange({ domesticDocs: { ...docs, [key]: file } });
  };

  const REASON: Partial<Record<DomesticDocKey, string>> = {
    taxInvoice: "the sender is a company",
    eWayBill: `the declared value is over ${fmtInr(EWAY_BILL_THRESHOLD)}`,
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-7">
        <div>
          <h2 className="text-lg font-semibold">What are you shipping?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            List your boxes and what is inside. This sets the price and the
            paperwork the parcel travels on. All values are in rupees.
          </p>
        </div>

        <BoxEditor
          boxes={boxes}
          currency="INR"
          onChange={(next) => onChange({ boxes: next })}
          // Marked optional for an individual sender, who genuinely has no HSN
          // code to give. A company sender needs one on every line because it
          // goes on the tax invoice they have to attach.
          hsCodeLabel={senderIsCompany ? "HSN code" : "HSN (optional)"}
          hsCodePlaceholder="6109.10"
        />

        {/* ── Documents ── */}
        <div className="space-y-3 border-t pt-6">
          <div>
            <h3 className="text-sm font-semibold">Documents</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              What this consignment needs under the GST rules. We work it out
              from who is sending, who is receiving, and what the goods are
              worth, so you only see the documents that actually apply.
            </p>
          </div>

          {/* Why this list looks the way it does. Shown always, because the
              rules are derived from fields on earlier steps and a customer who
              cannot see the reasoning has no way to know they mistyped a
              company name three steps back. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-xs">
            <span className="flex items-center gap-1.5">
              {senderIsCompany ? (
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Sender</span>
              <strong className="text-foreground">
                {senderIsCompany ? "Company" : "Individual"}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              {receiverIsCompany ? (
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Receiver</span>
              <strong className="text-foreground">
                {receiverIsCompany ? "Company" : "Individual"}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Declared value</span>
              <strong className="text-foreground">{fmtInr(declaredValue)}</strong>
              {needsEwayBill && (
                <Badge variant="secondary" className="text-[10px]">
                  over {fmtInr(EWAY_BILL_THRESHOLD)}
                </Badge>
              )}
            </span>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Whether a party counts as a company comes from the company name on
            the sender and receiver steps. Go back and change it there if this
            reads wrong.
          </p>

          <div className="space-y-2.5">
            {DOMESTIC_DOC_CONFIGS.map((config) => {
              const isRequired = required.includes(config.key);
              return (
                <DocRow
                  key={config.key}
                  docKey={config.key}
                  label={config.label}
                  hint={config.hint}
                  required={isRequired}
                  reason={REASON[config.key]}
                  value={docs?.[config.key] ?? null}
                  onChange={setDoc(config.key)}
                  invalid={showErrors && isRequired && !docs?.[config.key]}
                />
              );
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
