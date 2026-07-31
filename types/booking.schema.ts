import { z } from "zod";
import {
  KYC_DOC_CONFIGS,
  requiredKycKeys,
  requiredDomesticKycKeys,
} from "@/lib/booking/kyc";
import {
  DOMESTIC_DOC_CONFIGS,
  domesticDocRequirement,
  EWAY_BILL_THRESHOLD,
} from "@/lib/booking/domesticDocs";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const fileMetaSchema = z.object({
  fileUrl: z.string().url(),
  fileKey: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
});

// ---------------------------------------------------------------------------
// Shared address-form shape (sender / pickup / receiver all use it)
// ---------------------------------------------------------------------------

const addressFormSchema = z.object({
  contactName: z.string().min(2, "Contact name is required"),
  companyName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(8, "Phone number is too short"),
  addressLine1: z.string().min(3, "Address is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  postalCode: z.string().min(2, "Postal code is required"),
  country: z.string().min(2, "Country is required"),
});

// ---------------------------------------------------------------------------
// Step 0 — Sender + Pickup (merged "who's shipping" + sender address +
// pickup address). One step: mode selector, sender fields, and a pickup
// section gated by the "pickup same as sender" checkbox.
// ---------------------------------------------------------------------------

export const senderPickupSchema = z
  .object({
    shipmentOwnerMode: z.enum(["SELF", "EXISTING_CLIENT", "OTHER_PERSON"]),
    selectedClient: z.any().nullable(),
    consignor: addressFormSchema,
    pickupSameAsSender: z.boolean(),
    // Intentionally untyped/unvalidated here — when pickupSameAsSender is
    // true this can legitimately be empty strings (mirrored later, or just
    // not filled yet). Real validation only happens below, and only when
    // it's actually required. A partial() schema would still run each
    // field's validator against "" (empty string is a defined value, not
    // undefined), which is what caused the checkbox to have no effect.
    pickup: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.shipmentOwnerMode === "EXISTING_CLIENT" && !data.selectedClient) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedClient"],
        message: "Please select a client to continue.",
      });
    }
    if (!data.pickupSameAsSender) {
      const result = addressFormSchema.safeParse(data.pickup ?? {});
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["pickup", ...issue.path],
            message: issue.message,
          });
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Step 0 — International or domestic.
//
// Its own step because everything after it is shaped by the answer: which
// address fields exist, which documents are collected, which rate network is
// queried, and whether there is a first-mile leg at all.
// ---------------------------------------------------------------------------

export const modeSchema = z.object({
  mode: z.enum(["INTERNATIONAL", "DOMESTIC"], {
    message: "Please choose whether this shipment is domestic or international.",
  }),
});

// ---------------------------------------------------------------------------
// Step 1 — Delivery + Billing (receiver address + optional separate billing).
// Billing defaults to the delivery address; validated separately only when
// billingSameAsDelivery is false.
// ---------------------------------------------------------------------------

export const deliveryBillingSchema = z
  .object({
    consignee: addressFormSchema,
    billingSameAsDelivery: z.boolean(),
    billing: z.unknown().optional(), // see note on `pickup` above
  })
  .superRefine((data, ctx) => {
    if (!data.billingSameAsDelivery) {
      const result = addressFormSchema.safeParse(data.billing ?? {});
      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["billing", ...issue.path],
            message: issue.message,
          });
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Step 3 — Shipment Details (merged Invoice + Packages)
//
// Physical + commercial fields are required on every item regardless of
// invoiceMode: rating needs weight/dimensions, and KYC's IEC threshold
// check needs declared value, even when the user uploads their own
// invoice PDF instead of generating one.
// ---------------------------------------------------------------------------

const boxContentItemSchema = z.object({
  id: z.string(),
  description: z.string().min(2, "Description is required"),
  hsCode: z.string().min(4, "HSN code must be at least 4 digits"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitValue: z.number().min(0, "Value cannot be negative"),
});

const cargoBoxSchema = z.object({
  id: z.string(),
  lengthCm: z.number().positive("Length must be greater than 0"),
  widthCm: z.number().positive("Width must be greater than 0"),
  heightCm: z.number().positive("Height must be greater than 0"),
  weightKg: z.number().positive("Weight must be greater than 0"),
  quantity: z.number().min(1, "Number of boxes must be at least 1"),
  contents: z.array(boxContentItemSchema).min(1, "Add at least one item to this box."),
});

export const shipmentDetailsSchema = z
  .object({
    shipmentType: z.enum(["CSB4", "CSB5", "COMMERCIAL"]),
    invoiceMode: z.enum(["UPLOAD", "GENERATE"]),
    uploadedInvoice: fileMetaSchema.nullable(),
    invoiceNumber: z.string().optional(),
    currency: z.string().min(1, "Currency is required"),
    boxes: z.array(cargoBoxSchema).min(1, "Add at least one box."),
  })
  .superRefine((data, ctx) => {
    if (data.invoiceMode === "UPLOAD" && !data.uploadedInvoice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["uploadedInvoice"],
        message: "Please upload your commercial invoice.",
      });
    }
  });

