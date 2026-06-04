"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { useUploadThing } from "@/utils/uploadthing";

interface UploadPdfParams {
  blob: Blob;
  quoteId: string;
  fileName: string;
}

type UploadPdfResult =
  | { success: true; url: string }
  | { success: false; error: string };

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useUploadQuotePdf() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const quoteIdRef = useRef<string>("");

  const { startUpload } = useUploadThing("quotePdf", {
    headers: () => ({ "x-quote-id": quoteIdRef.current }),
  });

  const uploadPdf = async ({
    blob,
    quoteId,
    fileName,
  }: UploadPdfParams): Promise<{ success: true; url: string } | { success: false; error: string }> => {
    setIsUploading(true);
    setUploadError(null);
    quoteIdRef.current = quoteId;

    const file = new File([blob], fileName, { type: "application/pdf" });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await startUpload([file]);

        if (!res?.length || !res[0]?.ufsUrl) {
          throw new Error("Upload returned no result");
        }

        setIsUploading(false);
        return { success: true, url: res[0].ufsUrl };
      } catch (e) {
        const isLastAttempt = attempt === MAX_RETRIES;
        const message = e instanceof Error ? e.message : "Upload failed";

        if (isLastAttempt) {
          setUploadError(message);
          setIsUploading(false);
          return { success: false, error: message };
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        toast.warning(`Upload attempt ${attempt} failed — retrying in ${delay / 1000}s…`);
        await sleep(delay);
      }
    }

    // Unreachable but satisfies TypeScript
    setIsUploading(false);
    return { success: false, error: "Upload failed after all retries" };
  };

  return { uploadPdf, isUploading, uploadError };
}