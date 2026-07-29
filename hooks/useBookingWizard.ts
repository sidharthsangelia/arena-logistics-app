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
  Globe,
} from "lucide-react";
import {
  BookingFormData,
  BookingOrgContext,
  BookingStep,
} from "@/types/booking.types";
import type { BookingDraftPayload } from "@/actions/book/bookingDraft.action";
import { hasSavedProfile, selfToConsignor } from "@/lib/booking/consignorPrefill";
import { EMPTY_DOMESTIC_DOCS, isCompanyParty } from "@/lib/booking/domesticDocs";

// ---------------------------------------------------------------------------
// Step keys — the wizard is keyed by these STABLE string ids, never by raw
// numeric indices, because the step list is DYNAMIC: the first-mile (door →
// hub) step only exists when the customer opted into door pickup, and a whole
// different subset applies once the booking is domestic. Driving everything
// (rendering, schema lookup, progress bar) off the key at the current position
// keeps navigation correct whatever length the list happens to be.
// ---------------------------------------------------------------------------

export const STEP_KEY = {
  MODE: "mode", // international or domestic — shapes every step after it
  SENDER: "sender", // merged "who's shipping" + sender address + pickup address
  CONSIGNEE: "consignee", // delivery + billing
  SHIPMENT_DETAILS: "shipment-details", // merged Invoice + Packages — self-managed, not RHF
  KYC: "kyc",
  SERVICE: "service", // carrier — international network, or domestic couriers
  FIRST_MILE: "first-mile", // door → hub domestic courier — INTERNATIONAL ONLY, CONDITIONAL
  REVIEW: "review",
} as const;

export type StepKey = (typeof STEP_KEY)[keyof typeof STEP_KEY];

interface BookingStepDef extends BookingStep {
  key: StepKey;
}

// The full ordered set. Steps are filtered out per booking (see
// getActiveSteps). Keep this array in the intended display order.
const ALL_BOOKING_STEPS: BookingStepDef[] = [
  { id: "mode", key: STEP_KEY.MODE, name: "Type", icon: Globe },
  { id: "sender", key: STEP_KEY.SENDER, name: "Sender", icon: Building },
  { id: "consignee", key: STEP_KEY.CONSIGNEE, name: "Receiver", icon: MapPinned },
  { id: "shipment-details", key: STEP_KEY.SHIPMENT_DETAILS, name: "Items", icon: Package },
  { id: "kyc", key: STEP_KEY.KYC, name: "KYC", icon: Shield },
  { id: "service", key: STEP_KEY.SERVICE, name: "Rates", icon: Truck },
  { id: "first-mile", key: STEP_KEY.FIRST_MILE, name: "Pickup", icon: Home },
  { id: "review", key: STEP_KEY.REVIEW, name: "Review", icon: CheckCircle },
];

/**
 * The steps that actually apply to this booking.
 *
 * Two things are filtered out, and both are settled well before the wizard can
 * reach them, so the active list (and therefore the meaning of each index) is
 * stable by the time it matters:
 *
 *  • FIRST_MILE — international only, and only when door pickup was opted into
 *    on the Items step. A domestic booking is a single door → door courier
 *    move: there is no separate first leg to price.
 *
 *  • KYC — on a domestic booking, only when the sender is an INDIVIDUAL. A
 *    company sender is identified by the tax invoice it has to attach, so there
 *    is no party document left to ask for and the step would render empty.
 *    Always present on an international booking, where the export matrix
 *    (PAN / Aadhaar / GST / IEC / LUT) applies regardless.
 */
export function getActiveSteps(data: {
  mode: BookingFormData["mode"];
  pickupIncluded: boolean;
  senderIsCompany: boolean;
}): BookingStepDef[] {
  const isDomestic = data.mode === "DOMESTIC";

  return ALL_BOOKING_STEPS.filter((s) => {
    if (s.key === STEP_KEY.FIRST_MILE) {
      return !isDomestic && data.pickupIncluded;
    }
    if (s.key === STEP_KEY.KYC) {
      return !isDomestic || !data.senderIsCompany;
    }
    return true;
  });
}

const initialFormData: BookingFormData = {
  // Deliberately NOT defaulted to a mode that lets the user skip the choice:
  // the step is always shown and always answered. INTERNATIONAL here is just
  // the shape the rest of the form starts in, and matches how every shipment
  // booked before domestic existed is recorded.
  mode: "INTERNATIONAL",

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

  domesticDocs: EMPTY_DOMESTIC_DOCS,
  codEnabled: false,

  selectedService: null,
  firstMile: null,
  firstMileHubLabel: null,
};

export function useBookingWizard(
  orgContext: BookingOrgContext,
  initialDraft?: BookingDraftPayload | null,
) {
  // A resumed draft seeds both the step and the form data. Merge over
  // `initialFormData` so a draft saved by an older wizard build (missing
  // newer fields) still hydrates cleanly instead of leaving fields undefined.
  const draftData = (initialDraft?.data ?? null) as Partial<BookingFormData> | null;

  const [rawStep, setCurrentStep] = useState(initialDraft?.currentStep ?? 0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Sender defaults to "My self" (see initialFormData), so seed `consignor`
  // from the org profile right here in the initial state rather than via a
  // post-mount effect. Doing it eagerly means the form is correct on the
  // very first render — no empty-then-filled flash, and nothing for the
  // wizard's step-change `reset()` (BookingWizard.tsx) to stomp on later.
  // Skipped when resuming a draft — the draft's own consignor wins.
  const [formData, setFormData] = useState<BookingFormData>(() => {
    if (draftData) return { ...initialFormData, ...draftData };
    if (hasSavedProfile(orgContext.self)) {
      const consignor = selfToConsignor(orgContext.self);
      // pickupSameAsSender defaults to true, and the step's mirroring effect
      // only reacts to FUTURE watch changes — it won't fire just because
      // consignor already differs from pickup at mount. Seed both here so
      // they start in sync.
      return { ...initialFormData, consignor, pickup: consignor };
    }
    return initialFormData;
  });

  // The active step list depends on the mode, on whether door pickup was opted
  // into, and — for domestic — on whether the sender is a company. Derived
  // every render from the current form data so choosing a mode, toggling
  // pickup, or typing a company name into the sender immediately reshapes the
  // wizard and its progress bar.
  const steps = getActiveSteps({
    mode: formData.mode,
    pickupIncluded: formData.pickupIncluded,
    senderIsCompany: isCompanyParty(formData.consignor),
  });

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