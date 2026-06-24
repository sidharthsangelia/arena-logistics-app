"use client";

import { useState } from "react";

import {
  User,
  Shield,
  FileText,
  MapPin,
  MapPinned,
  Package,
  Truck,
  CheckCircle,
  Building,
} from "lucide-react";
import { BookingFormData, BookingStep } from "@/types/booking.types";
import { stepSchemas } from "@/types/booking.schema";

 

export const bookingSteps = [
  {
    id: "shipment-owner",
    name: "Shipment",
    icon: User,
  },

  {
    id: "consignor",
    name: "Sender",
    icon: Building,
  },

  {
    id: "consignee",
    name: "Receiver",
    icon: MapPinned,
  },

  {
    id: "kyc",
    name: "KYC",
    icon: Shield,
  },

  {
    id: "invoice",
    name: "Invoice",
    icon: FileText,
  },

  {
    id: "packages",
    name: "Packages",
    icon: Package,
  },

  {
    id: "service",
    name: "Rates",
    icon: Truck,
  },

  {
    id: "review",
    name: "Review",
    icon: CheckCircle,
  },
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

  invoice: null,

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

  invoiceMode: "UPLOAD",

uploadedInvoice: null,

generatedInvoice: {
  items: [
    {
      description: "",
      hsCode: "",
      countryOfOrigin: "India",
      quantity: 1,
      unitValue: 0,
      currency: "INR",
    },
  ],
},

  billingSameAsDelivery: true,

  packages: [],

  selectedService: null,
};

export function useBookingWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  const [isSubmitted, setIsSubmitted] =
    useState(false);

  const [formData, setFormData] =
    useState<BookingFormData>(
      initialFormData,
    );

  const isFirstStep = currentStep === 0;

  const isLastStep =
    currentStep === bookingSteps.length - 1;

  const getCurrentStepSchema = () =>
    stepSchemas[currentStep];

  const goToNextStep = () => {
    if (!isLastStep) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goToPreviousStep = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const updateFormData = (
    newData: Partial<BookingFormData>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      ...newData,
    }));
  };

  const submitBooking = (
    data: BookingFormData,
  ) => {
    console.log(
      "Shipment Booking:",
      data,
    );

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