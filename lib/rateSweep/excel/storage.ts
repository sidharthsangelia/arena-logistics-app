/**
 * lib/rateSweep/excel/storage.ts
 *
 * Puts a generated quotation workbook somewhere it can be opened again.
 *
 * ── CUSTOMER FILES ONLY ─────────────────────────────────────────────────────
 * This module refuses to store an INTERNAL workbook, and the refusal is the
 * point rather than a limitation. UploadThing hands back a public, unguessable
 * URL — unguessable is not access-controlled. A forwarded link to an internal
 * file is a permanent, unrevocable leak of Arena's buying price and therefore
 * its margin, and there is no way to un-send it short of deleting the file and
 * hoping nobody kept a copy.
 *
 * A customer workbook holds prices that customer is already allowed to see, so
 * a link that escapes costs nothing that was not already sent by email. An
 * internal one is generated, downloaded to the browser that asked for it, and
 * never written anywhere. The audit row is still created either way, so we know
 * a cost file was produced, by whom, and with what settings.
 *
 * The guard lives here rather than at the call site because a call site can be
 * copied. Anything reaching for storage has to come through this function.
 *
 * ── UTApi DIRECTLY, NOT THE FILE ROUTER ─────────────────────────────────────
 * Same reasoning as lib/booking/labelStorage.ts: there is no browser and no
 * session behind this file. The server built it, so routing it through a client
 * upload flow would mean inventing a session to satisfy a middleware with
 * nothing left to check.
 */

import "server-only";

import { UTApi } from "uploadthing/server";

import type { QuotationAudience } from "./spec";

export interface StoredQuotation {
  fileUrl: string;
  fileKey: string;
  fileSize: number;
}

export class QuotationStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotationStorageError";
  }
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function uploadQuotation(input: {
  bytes: Buffer;
  fileName: string;
  audience: QuotationAudience;
}): Promise<StoredQuotation> {
  if (input.audience !== "CUSTOMER") {
    throw new QuotationStorageError(
      "Internal workbooks carry raw vendor cost and are never stored. " +
        "Check the audience before calling this.",
    );
  }

  if (!input.bytes.length) {
    throw new QuotationStorageError("Empty workbook; nothing to store.");
  }

  const utapi = new UTApi();

  const file = new File([new Uint8Array(input.bytes)], input.fileName, {
    type: XLSX_MIME,
  });

  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    throw new QuotationStorageError(
      `UploadThing rejected the workbook: ${result.error?.message ?? "unknown error"}`,
    );
  }

  return {
    fileUrl: result.data.ufsUrl,
    fileKey: result.data.key,
    fileSize: result.data.size,
  };
}
