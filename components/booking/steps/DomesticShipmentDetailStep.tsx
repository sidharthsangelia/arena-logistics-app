"use client";

import { useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  Info,
  Plus,
  ReceiptText,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BookingFormData, DomesticDocs } from "@/types/booking.types";
import {
  DOMESTIC_DOC_CONFIGS,
  EWAY_BILL_NUMBER_DIGITS,
  EWAY_BILL_THRESHOLD,
  domesticDocRequirement,
  isValidEwayBillNumber,
  normaliseEwayBillNumber,
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
// In their place sits the GST paperwork. Only the documents this consignment
// actually needs are open on arrival; the rest are folded away behind one row
// and open when the customer wants to attach one. Which documents are required
// is derived, not asked: the company-name fields on the two address steps say who
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

  // The number is the one field here a customer types rather than attaches, so
  // it also flags a WRONG value as they leave it, not only a missing one after
  // a failed submit. A half-typed number is not an error yet, which is why the
  // length check waits for the field to be non-empty and for the digit count to
  // have passed what a valid number would be.
  const enteredNumber = (data.eWayBillNumber ?? "").trim();
  const numberDigits = normaliseEwayBillNumber(enteredNumber).length;
  const showNumberError =
    needsEwayBill &&
    !isValidEwayBillNumber(enteredNumber) &&
    (showErrors || numberDigits > EWAY_BILL_NUMBER_DIGITS);

  const requiredConfigs = DOMESTIC_DOC_CONFIGS.filter((c) =>
    required.includes(c.key),
  );
  const optionalConfigs = DOMESTIC_DOC_CONFIGS.filter(
    (c) => !required.includes(c.key),
  );
  const optionalAdded = optionalConfigs.filter((c) => !!docs?.[c.key]).length;

  // Optional paperwork is closed by default. It is the bulk of this step by
  // height, and every one of those upload boxes is for a document this
  // particular consignment does not need — an individual sending under the
  // e-way bill threshold was being asked to scroll past three of them to reach
  // Next. Nothing that blocks the booking can hide in here: only required docs
  // are ever missing, and those are always open above.
  const hasOptionalFile = optionalAdded > 0;
  const [optionalOpen, setOptionalOpen] = useState(hasOptionalFile);

  // It opens itself the moment there is something in there worth seeing: a
  // resumed draft that already attached one, or a document that stopped being
  // required while its file was still on it (drop the declared value back under
  // the threshold and the e-way bill you uploaded moves down into this group).
  //
  // Adjusted during render off a remembered previous value rather than in an
  // effect, which is React's own answer for state that reacts to a change in
  // derived data: it fires on the transition alone, so a customer who then
  // closes the group is left alone, and it never paints the closed state first.
  const [sawOptionalFile, setSawOptionalFile] = useState(hasOptionalFile);
  if (sawOptionalFile !== hasOptionalFile) {
    setSawOptionalFile(hasOptionalFile);
    if (hasOptionalFile) setOptionalOpen(true);
  }

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

          {/* Required: open, in the order the rules list them. */}
          {requiredConfigs.length > 0 ? (
            <div className="space-y-2.5">
              {requiredConfigs.map((config) => (
                <DocRow
                  key={config.key}
                  docKey={config.key}
                  label={config.label}
                  hint={config.hint}
                  required
                  reason={REASON[config.key]}
                  value={docs?.[config.key] ?? null}
                  onChange={setDoc(config.key)}
                  invalid={showErrors && !docs?.[config.key]}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
              This consignment does not need any paperwork attached. Add
              anything you want travelling with the parcel below.
            </p>
          )}

          {/* The NUMBER, not the file. Sits directly under the upload it comes
              off, because a customer reading the e-way bill PDF to attach it is
              already looking at the number this asks for. Only above the
              threshold: below it nothing needs one and the field would be a
              question with no answer. */}
          {needsEwayBill && (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 px-4 py-3">
              <Label htmlFor="eWayBillNumber" className="text-sm font-medium">
                E-way bill number
                <span className="ml-1 text-destructive">*</span>
              </Label>
              <Input
                id="eWayBillNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234 5678 9012"
                value={data.eWayBillNumber ?? ""}
                onChange={(e) => onChange({ eWayBillNumber: e.target.value })}
                aria-invalid={showNumberError}
                aria-describedby="eWayBillNumber-hint"
                className={cn(showNumberError && "border-destructive")}
              />
              <p id="eWayBillNumber-hint" className="text-xs text-muted-foreground">
                The {EWAY_BILL_NUMBER_DIGITS}-digit number on the bill you
                attached above. The courier is given this on the order and will
                not carry a consignment over {fmtInr(EWAY_BILL_THRESHOLD)}{" "}
                without it. Spaces and hyphens are fine.
              </p>
              {showNumberError && (
                <p
                  className="flex items-center gap-1.5 text-xs text-destructive"
                  aria-live="polite"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {enteredNumber
                    ? `An e-way bill number is ${EWAY_BILL_NUMBER_DIGITS} digits. You entered ${normaliseEwayBillNumber(enteredNumber).length}.`
                    : "An e-way bill number is required for this shipment."}
                </p>
              )}
            </div>
          )}

          {/* Everything else: folded away, one click from open. */}
          {optionalConfigs.length > 0 && (
            <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-dashed px-4 py-3 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">Add optional documents</span>
                    <span className="text-xs text-muted-foreground">
                      Not needed to continue
                      {optionalAdded > 0 && ` · ${optionalAdded} added`}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      optionalOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-2.5 pt-2.5">
                {optionalConfigs.map((config) => (
                  <DocRow
                    key={config.key}
                    docKey={config.key}
                    label={config.label}
                    hint={config.hint}
                    required={false}
                    value={docs?.[config.key] ?? null}
                    onChange={setDoc(config.key)}
                    // An optional document is never the reason a step fails.
                    invalid={false}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
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
