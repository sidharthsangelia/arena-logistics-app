"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { useUploadThing } from "@/utils/uploadthing";

interface UploadPdfParams {
  blob: Blob;
  quoteId: string;
  fileName: string;
}

export function useUploadQuotePdf() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Use a ref so the headers callback always reads the latest quoteId
  const quoteIdRef = useRef<string>("");

  const { startUpload } = useUploadThing("quotePdf", {
    headers: () => ({
      "x-quote-id": quoteIdRef.current,
    }),
    onUploadError: (err) => {
      setUploadError(err.message);
      toast.error("PDF upload failed");
      setIsUploading(false);
    },
    onClientUploadComplete: () => {
      toast.success("PDF saved successfully");
      setIsUploading(false);
    },
  });

  const uploadPdf = async ({ blob, quoteId, fileName }: UploadPdfParams) => {
    setIsUploading(true);
    setUploadError(null);
    quoteIdRef.current = quoteId; // set before startUpload is called

    try {
      const file = new File([blob], fileName, { type: "application/pdf" });
      const res = await startUpload([file]);

      if (!res?.length) throw new Error("Upload returned no result");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setUploadError(message);
      toast.error(message);
      setIsUploading(false);
    }
  };

  return { uploadPdf, isUploading, uploadError };
}