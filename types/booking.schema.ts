import { z } from "zod";
import { KYC_DOC_CONFIGS } from "@/lib/booking/kyc";

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
// Step 3 — KYC
//
// Required documents branch by shipment type (CSB4 / CSB5 / COMMERCIAL) via
// the shared matrix in lib/booking/kyc.ts, so the requirement rules stay in
// lockstep with the packages step, the KYC UI and the server-side check.
// `shipmentType` is read straight off the form (it's captured on the packages
// step, which always runs before KYC).
// ---------------------------------------------------------------------------

export const kycSchema = z
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
    for (const cfg of KYC_DOC_CONFIGS) {
      if (cfg.requiredFor.includes(data.shipmentType) && !data.kycDocs[cfg.key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["kycDocs", cfg.key],
          message: `${cfg.label} is required for ${data.shipmentType} shipments.`,
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Step 5 — Service selection
// ---------------------------------------------------------------------------

const serviceOptionShape = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  productCode: z.string(),
  productName: z.string(),
  transitDays: z.number(),
  price: z.number(),
  currency: z.string(),
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