// ---------------------------------------------------------------------------
// Domestic delivery + billing — the receiver must be in India.
//
// The UI never offers a country picker on a domestic booking, so this can only
// fail on a hand-edited payload or a draft started as international and
// switched. Checked anyway: a non-Indian pincode would be sent to a domestic
// courier that cannot serve it, and failing here with a clear message beats
// failing three steps later with a vendor error.
// ---------------------------------------------------------------------------

const INDIA_COUNTRY_NAMES = new Set(["india", "in"]);

function isIndia(country: unknown): boolean {
  return (
    typeof country === "string" &&
    INDIA_COUNTRY_NAMES.has(country.trim().toLowerCase())
  );
}

export const domesticDeliveryBillingSchema = deliveryBillingSchema.superRefine(
  (data, ctx) => {
    if (!isIndia(data.consignee?.country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consignee", "country"],
        message: "Domestic shipments can only be delivered within India.",
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Domestic items + documents.
//
// Same boxes as the export flow (they drive pricing identically), minus
// everything customs-specific: no CSB category, no commercial invoice to
// generate, no door-pickup opt-in. In their place, the GST paperwork the
// consignment travels on, whose rules live in lib/booking/domesticDocs.ts so
// the form and the server-side check read the same matrix.
// ---------------------------------------------------------------------------

const domesticDocsSchema = z.object({
  taxInvoice: fileMetaSchema.nullable(),
  deliveryChallan: fileMetaSchema.nullable(),
  eWayBill: fileMetaSchema.nullable(),
});

// HSN is mandatory on an export — customs will not clear a line without one.
// Domestically it is only mandatory for a company sender, who is raising a GST
// tax invoice that has to carry it anyway. An individual posting clothes to
// family has no HSN code, would have to invent one to get past this step, and
// nothing downstream would be better for it. So the field is still offered to
// everyone and enforced only where it means something.
const domesticBoxContentItemSchema = boxContentItemSchema.extend({
  hsCode: z.string().optional().default(""),
});

const domesticCargoBoxSchema = cargoBoxSchema.extend({
  contents: z
    .array(domesticBoxContentItemSchema)
    .min(1, "Add at least one item to this box."),
});

export const domesticShipmentDetailsSchema = z
  .object({
    currency: z.string().min(1, "Currency is required"),
    boxes: z.array(domesticCargoBoxSchema).min(1, "Add at least one box."),
    // Read, not validated. Both addresses were already validated by their own
    // steps; all this step needs from them is whether a company name is set,
    // which is what decides if a tax invoice is required. Re-running the
    // address validators here would surface the same errors a second time on a
    // step that has no field to show them against.
    consignor: z.any(),
    consignee: z.any(),
    domesticDocs: domesticDocsSchema,
  })
  .superRefine((data, ctx) => {
    const { required, senderIsCompany } = domesticDocRequirement({
      consignor: data.consignor ?? {},
      consignee: data.consignee ?? {},
      boxes: data.boxes as never,
    });

    // See domesticBoxContentItemSchema above: HSN matters for a company sender,
    // whose tax invoice has to carry it, and not for an individual.
    if (senderIsCompany) {
      data.boxes.forEach((box, bi) => {
        box.contents.forEach((item, ii) => {
          if ((item.hsCode ?? "").trim().length < 4) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["boxes", bi, "contents", ii, "hsCode"],
              message:
                "An HSN code is required on every item when a company is sending, because it goes on the tax invoice.",
            });
          }
        });
      });
    }

    const REASON: Record<string, string> = {
      taxInvoice: "the sender is a company",
      eWayBill: `the declared value is over ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}`,
    };

    for (const key of required) {
      if (!data.domesticDocs[key]) {
        const cfg = DOMESTIC_DOC_CONFIGS.find((c) => c.key === key);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["domesticDocs", key],
          message: `${cfg?.label ?? key} is required because ${REASON[key] ?? "of this shipment's details"}.`,
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Domestic KYC — Aadhaar, and only when the sender is an individual.
//
// A company sender has no required document here at all, which is what makes
// the wizard drop the step for them entirely (see getActiveSteps). Built
// per-render for the same reason makeKycSchema is: what it asks for depends on
// an answer the form has already collected.
// ---------------------------------------------------------------------------

export function makeDomesticKycSchema(senderIsCompany: boolean) {
  return z
    .object({
      kycDocs: z.object({
        companyPan: fileMetaSchema.nullable(),
        pan: fileMetaSchema.nullable(),
        aadhaar: fileMetaSchema.nullable(),
        gst: fileMetaSchema.nullable(),
        iec: fileMetaSchema.nullable(),
        lut: fileMetaSchema.nullable(),
      }),
    })
    .superRefine((data, ctx) => {
      for (const key of requiredDomesticKycKeys(senderIsCompany)) {
        if (!data.kycDocs[key]) {
          const cfg = KYC_DOC_CONFIGS.find((c) => c.key === key);
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["kycDocs", key],
            message: `${cfg?.label ?? key} is required for domestic shipments sent by an individual.`,
          });
        }
      }
    });
}

// ---------------------------------------------------------------------------
// Step 3 — KYC
//
// Required documents branch by shipment type (CSB4 / CSB5 / COMMERCIAL) via
// the shared matrix in lib/booking/kyc.ts, so the requirement rules stay in
// lockstep with the packages step, the KYC UI and the server-side check.
// `shipmentType` is read straight off the form (it's captured on the packages
// step, which always runs before KYC).
// ---------------------------------------------------------------------------

/**
 * Built per-render rather than exported as one fixed schema, because what the
 * step requires depends on whether the party has a live KYC waiver (see the
 * KycWaiver model). `waived` is resolved server-side by getKycDocs and passed
 * down; it only decides what this form asks for. The booking submit re-reads the
 * waiver from the database, so a browser claiming `waived` gets nowhere.
 */
export function makeKycSchema(waived = false) {
  return z
    .object({
      shipmentType: z.enum(["CSB4", "CSB5", "COMMERCIAL"]),
      kycDocs: z.object({
        companyPan: fileMetaSchema.nullable(),
        pan: fileMetaSchema.nullable(),
        aadhaar: fileMetaSchema.nullable(),
        gst: fileMetaSchema.nullable(),
        iec: fileMetaSchema.nullable(),
        lut: fileMetaSchema.nullable(),
      }),
    })
    .superRefine((data, ctx) => {
      const required = new Set(requiredKycKeys(data.shipmentType, waived));

      for (const cfg of KYC_DOC_CONFIGS) {
        if (required.has(cfg.key) && !data.kycDocs[cfg.key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["kycDocs", cfg.key],
            message: waived
              ? `${cfg.label} is still required.`
              : `${cfg.label} is required for ${data.shipmentType} shipments.`,
          });
        }
      }
    });
}

/** The un-waived matrix — the default every caller gets unless told otherwise. */
export const kycSchema = makeKycSchema(false);

// ---------------------------------------------------------------------------
// Step 5 — Service selection
// ---------------------------------------------------------------------------

/**
 * One component of the quoted price, org markup already inside the amount.
 *
 * Carried through the wizard so the tax invoice can show a real breakdown. It
 * is display data only: the invoice engine treats the wallet debit as the
 * authoritative total and reconciles these components to it, so a tampered
 * breakdown cannot change what anyone is charged or what tax is stated. Being
 * permissive here is therefore safe, and being strict would only mean a vendor
 * adding a field breaks bookings.
 */
const serviceChargeShape = z.object({
  name: z.string(),
  amount: z.number(),
  currency: z.string().optional(),
  taxAmount: z.number().optional(),
  igst: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
});

const serviceOptionShape = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  productCode: z.string(),
  productName: z.string(),
  transitDays: z.number(),
  price: z.number(),
  currency: z.string(),
  charges: z.array(serviceChargeShape).optional(),
});

