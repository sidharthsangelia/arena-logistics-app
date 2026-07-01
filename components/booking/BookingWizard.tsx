"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { BookingFormData, ClientSummary } from "@/types/booking.types";
import { bookingSteps, useBookingWizard, STEP } from "@/hooks/useBookingWizard";
import {
  shipmentOwnerSchema,
  consignorSchema,
  consigneeSchema,
  shipmentDetailsSchema,
  kycSchema,
  serviceSchema,
} from "@/types/booking.schema";

import ProgressSteps from "./ProgessSteps";
import ReviewStep from "./steps/ReviewStep";
import KycStep from "./steps/KycStep";
import ConsigneeStep from "./steps/ConsigneeStep";
import ServiceSelectionStep from "./steps/ServiceStep";
import { ConsignorStep } from "./steps/ConsignorStep";
import { ShipmentOwnerStep } from "./steps/ShipmentOwnerStep";
import { createShipmentAction } from "@/actions/book/createShipment.action";
import ShipmentDetailsStep from "./steps/ShipmentDetailStep";
import { TopUpModal } from "@/components/wallet/TopUpModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientToConsignor(client: ClientSummary): BookingFormData["consignor"] {
  return {
    contactName: client.contactName ?? "",
    companyName: client.companyName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: "",
    city: client.city ?? "",
    state: client.state ?? "",
    postalCode: client.postalCode ?? "",
    country: client.country ?? "",
  };
}

function totalDeclaredValue(data: BookingFormData): number {
  return data.items.reduce((s, it) => s + it.unitValue * it.quantity, 0);
}

// Steps validated against RHF-registered fields via getValues() + a zod schema.
// SHIPMENT_DETAILS is intentionally excluded — it's self-managed (array of
// items via updateFormData, not RHF register) and validated separately below.
const RHF_STEP_SCHEMAS: Record<number, any> = {
  [STEP.OWNER]: shipmentOwnerSchema,
  [STEP.CONSIGNOR]: consignorSchema,
  [STEP.CONSIGNEE]: consigneeSchema,
  [STEP.KYC]: kycSchema,
  [STEP.SERVICE]: serviceSchema,
};

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

