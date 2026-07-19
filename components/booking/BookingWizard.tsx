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

import type {
  BookingFormData,
  BookingOrgContext,
} from "@/types/booking.types";
import { useBookingWizard, STEP_KEY } from "@/hooks/useBookingWizard";
import {
  saveBookingDraft,
  clearBookingDraft,
  type BookingDraftPayload,
} from "@/actions/book/bookingDraft.action";
import {
  senderPickupSchema,
  deliveryBillingSchema,
  shipmentDetailsSchema,
  kycSchema,
  serviceSchema,
  firstMileSchema,
} from "@/types/booking.schema";

import ProgressSteps from "./ProgessSteps";
import ReviewStep from "./steps/ReviewStep";
import KycStep from "./steps/KycStep";
import ServiceSelectionStep from "./steps/ServiceStep";
import FirstMileStep from "./steps/FirstMileStep";
import { SenderPickupStep } from "./steps/SenderPickupStep";
import { DeliveryBillingStep } from "./steps/DeliveryBillingStep";
import { createShipmentAction } from "@/actions/book/createShipment.action";
import ShipmentDetailsStep from "./steps/ShipmentDetailStep";
import { TopUpModal } from "@/components/wallet/TopUpModal";

// Steps validated against RHF-registered fields via getValues() + a zod schema,
// keyed by the step's stable key (the list is dynamic — see useBookingWizard).
// SHIPMENT_DETAILS is intentionally excluded — it's self-managed (array of
// items via updateFormData, not RHF register) and validated separately below.
const RHF_STEP_SCHEMAS: Record<string, any> = {
  [STEP_KEY.SENDER]: senderPickupSchema,
  [STEP_KEY.CONSIGNEE]: deliveryBillingSchema,
  [STEP_KEY.KYC]: kycSchema,
  [STEP_KEY.SERVICE]: serviceSchema,
  [STEP_KEY.FIRST_MILE]: firstMileSchema,
};

// ---------------------------------------------------------------------------
// Wallet status the Review step reports up, used to gate the submit button.
// `loading: true` / `sufficient: false` is the safe default — the button
// stays disabled until a fresh balance check explicitly clears it.
// ---------------------------------------------------------------------------

interface WalletStatus {
  loading: boolean;
  sufficient: boolean;
}

const WALLET_STATUS_UNKNOWN: WalletStatus = { loading: true, sufficient: false };

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

interface BookingWizardProps {
  orgContext: BookingOrgContext;
  initialDraft: BookingDraftPayload | null;
}

