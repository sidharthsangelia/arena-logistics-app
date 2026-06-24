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
// Step 0 — Shipment Owner
// Validation of selectedClient when mode is EXISTING_CLIENT is handled
// imperatively in the wizard (sets a manual RHF error) so the schema here
// just validates the mode field.
// ---------------------------------------------------------------------------

export const shipmentOwnerSchema = z.object({
  shipmentOwnerMode: z.enum(["SELF", "EXISTING_CLIENT", "OTHER_PERSON"]),
  selectedClient: z.any().nullable(),
});

// ---------------------------------------------------------------------------
// Step 1 — Consignor
// ---------------------------------------------------------------------------

export const consignorSchema = z.object({
  consignor: z.object({
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
  }),
});

// ---------------------------------------------------------------------------
// Step 2 — Consignee
// ---------------------------------------------------------------------------

export const consigneeSchema = z.object({
  consignee: z.object({
    contactName: z.string().min(2, "Contact name is required"),
    companyName: z.string().optional(),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(8, "Phone number is too short"),
    addressLine1: z.string().min(3, "Address is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State / province is required"),
    postalCode: z.string().min(2, "Postal code is required"),
    country: z.string().min(2, "Country is required"),
  }),
});

// ---------------------------------------------------------------------------
// Step 3 — KYC
// PAN + IEC are mandatory for all international shipments from India.
// GST and Aadhaar are optional (Aadhaar required for individuals/proprietors).
// ---------------------------------------------------------------------------

export const kycSchema = z
  .object({
    kycDocs: z.object({
      pan: fileMetaSchema.nullable(),
      aadhaar: fileMetaSchema.nullable(),
      gst: fileMetaSchema.nullable(),
      iec: fileMetaSchema.nullable(),
    }),
    // The total declared value is passed in from the wizard so the schema
    // can conditionally require IEC. The wizard embeds this in the merged
    // object before calling safeParse — it does NOT live in BookingFormData.
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
// Step 4 — Invoice
// ---------------------------------------------------------------------------

const invoiceItemSchema = z.object({
  description: z.string().min(2, "Description is required"),
  hsCode: z.string().min(4, "HSN code must be at least 4 digits"),
  countryOfOrigin: z.string().min(2, "Country of origin is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitValue: z.number().min(0, "Unit value cannot be negative"),
  currency: z.string().min(1, "Currency is required"),
});

export const invoiceStepSchema = z
  .object({
    invoiceMode: z.enum(["UPLOAD", "GENERATE"]),
    uploadedInvoice: fileMetaSchema.nullable(),
    generatedInvoice: z.object({
      invoiceNumber: z.string().optional(),
      items: z.array(invoiceItemSchema),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.invoiceMode === "UPLOAD" && !data.uploadedInvoice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["uploadedInvoice"],
        message: "Please upload a commercial invoice.",
      });
    }
    if (
      data.invoiceMode === "GENERATE" &&
      data.generatedInvoice.items.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generatedInvoice", "items"],
        message: "Add at least one item to generate an invoice.",
      });
    }
  });

// ---------------------------------------------------------------------------
// Step 5 — Packages
// ---------------------------------------------------------------------------

const packageItemSchema = z.object({
  id: z.string(),
  description: z.string().min(2, "Description is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  weightKg: z.number().positive("Weight must be greater than 0"),
  lengthCm: z.number().positive("Length must be greater than 0"),
  widthCm: z.number().positive("Width must be greater than 0"),
  heightCm: z.number().positive("Height must be greater than 0"),
  declaredValue: z.number().min(0, "Declared value cannot be negative"),
  hsCode: z.string().optional(),
  countryOfOrigin: z.string().optional(),
});

export const packageStepSchema = z.object({
  packages: z.array(packageItemSchema).min(1, "Add at least one package."),
});

// ---------------------------------------------------------------------------
// Step 6 — Service selection
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
// Step 7 — Review (read-only, no additional validation)
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({});

// ---------------------------------------------------------------------------
// stepSchemas — index MUST match bookingSteps order in useBookingWizard.ts
//
//  0  shipment-owner  → shipmentOwnerSchema
//  1  consignor       → consignorSchema
//  2  consignee       → consigneeSchema
//  3  kyc             → kycSchema
//  4  invoice         → invoiceStepSchema   (self-managed, not via RHF)
//  5  packages        → packageStepSchema   (self-managed, not via RHF)
//  6  service         → serviceSchema
//  7  review          → reviewSchema
// ---------------------------------------------------------------------------

export const stepSchemas = [
  shipmentOwnerSchema, // 0
  consignorSchema,     // 1
  consigneeSchema,     // 2
  kycSchema,           // 3
  invoiceStepSchema,   // 4
  packageStepSchema,   // 5
  serviceSchema,       // 6
  reviewSchema,        // 7
];