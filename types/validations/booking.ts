import { z } from "zod";
import { CompanyKind, KycDocType } from "@/generated/prisma";

// ─────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────

export const fileMetaSchema = z.object({
  fileUrl: z.string().url(),
  fileKey: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
});

// ─────────────────────────────────────────────
// Step 1 — Who is this for?
// ─────────────────────────────────────────────

export const newClientSchema = z.object({
  companyName: z.string().min(2, "Company / client name must be at least 2 characters"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters").optional().or(z.literal("")),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  phone: z
    .string()
    .min(7, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  companyKind: z.nativeEnum(CompanyKind),
});
export type NewClientInput = z.infer<typeof newClientSchema>;

export const recipientSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("self") }),
  z.object({ mode: z.literal("existing-client"), clientId: z.string().min(1) }),
  z.object({ mode: z.literal("new-client"), client: newClientSchema }),
]);
export type RecipientInput = z.infer<typeof recipientSchema>;

// ─────────────────────────────────────────────
// Step 2 — KYC
// ─────────────────────────────────────────────

export const kycDocUploadSchema = z.object({
  docType: z.nativeEnum(KycDocType),
  docNumber: z.string().trim().max(64).optional().or(z.literal("")),
  file: fileMetaSchema,
});
export type KycDocUploadInput = z.infer<typeof kycDocUploadSchema>;

// Doc types required per companyKind. Individuals need PAN + Aadhaar;
// companies additionally need a GST certificate. (ARCHITECTURE.md §4)
export const REQUIRED_KYC_DOCS: Record<CompanyKind, KycDocType[]> = {
  [CompanyKind.INDIVIDUAL]: [KycDocType.PAN_CARD, KycDocType.ADHAR_CARD],
  [CompanyKind.COMPANY]: [
    KycDocType.PAN_CARD,
    KycDocType.ADHAR_CARD,
    KycDocType.GST_CERTIFICATE,
  ],
};

// ─────────────────────────────────────────────
// Step 3 — Invoice
// ─────────────────────────────────────────────

export const invoiceSchema = z.object({
  file: fileMetaSchema,
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

// ─────────────────────────────────────────────
// Steps 4 & 5 — Addresses
// ─────────────────────────────────────────────

export const newAddressSchema = z.object({
  label: z.string().trim().max(80).optional().or(z.literal("")),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactPhone: z.string().trim().min(7, "Enter a valid phone number"),
  line1: z.string().trim().min(5, "Address must be at least 5 characters"),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(2, "City must be at least 2 characters"),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().min(2, "Country is required"),
  postalCode: z.string().trim().min(3, "Zip / postal code must be at least 3 characters"),
  isDefault: z.boolean().default(false),
});
export type NewAddressInput = z.infer<typeof newAddressSchema>;

export const addressSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), addressId: z.string().min(1) }),
  z.object({ mode: z.literal("new"), address: newAddressSchema }),
]);
export type AddressSelectionInput = z.infer<typeof addressSelectionSchema>;

export const pickupStepSchema = z.object({
  pickup: addressSelectionSchema,
});
export type PickupStepInput = z.infer<typeof pickupStepSchema>;

export const deliveryStepSchema = z
  .object({
    delivery: addressSelectionSchema,
    billingSameAsDelivery: z.boolean().default(true),
    billing: addressSelectionSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.billingSameAsDelivery && !val.billing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose or add a billing address, or check 'same as delivery'.",
        path: ["billing"],
      });
    }
  });
export type DeliveryStepInput = z.infer<typeof deliveryStepSchema>;

// ─────────────────────────────────────────────
// Step 6 — Packages
// ─────────────────────────────────────────────

export const packageItemSchema = z.object({
  description: z.string().trim().min(2, "Describe the contents"),
  quantity: z.coerce.number().int().min(1, "At least 1"),
  lengthCm: z.coerce.number().positive("Must be greater than 0"),
  widthCm: z.coerce.number().positive("Must be greater than 0"),
  heightCm: z.coerce.number().positive("Must be greater than 0"),
  weightKg: z.coerce.number().positive("Must be greater than 0"),
  declaredValue: z.coerce.number().nonnegative().optional(),
  declaredCurrency: z.string().trim().length(3).optional().default("INR"),
  hsCode: z.string().trim().max(20).optional().or(z.literal("")),
});
export type PackageItemInput = z.infer<typeof packageItemSchema>;

export const packagesStepSchema = z.object({
  declaredCargoType: z.string().trim().max(40).optional().or(z.literal("")),
  packages: z.array(packageItemSchema).min(1, "Add at least one package"),
});
export type PackagesStepInput = z.infer<typeof packagesStepSchema>;

// ─────────────────────────────────────────────
// Step 7 — Service selection (domestic DB-rate path)
// ─────────────────────────────────────────────

export const serviceSelectionSchema = z.object({
  rateCardId: z.string().min(1),
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  productName: z.string().min(1),
});
export type ServiceSelectionInput = z.infer<typeof serviceSelectionSchema>;

// ─────────────────────────────────────────────
// Step 7 — Service selection (international API-rate path)
//
// The client passes the full RateQuote that the API returned. The server
// action re-applies the org's markup on top of `totalWithTax` (the
// carrier's cost to us) and freezes the marked-up price into
// Shipment.quotedTotal. The raw carrier quote is stored in
// chargesSnapshot so we always know what the vendor charged us vs what
// we charged the customer.
// ─────────────────────────────────────────────

const chargeSchema = z.object({
  name: z.string(),
  amount: z.number(),
  currency: z.string(),
  taxAmount: z.number().optional(),
});

export const internationalServiceSelectionSchema = z.object({
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  productName: z.string().min(1),
  currency: z.string().min(1),
  /** Carrier's price billed to us — markup is applied on top of this */
  totalWithTax: z.number().positive(),
  totalWithoutTax: z.number().positive(),
  tatDays: z.number().int().min(0),
  charges: z.array(chargeSchema),
});
export type InternationalServiceSelectionInput = z.infer<
  typeof internationalServiceSelectionSchema
>;

// ─────────────────────────────────────────────
// Step 8 — Payment (stub — see lib/actions/shipments.ts confirmPayment)
// ─────────────────────────────────────────────

export const confirmPaymentSchema = z.object({
  shipmentId: z.string().min(1),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;