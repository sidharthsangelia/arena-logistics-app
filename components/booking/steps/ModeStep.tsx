"use client";

import { Globe2, MapPin, Check } from "lucide-react";
import type { UseFormSetValue } from "react-hook-form";

import { cn } from "@/lib/utils";
import type { BookingFormData, ShipmentModeValue } from "@/types/booking.types";
import { EMPTY_DOMESTIC_DOCS } from "@/lib/booking/domesticDocs";

// ---------------------------------------------------------------------------
// ModeStep — the first thing the wizard asks.
//
// It comes first because it is the only answer that changes the SHAPE of
// everything after it: which address fields exist, which documents are
// collected, which rate network is queried and how many steps there are. Asking
// it later would mean re-deriving a form the customer had already filled.
//
// Switching the mode therefore RESETS every field whose meaning depends on it —
// most importantly the selected rate, which came from a different carrier
// network and would otherwise be carried into a booking it cannot serve. The
// sender, receiver and boxes are deliberately kept: a customer who picked the
// wrong tile should not have to retype their address.
// ---------------------------------------------------------------------------

interface Props {
  data: BookingFormData;
  onChange: (patch: Partial<BookingFormData>) => void;
  /**
   * Keeps react-hook-form's own copy in step. The wizard merges RHF values over
   * its form data when leaving an RHF-backed step, so a mode left only in
   * wizard state could be overwritten by a stale one from the form tree.
   */
  setValue: UseFormSetValue<BookingFormData>;
}

interface ModeOption {
  value: ShipmentModeValue;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  points: string[];
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "DOMESTIC",
    title: "Domestic",
    blurb: "Anywhere within India",
    icon: MapPin,
    points: [
      "Door to door by courier",
      "GST paperwork only, no customs",
      "Cash on delivery available",
    ],
  },
  {
    value: "INTERNATIONAL",
    title: "International",
    blurb: "From India to another country",
    icon: Globe2,
    points: [
      "Air freight through our carrier network",
      "Customs category and export KYC apply",
      "Optional pickup from your door",
    ],
  },
];

export default function ModeStep({ data, onChange, setValue }: Props) {
  const select = (mode: ShipmentModeValue) => {
    if (mode === data.mode) return;

    const isDomestic = mode === "DOMESTIC";

    setValue("mode", mode, { shouldValidate: false });

    // The receiver's country is fixed for domestic and open for international,
    // so it is reset either way rather than left holding the previous mode's
    // answer. City, state and pincode go with it: they were looked up against
    // the old country and would otherwise read as a valid address that no
    // courier can serve.
    const consignee = {
      ...data.consignee,
      country: isDomestic ? "India" : "",
      city: "",
      state: "",
      postalCode: "",
    };

    for (const [key, value] of Object.entries(consignee)) {
      setValue(`consignee.${key}` as never, value as never, {
        shouldValidate: false,
      });
    }
    setValue("selectedService", null, { shouldValidate: false });

    onChange({
      mode,
      consignee,
      // Billing follows the receiver while it is linked to it.
      billing: data.billingSameAsDelivery ? consignee : data.billing,

      // Priced against the other network — never carried across.
      selectedService: null,
      firstMile: null,
      firstMileHubLabel: null,
      pickupIncluded: false,

      // Customs-only fields. Left at their defaults on a domestic booking,
      // where nothing reads them and nothing persists them.
      shipmentType: "CSB4",
      invoiceMode: "GENERATE",
      uploadedInvoice: null,

      // Domestic-only fields, cleared when going back to international.
      domesticDocs: isDomestic ? data.domesticDocs : EMPTY_DOMESTIC_DOCS,
      codEnabled: isDomestic ? data.codEnabled : false,

      // Values are always rupees on a domestic move; the international flow
      // lets the customer declare in the currency their invoice is in.
      currency: isDomestic ? "INR" : data.currency,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">What kind of shipment is this?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          This decides the documents you will need and the carriers we quote,
          so we ask it first.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Shipment type"
        className="grid gap-3 sm:grid-cols-2"
      >
        {MODE_OPTIONS.map((option) => {
          const selected = data.mode === option.value;
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(option.value)}
              className={cn(
                "flex flex-col items-start rounded-xl border p-5 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/40",
              )}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    selected ? "bg-primary/10" : "bg-muted",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </div>
                {selected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </span>
                )}
              </div>

              <p className="mt-3 text-base font-semibold">{option.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {option.blurb}
              </p>

              <ul className="mt-3 space-y-1.5">
                {option.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        You can change this later with Back, but doing so clears the rate you
        picked, since the two run on different carrier networks.
      </p>
    </div>
  );
}
