"use client";

import React from "react";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import type { ZodSchema } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import type { BookingFormData, ClientSummary } from "@/types/booking.types";
import { bookingSteps, useBookingWizard } from "@/hooks/useBookingWizard";

import ProgressSteps from "./ProgessSteps";
import ReviewStep from "./steps/ReviewStep";
import PackagesStep from "./steps/PackageStep";
import InvoiceStep from "./steps/InvoiceStep";
import KycStep from "./steps/KycStep";
import ConsigneeStep from "./steps/ConsigneeStep";
import ServiceSelectionStep from "./steps/ServiceStep";
import { ConsignorStep } from "./steps/ConsignorStep";
import { ShipmentOwnerStep } from "./steps/ShipmentOwnerStep";

// ---------------------------------------------------------------------------
// Maps a selected ClientSummary into the consignor sub-object.
// Called when the user picks EXISTING_CLIENT and clicks Next.
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

// ---------------------------------------------------------------------------
// Steps 4 & 5 manage their own state via updateFormData directly (not RHF)
// so we skip schema validation for them and just advance.
// ---------------------------------------------------------------------------
const SELF_MANAGED_STEPS = new Set([4, 5]);

export default function BookingWizard() {
  const {
    currentStep,
    formData,
    isFirstStep,
    isLastStep,
    isSubmitted,
    goToNextStep,
    goToPreviousStep,
    updateFormData,
    submitBooking,
    resetBooking,
    getCurrentStepSchema,
  } = useBookingWizard();

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

  // Re-sync RHF state whenever the wizard step changes or formData is updated
  // (e.g. after populating consignor from a selected client).
  React.useEffect(() => {
    reset(formData);
  }, [currentStep, formData, reset]);

  const handleNext = () => {
    // ── Self-managed steps ──────────────────────────────────────────────────
    if (SELF_MANAGED_STEPS.has(currentStep)) {
      isLastStep ? submitBooking(formData) : goToNextStep();
      return;
    }

    // ── RHF-managed steps ───────────────────────────────────────────────────
    const currentValues = getValues();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: BookingFormData & Record<string, any> = { ...formData, ...currentValues };

    // Step 0: if EXISTING_CLIENT, copy client → consignor so ConsignorStep
    // opens pre-filled on the next step.
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

    // Step 3 (KYC): inject the total declared value from persisted package
    // data so kycSchema can conditionally require IEC above ₹25,000.
    if (currentStep === 3) {
      merged._totalDeclaredValue = formData.packages.reduce(
        (sum, p) => sum + p.declaredValue * p.quantity,
        0,
      );
    }

    // Validate against the current step's Zod schema only.
    const schema = getCurrentStepSchema() as ZodSchema;
    const result = schema.safeParse(merged);

    if (!result.success) {
      // .issues is the canonical ZodError property (.errors is an alias that
      // isn't present in all Zod versions — always use .issues).
      result.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        setError(path as any, { type: "manual", message: issue.message });
      });
      return;
    }

    clearErrors();
    updateFormData(merged);
    isLastStep ? submitBooking(merged) : goToNextStep();
  };

  if (isSubmitted) {
    return (
      <div className="mx-auto max-w-xl py-20">
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <CheckCircle2 className="h-16 w-16 text-green-600" />
            <h2 className="mt-6 text-2xl font-semibold">Shipment Booked</h2>
            <p className="mt-2 text-center text-muted-foreground">
              Your shipment booking has been submitted successfully.
            </p>
            <Button className="mt-6" onClick={resetBooking}>
              Create Another Shipment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl py-8">
      <Card>
        <CardHeader>
          <ProgressSteps currentStep={currentStep} steps={bookingSteps} />
        </CardHeader>

        <CardContent>
          <div className="space-y-8">

            {/* Step 0 — Who is shipping? */}
            {currentStep === 0 && (
              <ShipmentOwnerStep
                value={watch("shipmentOwnerMode")}
                selectedClient={watch("selectedClient")}
                onModeChange={(v) => {
                  setValue("shipmentOwnerMode", v);
                  // Clear client selection when switching away from EXISTING_CLIENT
                  if (v !== "EXISTING_CLIENT") {
                    setValue("selectedClient", null);
                  }
                  clearErrors();
                }}
                onClientChange={(c) => {
                  setValue("selectedClient", c);
                  clearErrors("selectedClient" as any);
                }}
                // Surface "please select a client" error if set
                clientError={(errors as any).selectedClient?.message}
              />
            )}

            {/* Step 1 — Consignor (sender) details */}
            {currentStep === 1 && (
              <ConsignorStep register={register} errors={errors} />
            )}

            {/* Step 2 — Consignee (receiver) details */}
            {currentStep === 2 && (
              <ConsigneeStep
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
              />
            )}

            {/* Step 3 — KYC documents
                totalDeclaredValue is computed from persisted formData packages
                (packages are self-managed, so use formData not watch()) */}
            {currentStep === 3 && (
              <KycStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                totalDeclaredValue={formData.packages.reduce(
                  (sum, p) => sum + p.declaredValue * p.quantity,
                  0,
                )}
              />
            )}

            {/* Step 4 — Invoice (self-managed) */}
            {currentStep === 4 && (
              <InvoiceStep
                data={formData}
                onChange={(partial) =>
                  updateFormData(partial as Partial<BookingFormData>)
                }
              />
            )}

            {/* Step 5 — Packages (self-managed) */}
            {currentStep === 5 && (
              <PackagesStep
                data={formData}
                onChange={(partial) =>
                  updateFormData(partial as Partial<BookingFormData>)
                }
              />
            )}

            {/* Step 6 — Rate / service selection */}
            {currentStep === 6 && (
              <ServiceSelectionStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                formData={formData}
              />
            )}

            {/* Step 7 — Review & confirm */}
            {currentStep === 7 && <ReviewStep data={formData} />}

            {/* Navigation */}
            <div className="flex items-center justify-between border-t pt-6">
              <Button
                type="button"
                variant="outline"
                disabled={isFirstStep}
                onClick={goToPreviousStep}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <Button type="button" onClick={handleNext}>
                {isLastStep ? "Submit Booking" : "Next"}
                {!isLastStep && <ChevronRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}