"use client";

import { useState } from "react";

import {
  Shield,
  Package,
  MapPinned,
  Truck,
  CheckCircle,
  Building,
  Home,
} from "lucide-react";
import { BookingFormData, BookingStep } from "@/types/booking.types";
import type { BookingDraftPayload } from "@/actions/book/bookingDraft.action";

// ---------------------------------------------------------------------------
// Step keys — the wizard is keyed by these STABLE string ids, never by raw
// numeric indices, because the step list is DYNAMIC: the first-mile (door →
// hub) step only exists when the customer opted into door pickup. Driving
// everything (rendering, schema lookup, progress bar) off the key at the
// current position keeps navigation correct whether the list has 6 or 7 steps.
// ---------------------------------------------------------------------------

export const STEP_KEY = {
  SENDER: "sender", // merged "who's shipping" + sender address + pickup address
  CONSIGNEE: "consignee", // delivery + billing
  SHIPMENT_DETAILS: "shipment-details", // merged Invoice + Packages — self-managed, not RHF
  KYC: "kyc",
  SERVICE: "service", // international carrier
  FIRST_MILE: "first-mile", // door → hub domestic courier — CONDITIONAL
  REVIEW: "review",
} as const;

export type StepKey = (typeof STEP_KEY)[keyof typeof STEP_KEY];

interface BookingStepDef extends BookingStep {
  key: StepKey;
}

// The full ordered set. `first-mile` is filtered out unless pickup was opted
// into (see getActiveSteps). Keep this array in the intended display order.
const ALL_BOOKING_STEPS: BookingStepDef[] = [
  { id: "sender", key: STEP_KEY.SENDER, name: "Sender", icon: Building },
  { id: "consignee", key: STEP_KEY.CONSIGNEE, name: "Receiver", icon: MapPinned },
  { id: "shipment-details", key: STEP_KEY.SHIPMENT_DETAILS, name: "Items", icon: Package },
  { id: "kyc", key: STEP_KEY.KYC, name: "KYC", icon: Shield },
  { id: "service", key: STEP_KEY.SERVICE, name: "Rates", icon: Truck },
  { id: "first-mile", key: STEP_KEY.FIRST_MILE, name: "Pickup", icon: Home },
  { id: "review", key: STEP_KEY.REVIEW, name: "Review", icon: CheckCircle },
];

/**
 * The steps that actually apply to this booking. The first-mile step is only
 * present when door pickup was opted into on the Packages step — pickupIncluded
 * is always settled before the wizard reaches any step after SERVICE, so the
 * active list (and therefore the meaning of each index) is stable by then.
 */
export function getActiveSteps(pickupIncluded: boolean): BookingStepDef[] {
  return ALL_BOOKING_STEPS.filter(
    (s) => s.key !== STEP_KEY.FIRST_MILE || pickupIncluded,
  );
}

const initialFormData: BookingFormData = {
  shipmentOwnerMode: "SELF",

  selectedClient: null,

  sameAsConsignor: false,

  kycDocs: {
    companyPan: null,
    pan: null,
    aadhaar: null,
    gst: null,
    iec: null,
    lut: null,
  },

  consignor: {
    contactName: "",
    companyName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  },

  pickupSameAsSender: true,
  pickup: {
    contactName: "",
    companyName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
  },

  consignee: {
    contactName: "",
    companyName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  },

  billingSameAsDelivery: true,
  billing: {
    contactName: "",
    companyName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  },

  shipmentType: "CSB4",
  pickupIncluded: false,

  invoiceMode: "GENERATE",
  uploadedInvoice: null,
  invoiceNumber: "",
  currency: "INR",
  boxes: [],

  selectedService: null,
  firstMile: null,
  firstMileHubLabel: null,
};

export function useBookingWizard(initialDraft?: BookingDraftPayload | null) {
  // A resumed draft seeds both the step and the form data. Merge over
  // `initialFormData` so a draft saved by an older wizard build (missing
  // newer fields) still hydrates cleanly instead of leaving fields undefined.
  const draftData = (initialDraft?.data ?? null) as Partial<BookingFormData> | null;

  const [rawStep, setCurrentStep] = useState(initialDraft?.currentStep ?? 0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<BookingFormData>(
    draftData ? { ...initialFormData, ...draftData } : initialFormData,
  );

  // The active step list depends on whether door pickup was opted into. Derive
  // it every render from the current form data so toggling pickup on the
  // Packages step immediately reshapes the wizard (and its progress bar).
  const steps = getActiveSteps(formData.pickupIncluded);

  // Clamp defensively: if the list ever shrinks under a stored index (e.g. a
  // resumed draft, or pickup toggled off), never point past the end.
  const currentStep = Math.min(Math.max(rawStep, 0), steps.length - 1);
  const currentStepKey = steps[currentStep]?.key;

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const goToNextStep = () => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const updateFormData = (newData: Partial<BookingFormData>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  };

  const submitBooking = (data: BookingFormData) => {
    console.log("Shipment Booking:", data);
    setIsSubmitted(true);
  };

  const resetBooking = () => {
    setCurrentStep(0);
    setFormData(initialFormData);
    setIsSubmitted(false);
  };

  return {
    currentStep,
    currentStepKey,
    steps,
    formData,
    isFirstStep,
    isLastStep,
    isSubmitted,
    goToNextStep,
    goToPreviousStep,
    updateFormData,
    submitBooking,
    resetBooking,
  };
}