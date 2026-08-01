/**
 * WAYBILL LABEL STORAGE
 * -----------------------------------------------------------------------------
 * Puts a courier label where the customer can download it.
 *
 * Same reasoning as the invoice upload in lib/invoices/tax/pdf/render.tsx: UTApi
 * directly, not the browser file router, because there is no browser and no
 * session here — the background job is the author, and routing a job's file
 * through a client upload flow would mean inventing a session to satisfy a
 * middleware with nothing left to check.
 */

import "server-only";

import { UTApi } from "uploadthing/server";

export interface StoredLabel {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export class LabelStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelStorageError";
  }
}

export async function uploadLabel(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<StoredLabel> {
  if (!input.bytes.length) {
    throw new LabelStorageError(
      "The courier returned an empty label file; nothing to store.",
    );
  }

  const utapi = new UTApi();

  const file = new File([new Uint8Array(input.bytes)], input.fileName, {
    type: input.mimeType,
  });

  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    throw new LabelStorageError(
      `UploadThing rejected the label: ${result.error?.message ?? "unknown error"}`,
    );
  }

  return {
    fileUrl: result.data.ufsUrl,
    fileKey: result.data.key,
    fileName: input.fileName,
    fileSize: result.data.size,
    mimeType: input.mimeType,
  };
}
