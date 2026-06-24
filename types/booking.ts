import type { Address, Client, KycDocument, PartyType } from "@/generated/prisma";

/**
 * Every mutating server action returns this shape instead of throwing across
 * the server/client boundary. Throwing is fine for programmer errors
 * (ownership checks in get-org.ts), but expected failure modes — validation,
 * insufficient wallet balance, a race on shipmentNumber — should be values
 * the UI can branch on without a try/catch around every call.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/**
 * Metadata for a file that has already been uploaded to object storage.
 * This flow does NOT handle the upload transport itself — see
 * `lib/upload.ts` for the single place that needs wiring to your storage
 * provider (S3 presigned PUT, UploadThing, etc). Every action that accepts
 * a document takes this shape, never a raw File/Blob, because server
 * actions are a poor transport for large binaries.
 */
export interface FileMeta {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/** Who a shipment (or a KYC doc, or an address) belongs to. */
export type Party =
  | { partyType: "ORG"; orgId: string }
  | { partyType: "CLIENT"; clientId: string };

export type ClientSummary = Pick<
  Client,
  "id" | "companyName" | "contactName" | "email" | "phone" | "companyKind" | "addressLine1" | "city" | "country" | "postalCode" | "state"
>;


export type AddressSummary = Address;

export type KycDocSummary = Pick<
  KycDocument,
  "id" | "docType" | "label" | "docNumber" | "fileName" | "verifiedAt" | "expiresAt" | "uploadedAt"
>;

export type { PartyType };