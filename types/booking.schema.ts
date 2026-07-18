import { z } from "zod";

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
    // Only validated when pickup differs from the sender (see superRefine).
    pickup: addressFormSchema.partial().optional(),
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

export const consigneeSchema = z.object({
  consignee: addressFormSchema,
});

// ---------------------------------------------------------------------------
// Step 3 — Shipment Details (merged Invoice + Packages)
//
// Physical + commercial fields are required on every item regardless of
// invoiceMode: rating needs weight/dimensions, and KYC's IEC threshold
// check needs declared value, even when the user uploads their own
// invoice PDF instead of generating one.
// ---------------------------------------------------------------------------

const shipmentItemSchema = z.object({
  id: z.string(),
  description: z.string().min(2, "Description is required"),
  hsCode: z.string().min(4, "HSN code must be at least 4 digits"),
  countryOfOrigin: z.string().min(2, "Country of origin is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  weightKg: z.number().positive("Weight must be greater than 0"),
  lengthCm: z.number().positive("Length must be greater than 0"),
  widthCm: z.number().positive("Width must be greater than 0"),
  heightCm: z.number().positive("Height must be greater than 0"),
  unitValue: z.number().min(0, "Unit value cannot be negative"),
});

export const shipmentDetailsSchema = z
  .object({
    invoiceMode: z.enum(["UPLOAD", "GENERATE"]),
    uploadedInvoice: fileMetaSchema.nullable(),
    invoiceNumber: z.string().optional(),
    currency: z.string().min(1, "Currency is required"),
    items: z.array(shipmentItemSchema).min(1, "Add at least one item."),
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
// Step 4 — KYC
//
// Now runs AFTER shipment-details, so `_totalDeclaredValue` (injected by
// the wizard before validating this step) reflects real item data instead
// of always being 0 — this was the source of the IEC-threshold bug where
// IEC always read as "not required" on a user's first pass through the
// wizard.
// ---------------------------------------------------------------------------

export const kycSchema = z
  .object({
    kycDocs: z.object({
      pan: fileMetaSchema.nullable(),
      aadhaar: fileMetaSchema.nullable(),
      gst: fileMetaSchema.nullable(),
      iec: fileMetaSchema.nullable(),
    }),
    // Injected by the wizard right before validating this step — does NOT
    // live in BookingFormData itself.
    _totalDeclaredValue: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.kycDocs.pan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kycDocs", "pan"],
        message: "PAN card is required for international shipments.",
      });
    }
    if (!data.kycDocs.aadhaar) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kycDocs", "aadhaar"],
        message: "Aadhaar card is required for international shipments.",
      });
    }
    const totalValue = data._totalDeclaredValue ?? 0;
    if (totalValue > 25_000 && !data.kycDocs.iec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kycDocs", "iec"],
        message: `IEC is required when shipment value exceeds ₹25,000 (yours: ₹${totalValue.toLocaleString("en-IN")}).`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Step 5 — Service selection
// ---------------------------------------------------------------------------

export const serviceSchema = z.object({
  selectedService: z
    .object({
      vendorId: z.string(),
      vendorName: z.string(),
      productCode: z.string(),
      productName: z.string(),
      transitDays: z.number(),
      price: z.number(),
      currency: z.string(),
    })
    .nullable()
    .refine((v) => v !== null, {
      message: "Please select a shipping service to continue.",
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
//  1  consignee         → consigneeSchema
//  2  shipment-details  → shipmentDetailsSchema  (self-managed, not via RHF)
//  3  kyc               → kycSchema
//  4  service           → serviceSchema
//  5  review            → reviewSchema
// ---------------------------------------------------------------------------

export const stepSchemas = [
  senderPickupSchema,    // 0
  consigneeSchema,       // 1
  shipmentDetailsSchema, // 2
  kycSchema,             // 3
  serviceSchema,         // 4
  reviewSchema,          // 5
];