function SuccessScreen({
  shipmentNumber,
  shipmentId,
  onReset,
}: {
  shipmentNumber: string;
  shipmentId: string;
  onReset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-20">
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <CheckCircle2 className="h-8 w-8 text-foreground" />
          </div>
          <h2 className="mt-6 text-xl font-semibold">Shipment booked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your booking is confirmed and now in the ops queue.
          </p>
          <div className="mt-4 rounded-lg border bg-muted/40 px-6 py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Shipment number
            </p>
            <p className="mt-1 text-2xl font-bold font-mono tracking-wider text-foreground">
              {shipmentNumber}
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" asChild>
              <a href={`/shipments/${shipmentId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View shipment
              </a>
            </Button>
            <Button onClick={onReset}>Book another</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookingWizard
// ---------------------------------------------------------------------------

export default function BookingWizard() {
  const {
    currentStep,
    formData,
    isFirstStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    updateFormData,
    resetBooking,
  } = useBookingWizard();

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState<{
    shipmentId: string;
    shipmentNumber: string;
  } | null>(null);

  // Set only when createShipmentAction fails specifically because the
  // wallet balance is too low. Holding the exact form data that was
  // submitted lets us retry the identical booking once the top-up lands,
  // without the user re-filling or re-clicking through anything.
  const [shortfall, setShortfall] = React.useState<{
    amountRupees: number;
    finalData: BookingFormData;
  } | null>(null);

  const {
    register,
    getValues,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
    reset,
  } = useForm<BookingFormData>({
    mode: "onChange",
    defaultValues: formData,
  });

  // Keep a ref to the latest formData so the reset effect below doesn't need
  // `formData` in its dependency array — previously, `reset(formData)` ran
  // on EVERY keystroke while on the self-managed Shipment Details step
  // (because that step calls updateFormData on every change), needlessly
  // resetting the entire RHF form tree dozens of times per second.
  const formDataRef = React.useRef(formData);
  React.useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  React.useEffect(() => {
    reset(formDataRef.current);
    // Only re-sync the RHF form when navigating between steps, not on every
    // formData mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, reset]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (finalData: BookingFormData) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createShipmentAction(finalData);

      if (result.success) {
        setSubmitted({
          shipmentId: result.shipmentId,
          shipmentNumber: result.shipmentNumber,
        });
        return;
      }

      if (result.insufficientFunds) {
        // Don't surface this as a generic error banner — open the top-up
        // modal instead, prefilled with the shortfall (editable upward),
        // and hold onto finalData so the retry below resubmits the exact
        // same booking once the wallet is funded.
        setShortfall({
          amountRupees: result.insufficientFunds.shortfallRupees,
          finalData,
        });
        return;
      }

      if (result.fieldErrors) {
        Object.entries(result.fieldErrors).forEach(([path, msg]) => {
          setError(path as any, { type: "server", message: msg as string });
        });
      }
      setSubmitError(result.message);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Next / Submit ────────────────────────────────────────────────────────
  const handleNext = async () => {
    setSubmitError(null);

    // Shipment Details is self-managed (array of items, not RHF fields) —
    // it previously skipped validation entirely, meaning a user could
    // advance with zero items. Validate it explicitly against the schema.
    if (currentStep === STEP.SHIPMENT_DETAILS) {
      const result = shipmentDetailsSchema.safeParse(formData);
      if (!result.success) {
        setSubmitError(result.error.issues[0]?.message ?? "Please complete the shipment details.");
        return;
      }
      if (isLastStep) {
        await handleSubmit(formData);
      } else {
        goToNextStep();
      }
      return;
    }

    const currentValues = getValues();
    const merged: BookingFormData & Record<string, any> = {
      ...formData,
      ...currentValues,
    };

    if (currentStep === STEP.OWNER && merged.shipmentOwnerMode === "EXISTING_CLIENT") {
      if (!merged.selectedClient) {
        setError("selectedClient" as any, {
          type: "manual",
          message: "Please select a client to continue.",
        });
        return;
      }
      merged.consignor = clientToConsignor(merged.selectedClient);
    }

    if (currentStep === STEP.KYC) {
      // Computed from real item data now that Shipment Details (step 3)
      // always runs before KYC (step 4) — fixes the bug where IEC
      // requirement was evaluated before any item existed.
      merged._totalDeclaredValue = totalDeclaredValue(formData);
    }

    const schema = RHF_STEP_SCHEMAS[currentStep];
    const result = schema?.safeParse(merged);

    if (result && !result.success) {
      result.error.issues.forEach((issue: any) => {
        setError(issue.path.join(".") as any, {
          type: "manual",
          message: issue.message,
        });
      });
      return;
    }

    clearErrors();
    updateFormData(merged);

    if (isLastStep) {
      await handleSubmit(merged);
    } else {
      goToNextStep();
    }
  };

  // ── Success ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SuccessScreen
        shipmentNumber={submitted.shipmentNumber}
        shipmentId={submitted.shipmentId}
        onReset={() => {
          setSubmitted(null);
          resetBooking();
        }}
      />
    );
  }

  const isSelfMode = watch("shipmentOwnerMode") === "SELF";

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl py-8">
      <Card>
        <CardHeader>
          <ProgressSteps currentStep={currentStep} steps={bookingSteps} />
        </CardHeader>

        <CardContent>
          <div className="space-y-8">
            {currentStep === STEP.OWNER && (
              <ShipmentOwnerStep
                value={watch("shipmentOwnerMode")}
                selectedClient={watch("selectedClient")}
                onModeChange={(v) => {
                  setValue("shipmentOwnerMode", v);
                  if (v !== "EXISTING_CLIENT") setValue("selectedClient", null);
                  clearErrors();
                }}
                onClientChange={(c) => {
                  setValue("selectedClient", c);
                  clearErrors("selectedClient" as any);
                }}
                clientError={(errors as any).selectedClient?.message}
              />
            )}

            {currentStep === STEP.CONSIGNOR && (
              <ConsignorStep
                register={register}
                errors={errors}
                watch={watch}
                setValue={setValue}
                isSelfMode={isSelfMode}
              />
            )}

            {currentStep === STEP.CONSIGNEE && (
              <ConsigneeStep
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
              />
            )}

            {currentStep === STEP.SHIPMENT_DETAILS && (
              <ShipmentDetailsStep
                data={formData}
                onChange={(partial) => updateFormData(partial as Partial<BookingFormData>)}
                error={submitError ?? undefined}
              />
            )}

            {currentStep === STEP.KYC && (
              <KycStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                totalDeclaredValue={totalDeclaredValue(formData)}
              />
            )}

            {currentStep === STEP.SERVICE && (
              <ServiceSelectionStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                formData={formData}
              />
            )}

            {currentStep === STEP.REVIEW && <ReviewStep data={formData} />}

            {/* Submit error — not shown on the Shipment Details step, which renders
                its own inline error via the `error` prop above. */}
            {submitError && currentStep !== STEP.SHIPMENT_DETAILS && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" aria-live="polite">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-destructive">{submitError}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between border-t pt-6">
              <Button
                type="button"
                variant="outline"
                disabled={isFirstStep || submitting}
                onClick={goToPreviousStep}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <Button type="button" disabled={submitting} onClick={handleNext}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : isLastStep ? (
                  "Submit booking"
                ) : (
                  <>
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insufficient-funds top-up — prefilled with the shortfall, editable
          upward. On success, silently retries the exact same booking. */}
      {shortfall && (
        <TopUpModal
          open={!!shortfall}
          onOpenChange={(open) => {
            if (!open) setShortfall(null);
          }}
          suggestedAmount={shortfall.amountRupees}
          reasonLabel={`shipment ${formData.consignor.city || "?"} → ${formData.consignee.city || "?"}`}
          onSuccess={async () => {
            const pending = shortfall.finalData;
            setShortfall(null);
            await handleSubmit(pending);
          }}
        />
      )}
    </div>
  );
}