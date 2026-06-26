"use client";

import React from "react";
import {
  ChevronLeft, ChevronRight, CheckCircle2,
  Loader2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { useForm } from "react-hook-form";
import type { ZodSchema } from "zod";

import { Button }                   from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { BookingFormData, ClientSummary } from "@/types/booking.types";
import { bookingSteps, useBookingWizard }      from "@/hooks/useBookingWizard";
 

import ProgressSteps        from "./ProgessSteps";
import ReviewStep           from "./steps/ReviewStep";
import PackagesStep         from "./steps/PackageStep";
import InvoiceStep          from "./steps/InvoiceStep";
import KycStep              from "./steps/KycStep";
import ConsigneeStep        from "./steps/ConsigneeStep";
import ServiceSelectionStep from "./steps/ServiceStep";
import { ConsignorStep }    from "./steps/ConsignorStep";
import { ShipmentOwnerStep } from "./steps/ShipmentOwnerStep";
import { createShipmentAction } from "@/actions/book/createShipment.action";

// ---------------------------------------------------------------------------
// Maps a ClientSummary → consignor shape so ConsignorStep opens pre-filled
// ---------------------------------------------------------------------------
function clientToConsignor(client: ClientSummary): BookingFormData["consignor"] {
  return {
    contactName:  client.contactName  ?? "",
    companyName:  client.companyName  ?? "",
    email:        client.email        ?? "",
    phone:        client.phone        ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: "",
    city:         client.city         ?? "",
    state:        client.state        ?? "",
    postalCode:   client.postalCode   ?? "",
    country:      client.country      ?? "",
  };
}

// Steps 4 & 5 (Invoice / Packages) use updateFormData directly, not RHF
const SELF_MANAGED_STEPS = new Set([4, 5]);

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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-6 text-xl font-semibold">Shipment Booked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your booking has been confirmed and is now in the ops queue.
          </p>
          <div className="mt-4 rounded-lg border bg-muted/40 px-6 py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Shipment Number
            </p>
            <p className="mt-1 text-2xl font-bold font-mono tracking-wider text-foreground">
              {shipmentNumber}
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" asChild>
              <a href={`/shipments/${shipmentId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Shipment
              </a>
            </Button>
            <Button onClick={onReset}>Book Another</Button>
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
    getCurrentStepSchema,
  } = useBookingWizard();

  // Submission state lives here — not in the hook — because it needs the
  // server action result (shipmentId, shipmentNumber, error message).
  const [submitting, setSubmitting]   = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted]     = React.useState<{
    shipmentId: string;
    shipmentNumber: string;
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

  React.useEffect(() => {
    reset(formData);
  }, [currentStep, formData, reset]);

  // ── Submit to DB ──────────────────────────────────────────────────────────
  const handleSubmit = async (finalData: BookingFormData) => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      const result = await createShipmentAction(finalData);

      if (result.success) {
        setSubmitted({
          shipmentId:     result.shipmentId,
          shipmentNumber: result.shipmentNumber,
        });
        return;
      }

      // Surface field-level errors back into RHF if returned
      if (result.fieldErrors) {
        Object.entries(result.fieldErrors).forEach(([path, msg]) => {
          setError(path as any, { type: "server", message: msg });
        });
      }
      setSubmitError(result.message);
    } catch (err) {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Next / Submit button handler ──────────────────────────────────────────
  const handleNext = async () => {
    setSubmitError(null);

    // Self-managed steps (Invoice, Packages) — advance without RHF validation
    if (SELF_MANAGED_STEPS.has(currentStep)) {
      if (isLastStep) {
        await handleSubmit(formData);
      } else {
        goToNextStep();
      }
      return;
    }

    const currentValues = getValues();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: BookingFormData & Record<string, any> = { ...formData, ...currentValues };

    // Step 0: copy client → consignor for pre-fill
    if (currentStep === 0 && merged.shipmentOwnerMode === "EXISTING_CLIENT") {
      if (!merged.selectedClient) {
        setError("selectedClient" as any, {
          type: "manual",
          message: "Please select a client to continue.",
        });
        return;
      }
      merged.consignor = clientToConsignor(merged.selectedClient);
    }

    // Step 3 (KYC): inject declared total so schema can conditionally require IEC
    if (currentStep === 3) {
      merged._totalDeclaredValue = formData.packages.reduce(
        (sum, p) => sum + p.declaredValue * p.quantity,
        0,
      );
    }

    // Per-step Zod validation
    const schema = getCurrentStepSchema() as ZodSchema;
    const result = schema.safeParse(merged);

    if (!result.success) {
      result.error.issues.forEach((issue) => {
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

  // ── Success screen ────────────────────────────────────────────────────────
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

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl py-8">
      <Card>
        <CardHeader>
          <ProgressSteps currentStep={currentStep} steps={bookingSteps} />
        </CardHeader>

        <CardContent>
          <div className="space-y-8">

            {currentStep === 0 && (
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

            {currentStep === 1 && (
              <ConsignorStep register={register} errors={errors} />
            )}

            {currentStep === 2 && (
              <ConsigneeStep
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
              />
            )}

            {currentStep === 3 && (
              <KycStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                totalDeclaredValue={formData.packages.reduce(
                  (s, p) => s + p.declaredValue * p.quantity,
                  0,
                )}
              />
            )}

            {currentStep === 4 && (
              <InvoiceStep
                data={formData}
                onChange={(partial) =>
                  updateFormData(partial as Partial<BookingFormData>)
                }
              />
            )}

            {currentStep === 5 && (
              <PackagesStep
                data={formData}
                onChange={(partial) =>
                  updateFormData(partial as Partial<BookingFormData>)
                }
              />
            )}

            {currentStep === 6 && (
              <ServiceSelectionStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                formData={formData}
              />
            )}

            {currentStep === 7 && <ReviewStep data={formData} />}

            {/* Server-side submission error */}
            {submitError && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
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

              <Button
                type="button"
                disabled={submitting}
                onClick={handleNext}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : isLastStep ? (
                  "Submit Booking"
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
    </div>
  );
}