export default function BookingWizard({
  orgContext,
  initialDraft,
}: BookingWizardProps) {
  const {
    currentStep,
    currentStepKey,
    steps,
    formData,
    isFirstStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    updateFormData,
    resetBooking,
  } = useBookingWizard(initialDraft);

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // "Save & Next" persists the wizard state to a BookingDraft after each step
  // validates, so the user can leave and resume. `savingDraft` drives the
  // button's saving state; `draftResumed` shows a one-time "resumed" banner.
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [draftResumed, setDraftResumed] = React.useState(!!initialDraft);

  // `submitting` (React state) only updates on the next render, so if the
  // auto-submit fired from onTopUpSuccess and a manual button click land
  // within the same tick, both can read submitting === false and both
  // call handleSubmit — which is how two createShipmentAction calls with
  // identical data ended up racing each other. A ref updates synchronously,
  // closing that window regardless of render timing.
  const submitLockRef = React.useRef(false);
  const [submitted, setSubmitted] = React.useState<{
    shipmentId: string;
    shipmentNumber: string;
  } | null>(null);

  // Set only when createShipmentAction fails specifically because the
  // wallet balance is too low. Holding the exact form data that was
  // submitted lets us retry the identical booking once the top-up lands,
  // without the user re-filling or re-clicking through anything. This is
  // the server-side safety net — it stays even though the button below is
  // now gated client-side too, because balance can still drift between
  // the Review check and the click (concurrent tab, concurrent shipment).
  const [shortfall, setShortfall] = React.useState<{
    amountRupees: number;
    finalData: BookingFormData;
  } | null>(null);

  // Reported up by ReviewStep's WalletPaymentSummary. Drives whether the
  // "Pay & Place Booking" button is enabled on the last step.
  const [walletStatus, setWalletStatus] = React.useState<WalletStatus>(WALLET_STATUS_UNKNOWN);

  // Reset to "unknown" every time Review is (re-)entered, so a stale
  // `sufficient: true` from a previous visit to this step can never enable
  // Pay before a fresh balance check completes.
  React.useEffect(() => {
    if (currentStepKey === STEP_KEY.REVIEW) {
      setWalletStatus(WALLET_STATUS_UNKNOWN);
    }
  }, [currentStepKey]);

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
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createShipmentAction(finalData);

      if (result.success) {
        // Booking is now a real Shipment — the draft has served its purpose.
        // Fire-and-forget: a failed cleanup shouldn't block the success screen.
        void clearBookingDraft();
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
      submitLockRef.current = false;
    }
  };

  // Persist the wizard state as a BookingDraft, then advance. Saving to the
  // step the user is moving TO (currentStep + 1) so a resume lands them there.
  // A failed save is non-fatal — we still advance; the next "Save & Next"
  // re-attempts persistence. The `draftResumed` banner is dismissed on the
  // first save so it doesn't linger past the resumed step.
  const saveDraftAndNext = async (data: BookingFormData) => {
    setSavingDraft(true);
    try {
      await saveBookingDraft(currentStep + 1, data);
    } catch {
      // swallow — advancing without a saved draft is acceptable degradation
    } finally {
      setSavingDraft(false);
      setDraftResumed(false);
    }
    goToNextStep();
  };

  // ── Next / Submit ────────────────────────────────────────────────────────
  const handleNext = async () => {
    setSubmitError(null);

    // Shipment Details is self-managed (array of items, not RHF fields) —
    // it previously skipped validation entirely, meaning a user could
    // advance with zero items. Validate it explicitly against the schema.
    if (currentStepKey === STEP_KEY.SHIPMENT_DETAILS) {
      const result = shipmentDetailsSchema.safeParse(formData);
      if (!result.success) {
        setSubmitError(result.error.issues[0]?.message ?? "Please complete the shipment details.");
        return;
      }
      if (isLastStep) {
        await handleSubmit(formData);
      } else {
        await saveDraftAndNext(formData);
      }
      return;
    }

    const currentValues = getValues();
    const merged: BookingFormData & Record<string, any> = {
      ...formData,
      ...currentValues,
    };

    // KYC requirements now branch by shipmentType (read straight off the
    // merged form via kycSchema) — no injected value needed.

    const schema = RHF_STEP_SCHEMAS[currentStepKey ?? ""];
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
      // On Review, formData (merged with nothing new — Review has no RHF
      // fields) is already the complete payload. The wallet gate below
      // ensures this only fires once balance has been confirmed sufficient.
      await handleSubmit(merged);
    } else {
      await saveDraftAndNext(merged);
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

  // On the Review step, the Pay button stays disabled until we've
  // confirmed (via WalletPaymentSummary's callback) that the balance is
  // sufficient. If there's somehow no selected service yet, don't block —
  // the schema validation earlier in the wizard already guards against
  // reaching Review without one, and ServiceBlock/ReviewStep surface that
  // as an error state instead.
  const walletBlocking =
    isLastStep &&
    !!formData.selectedService &&
    (walletStatus.loading || !walletStatus.sufficient);

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl py-8">
      <Card>
        <CardHeader>
          <ProgressSteps currentStep={currentStep} steps={steps} />
        </CardHeader>

        <CardContent>
          {draftResumed && (
            <div className="mb-6 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-muted-foreground">
                Resumed your saved booking — pick up where you left off. Your
                progress is saved each time you continue.
              </span>
            </div>
          )}

          <div className="space-y-8">
            {currentStepKey === STEP_KEY.SENDER && (
              <SenderPickupStep
                orgContext={orgContext}
                register={register}
                watch={watch}
                setValue={setValue}
                clearErrors={clearErrors}
                errors={errors}
                clientError={(errors as any).selectedClient?.message}
              />
            )}

            {currentStepKey === STEP_KEY.CONSIGNEE && (
              <DeliveryBillingStep
                orgContext={orgContext}
                register={register}
                watch={watch}
                setValue={setValue}
                clearErrors={clearErrors}
                errors={errors}
              />
            )}

            {currentStepKey === STEP_KEY.SHIPMENT_DETAILS && (
              <ShipmentDetailsStep
                data={formData}
                onChange={(partial) => updateFormData(partial as Partial<BookingFormData>)}
                error={submitError ?? undefined}
              />
            )}

            {currentStepKey === STEP_KEY.KYC && (
              <KycStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                shipmentType={formData.shipmentType}
                party={
                  formData.shipmentOwnerMode === "EXISTING_CLIENT" && formData.selectedClient
                    ? { partyType: "CLIENT", clientId: formData.selectedClient.id }
                    : { partyType: "ORG", orgId: orgContext.orgId }
                }
              />
            )}

            {currentStepKey === STEP_KEY.SERVICE && (
              <ServiceSelectionStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                formData={formData}
              />
            )}

            {currentStepKey === STEP_KEY.FIRST_MILE && (
              <FirstMileStep
                watch={watch}
                setValue={setValue}
                errors={errors}
                formData={formData}
              />
            )}

            {currentStepKey === STEP_KEY.REVIEW && (
              <ReviewStep
                data={formData}
                onWalletStatusChange={(info) =>
                  setWalletStatus({ loading: info.loading, sufficient: info.sufficient })
                }
                onTopUpSuccess={() => {
                  // Balance just cleared via the inline top-up — complete
                  // the booking automatically instead of making the user
                  // click Pay a second time.
                  handleSubmit(formData);
                }}
              />
            )}

            {/* Submit error — not shown on the Shipment Details step, which renders
                its own inline error via the `error` prop above. */}
            {submitError && currentStepKey !== STEP_KEY.SHIPMENT_DETAILS && (
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

              <div className="flex flex-col items-end gap-1.5">
                <Button
                  type="button"
                  disabled={submitting || savingDraft || walletBlocking}
                  onClick={handleNext}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isLastStep ? "Placing booking…" : "Submitting…"}
                    </>
                  ) : savingDraft ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : isLastStep ? (
                    "Pay & Place Booking"
                  ) : (
                    <>
                      Save &amp; Next
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                {walletBlocking && !walletStatus.loading && (
                  <p className="text-xs text-muted-foreground">
                    Top up your wallet above to continue.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Server-side insufficient-funds fallback — prefilled with the
          shortfall, editable upward. Covers the case where balance was
          sufficient at the Review check but drifted before the atomic
          debit ran (e.g. a concurrent shipment in another tab). On
          success, silently retries the exact same booking. */}
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