export const serviceSchema = z.object({
  selectedService: serviceOptionShape.nullable().refine((v) => v !== null, {
    message: "Please select a shipping service to continue.",
  }),
});

// ---------------------------------------------------------------------------
// First-mile (door → hub) — only reached when pickupIncluded is true, so the
// wizard validates this schema only when the first-mile step is active. A
// non-null selection is required to continue past it.
// ---------------------------------------------------------------------------

export const firstMileSchema = z.object({
  firstMile: serviceOptionShape.nullable().refine((v) => v !== null, {
    message: "Please select a pickup courier to continue.",
  }),
});

// ---------------------------------------------------------------------------
// Step 6 — Review (read-only)
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({});

// ---------------------------------------------------------------------------
// stepSchemas — index MUST match `bookingSteps` / `STEP` in useBookingWizard.ts
//
//  0  sender            → senderPickupSchema  (merged owner + sender + pickup)
//  1  delivery-billing  → deliveryBillingSchema (receiver + optional billing)
//  2  shipment-details  → shipmentDetailsSchema  (self-managed, not via RHF)
//  3  kyc               → kycSchema
//  4  service           → serviceSchema
//  5  review            → reviewSchema
// ---------------------------------------------------------------------------

export const stepSchemas = [
  senderPickupSchema,    // 0
  deliveryBillingSchema, // 1
  shipmentDetailsSchema, // 2
  kycSchema,             // 3
  serviceSchema,         // 4
  reviewSchema,          // 5
];