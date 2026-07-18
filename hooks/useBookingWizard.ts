"use client";

import { useState } from "react";

import {
  Shield,
  Package,
  MapPinned,
  Truck,
  CheckCircle,
  Building,
} from "lucide-react";
import { BookingFormData, BookingStep } from "@/types/booking.types";
import { stepSchemas } from "@/types/booking.schema";
import type { BookingDraftPayload } from "@/actions/book/bookingDraft.action";

// ---------------------------------------------------------------------------
// Named step indices — avoids magic numbers scattered across BookingWizard.
// MUST stay in sync with `bookingSteps` below and `stepSchemas` in
// booking.schema.ts.
// ---------------------------------------------------------------------------

export const STEP = {
  SENDER: 0, // merged "who's shipping" + sender address + pickup address
  CONSIGNEE: 1,
  SHIPMENT_DETAILS: 2, // merged Invoice + Packages — self-managed, not RHF
  KYC: 3,
  SERVICE: 4,
  REVIEW: 5,
} as const;

export const bookingSteps: BookingStep[] = [
  { id: "sender", name: "Sender", icon: Building },
  { id: "consignee", name: "Receiver", icon: MapPinned },
  { id: "shipment-details", name: "Items", icon: Package },
  { id: "kyc", name: "KYC", icon: Shield },
  { id: "service", name: "Rates", icon: Truck },
  { id: "review", name: "Review", icon: CheckCircle },
];

const initialFormData: BookingFormData = {
  shipmentOwnerMode: "SELF",

  selectedClient: null,

  sameAsConsignor: false,

  kycDocs: {
    pan: null,
    aadhaar: null,
    gst: null,
    iec: null,
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

  invoiceMode: "GENERATE",
  uploadedInvoice: null,
  invoiceNumber: "",
  currency: "INR",
  items: [],

  selectedService: null,
};

export function useBookingWizard(initialDraft?: BookingDraftPayload | null) {
  // A resumed draft seeds both the step and the form data. Merge over
  // `initialFormData` so a draft saved by an older wizard build (missing
  // newer fields) still hydrates cleanly instead of leaving fields undefined.
  const draftData = (initialDraft?.data ?? null) as Partial<BookingFormData> | null;

  const [currentStep, setCurrentStep] = useState(initialDraft?.currentStep ?? 0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<BookingFormData>(
    draftData ? { ...initialFormData, ...draftData } : initialFormData,
  );

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === bookingSteps.length - 1;

  const getCurrentStepSchema = () => stepSchemas[currentStep];

  const goToNextStep = () => {
    if (!isLastStep) setCurrentStep((prev) => prev + 1);
  };

  const goToPreviousStep = () => {
    if (!isFirstStep) setCurrentStep((prev) => prev - 1);
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
    formData,
    isFirstStep,
    isLastStep,
    isSubmitted,
    bookingSteps,
    goToNextStep,
    goToPreviousStep,
    updateFormData,
    submitBooking,
    resetBooking,
    getCurrentStepSchema,
  };
}