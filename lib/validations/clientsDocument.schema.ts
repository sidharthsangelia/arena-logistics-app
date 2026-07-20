import { z } from "zod";

// Mirror the Prisma enum — keep in sync with schema.prisma
export const KYC_DOC_TYPES = [
  "PAN_CARD",
  "COMPANY_PAN",
  "ADHAR_CARD",
  "GST_CERTIFICATE",
  "IEC_CODE",
  "MSME_CERTIFICATE",
  "INCORPORATION_CERT",
  "CANCELLED_CHEQUE",
  "BANK_STATEMENT",
  "TRADE_LICENSE",
  "AUTHORIZED_SIGNATORY",
  "LUT",
  "OTHER",
] as const;

export type KycDocType = (typeof KYC_DOC_TYPES)[number];

// Human-readable labels shown in dropdowns and cards
export const KYC_DOC_TYPE_LABELS: Record<KycDocType, string> = {
  PAN_CARD:            "PAN Card",
  COMPANY_PAN:         "Company PAN",
  ADHAR_CARD:          "Aadhar Card",
  GST_CERTIFICATE:     "GST Certificate",
  IEC_CODE:            "IEC Code",
  MSME_CERTIFICATE:    "MSME Certificate",
  INCORPORATION_CERT:  "Certificate of Incorporation",
  CANCELLED_CHEQUE:    "Cancelled Cheque",
  BANK_STATEMENT:      "Bank Statement",
  TRADE_LICENSE:       "Trade License",
  AUTHORIZED_SIGNATORY:"Authorised Signatory / POA",
  LUT:                 "LUT (Letter of Undertaking)",
  OTHER:               "Other",
};

// Short descriptions used as upload hints
export const KYC_DOC_TYPE_HINTS: Record<KycDocType, string> = {
  PAN_CARD:            "Individual / founder / proprietor PAN",
  COMPANY_PAN:         "Company's PAN card",
  ADHAR_CARD:          "Proprietor / authorised signatory Aadhaar",
  GST_CERTIFICATE:     "GST registration certificate",
  IEC_CODE:            "Importer Exporter Code certificate",
  MSME_CERTIFICATE:    "Udyam / MSME registration",
  INCORPORATION_CERT:  "Certificate of Incorporation / MOA",
  CANCELLED_CHEQUE:    "Cancelled cheque for bank verification",
  BANK_STATEMENT:      "Latest 3–6 months bank statement",
  TRADE_LICENSE:       "Municipal / state trade license",
  AUTHORIZED_SIGNATORY:"Board resolution or Power of Attorney",
  LUT:                 "Letter of Undertaking for zero-rated exports",
  OTHER:               "Any other supporting document",
};

// Schema used in the upload dialog form
export const kycDocumentFormSchema = z.object({
  docType:     z.enum(KYC_DOC_TYPES, { error: "Document type is required" }),
  label:       z.string().trim().min(1, "Label is required").max(200),
  description: z.string().trim().max(1000).optional(),
});

export type KycDocumentFormValues = z.infer<typeof kycDocumentFormSchema>;

// Schema used by the server action (after upload)
export const saveKycDocumentSchema = z.object({
  clientId:    z.string().cuid(),
  docType:     z.enum(KYC_DOC_TYPES),
  label:       z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  fileUrl:     z.string().url(),
  fileKey:     z.string().min(1),
  fileName:    z.string().min(1),
  fileSize:    z.number().int().positive(),
  mimeType:    z.string().min(1),
});

export type SaveKycDocumentInput = z.infer<typeof saveKycDocumentSchema>;