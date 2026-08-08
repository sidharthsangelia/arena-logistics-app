"use client";

/**
 * The invoice, as a PDF, before it exists.
 *
 * ── WHY A BLOB URL AND NOT A data: URI ──────────────────────────────────────
 * The action returns base64 and the obvious thing is to feed
 * `data:application/pdf;base64,...` straight to the iframe. Chrome's PDF viewer
 * refuses to load in a frame from a data: URL, so that renders a blank panel
 * with no error anywhere. A Blob URL is same-origin as far as the viewer is
 * concerned and loads normally.
 *
 * The URL is revoked when the dialog closes. Each preview allocates a few
 * hundred kilobytes and an admin comparing two versions of an invoice will open
 * this many times in a row.
 */

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  pdf,
  fileName,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base64 of the rendered PDF, or null while it is still being built. */
  pdf: string | null;
  fileName: string;
  loading: boolean;
}) {
  const url = useBlobUrl(pdf);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-3 sm:max-w-5xl">
        <DialogHeader className="pr-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Preview</DialogTitle>
              <DialogDescription>
                The real document, rendered by the same template that issues it.
                It carries no number until you issue it.
              </DialogDescription>
            </div>

            {url ? (
              <Button asChild variant="outline" size="sm">
                <a href={url} download={fileName}>
                  <Download className="mr-2 h-4 w-4" />
                  Save a copy
                </a>
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          {loading || !url ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building the document
            </div>
          ) : (
            <iframe
              src={url}
              title="Invoice preview"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Base64 in, object URL out, revoked when it changes or the component goes.
 *
 * The URL is derived in a memo rather than pushed into state from an effect,
 * so the iframe has it on the first render that has a PDF at all. Doing it in
 * an effect would render an empty frame, then swap the source underneath it,
 * which the PDF viewer shows as a flash of nothing.
 */
function useBlobUrl(base64: string | null): string | null {
  const url = React.useMemo(() => {
    if (!base64) return null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  }, [base64]);

  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
