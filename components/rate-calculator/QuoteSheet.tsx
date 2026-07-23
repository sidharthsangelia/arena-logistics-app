"use client";

/**
 * QuoteSheet.tsx
 *
 * RESPONSIBILITY
 * ──────────────
 * Slide-over panel for generating and downloading a freight quote PDF.
 *
 * CHANGES FROM V1
 * ───────────────
 * 1. Manual client fields replaced by <ClientSelector> (combobox against
 *    the DB) + <AddClientForm> (inline create-and-select). The user never
 *    types client details by hand unless they are a brand-new client.
 *
 * 2. On PDF download, `saveQuoteAction` is called to persist the quote to
 *    the database (Quote model). The Zustand `saveQuote` action is kept for
 *    the in-memory history slice (tab-session breadcrumb) but the source of
 *    truth is now the DB.
 *
 * 3. `ClientInfo` now carries an optional `clientId` field. When the user
 *    selects an existing client this is populated and the DB quote record
 *    is linked via the Client → Quote relation. Ad-hoc quotes (no client
 *    found / form fallback) save with clientId = null.
 *
 * 4. `pdfUrl` is still a blob: URL — local, non-serialisable, revoked on
 *    unmount. It is never stored in Zustand or the DB. The DB receives the
 *    UploadThing CDN URL only after upload (via updateQuotePdfAction).
 *
 * STATE THAT STAYS LOCAL (genuinely ephemeral UI)
 * ────────────────────────────────────────────────
 *   step          — which screen the sheet is showing
 *   selectedClient — the picked ClientSearchResult (cleared on close)
 *   showAddForm   — whether the inline new-client form is visible
 *   markup        — current markup input value
 *   pdfUrl        — blob: URL for the iframe preview
 *   generating    — PDF generation pending flag
 *   genError      — generation error message
 *   savedQuoteId  — DB id returned after saveQuoteAction; used by the
 *                   future UploadThing integration to call updateQuotePdfAction
 */

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Clock,
  Download,
  FileText,
  Loader2,
  Percent,
  Building2,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";

import type { RateQuote } from "@/lib/types";
import QuoteDocument from "./QuoteDocument";
import ClientSelector from "./ClientSelector";
import AddClientForm from "./AddClientForm";
import { useAppStore } from "@/store";
import { ClientSearchResult } from "@/actions/clientSrearch.action";
import { saveQuoteAction } from "@/actions/quote/quotes.action";
import { useUploadQuotePdf } from "@/hooks/useUploadPdfQuote";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { displayServiceName } from "@/lib/branding/serviceName";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * ClientInfo is the runtime view of "who this quote is for".
 * It is consumed by QuoteDocument (PDF rendering) and saveQuoteAction.
 *
 * clientId is optional: present when an existing DB client was selected,
 * absent for ad-hoc quotes.
 */
export interface ClientInfo {
  clientId?: string;
  name: string; // contactName or companyName fallback
  company: string;
  email: string;
  phone: string;
  address: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: RateQuote;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Build a ClientInfo from a DB search result. */
function clientInfoFromResult(c: ClientSearchResult): ClientInfo {
  return {
    clientId: c.id || undefined,
    name: c.contactName ?? c.companyName,
    company: c.companyName,
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: [c.addressLine1, c.city, c.country].filter(Boolean).join(", "),
  };
}

const MARKUP_PRESETS = [5, 10, 15, 20] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuoteSheet({ open, onOpenChange, quote }: Props) {
  // Store
  const request = useAppStore((s) => s.request);
  const saveQuote = useAppStore((s) => s.saveQuote);

  // Local UI
  const [step, setStep] = useState<"form" | "preview">("form");

  // Client selection
  const [selectedClient, setSelectedClient] =
    useState<ClientSearchResult | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Markup
  const [markup, setMarkup] = useState<number>(0);

  // PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [uploadedPdf, setUploadedPdf] = useState(false);

  // Saved quote DB id (used later by UploadThing integration)
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);

  // Stable quote number for the lifetime of this sheet instance
  const [quoteNumber] = useState(
    () =>
      `FQ-${new Date().getFullYear()}-${Math.floor(
        Math.random() * 90000 + 10000,
      )}`,
  );

  // ── Reset on close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("form");
        setPdfBlob(null);
        setSelectedClient(null);
        setShowAddForm(false);
        setMarkup(0);
        setPdfUrl(null);
        setGenError(null);
        setSavedQuoteId(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Revoke blob URL on unmount ────────────────────────────────────────────
useEffect(() => {
  return () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  };
}, [pdfUrl]);

  // ── Derived values ────────────────────────────────────────────────────────
  // Vendor identity stays out of the customer-facing badge and the PDF that
  // lands in the client's inbox. Arena staff keep the full sourcing detail.
  const isArena = useIsArenaOrg();
  const markupFactor = 1 + markup / 100;
  const finalTotal = quote.totalWithTax * markupFactor;
  const markupAmount = quote.totalWithTax * (markup / 100);

  // The client info object fed to QuoteDocument + saveQuoteAction
  const clientInfo: ClientInfo | null = selectedClient
    ? clientInfoFromResult(selectedClient)
    : null;

  // Form is valid when a client is selected (either from DB or freshly added)
  const isFormValid = clientInfo !== null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const { uploadPdf, isUploading, uploadError } = useUploadQuotePdf();

  const handleClientSelect = (client: ClientSearchResult) => {
    setSelectedClient(client);
    setShowAddForm(false);
  };

  const handleClientAdded = (client: ClientSearchResult) => {
    setSelectedClient(client);
    setShowAddForm(false);
  };

  const handleGenerate = async () => {
    if (!request || !clientInfo) {
      setGenError("Client or shipment details are missing.");
      return;
    }

    setGenerating(true);
    setGenError(null);

    try {
      const blob = await pdf(
        <QuoteDocument
          quote={quote}
          request={request}
          client={clientInfo}
          markupPercent={markup}
          quoteNumber={quoteNumber}
          showVendor={isArena}
        />,
      ).toBlob();

      setPdfBlob(blob);

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);

      setPdfUrl(URL.createObjectURL(blob));
      setStep("preview");
    } catch (err) {
      console.error("PDF generation failed:", err);
      setGenError("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

// In QuoteSheet.tsx — handleDownload
const handleDownload = async () => {
  if (!pdfUrl || !pdfBlob || !request || !clientInfo) return;

  const safeName = (clientInfo.company || "quote")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  const fileName = `${quoteNumber}_${safeName}.pdf`;

  // 1. Trigger local download immediately — don't wait for upload
  const a = document.createElement("a");
  a.href = pdfUrl;
  a.download = fileName;
  a.click();

  try {
    // 2. Save DB record
    let quoteId = savedQuoteId;
    if (!quoteId) {
      const result = await saveQuoteAction({
        quoteNumber,
        quote,
        request,
        client: clientInfo,
        markupPercent: markup,
        pdfUrl: null,
        pdfKey: null,
      });

      if (!result.success) {
        toast.error("Quote downloaded but could not be saved to database.");
        return;
      }

      quoteId = result.quoteId;
      setSavedQuoteId(quoteId);
    }

    // 3. Upload with retry
    if (!uploadedPdf) {
      const uploadResult = await uploadPdf({ blob: pdfBlob, quoteId, fileName });

      if (uploadResult.success) {
        setUploadedPdf(true);
        toast.success("Quote saved and PDF uploaded.");
      } else {
        // Upload failed after all retries
        toast.error(
          "PDF downloaded locally but could not be saved to cloud. " +
          "You can re-upload it from the Quotes page.",
          { duration: 8000 }
        );
        // Don't throw — the quote DB record exists, just without a pdfUrl.
        // Fix 1 above means the /quotes page handles this gracefully.
      }
    }

    saveQuote({ request, quote, markupPercent: markup, quoteNumber });
  } catch (error) {
    console.error(error);
    toast.error("Something went wrong saving the quote.");
  }
};

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        {/* Header */}
        <SheetHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 h-7 w-7 shrink-0"
                onClick={() => setStep("form")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <SheetTitle className="text-base">
                {step === "form" ? "Generate Quote" : "Quote Preview"}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">
                {step === "form"
                  ? "Select a client and set markup to create a professional PDF quote"
                  : `${quoteNumber} — ready to download`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 px-6 py-5 space-y-5">
          {/* Service summary card */}
          <div className="rounded-lg border bg-muted/40 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {displayServiceName(quote.productName, isArena)}
                </p>
                {isArena && (
                  <Badge variant="outline" className="mt-1.5 text-[10px]">
                    {quote.vendorName}
                  </Badge>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold">
                  {fmt(finalTotal, quote.currency)}
                </p>
                {markup > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Base: {fmt(quote.totalWithTax, quote.currency)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {quote.tatDays > 0
                  ? `${quote.tatDays} days transit`
                  : "TAT TBD"}
              </span>
              {markup > 0 && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  +{markup}% markup
                </Badge>
              )}
            </div>
          </div>

          {/* ── STEP 1: form ──────────────────────────────────────────────── */}
          {step === "form" && (
            <>
              {/* Client selector section */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Client
                </h3>

                {!showAddForm ? (
                  <>
                    <ClientSelector
                      value={selectedClient}
                      onSelect={handleClientSelect}
                      onAddNew={() => setShowAddForm(true)}
                    />

                    {/* Selected client summary */}
                    {selectedClient && (
                      <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {selectedClient.companyName}
                        </div>
                        {selectedClient.contactName && (
                          <p className="text-xs text-muted-foreground pl-5">
                            {selectedClient.contactName}
                          </p>
                        )}
                        {selectedClient.email && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {selectedClient.email}
                          </div>
                        )}
                        {selectedClient.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {selectedClient.phone}
                          </div>
                        )}
                        {(selectedClient.addressLine1 ||
                          selectedClient.city) && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {[
                              selectedClient.addressLine1,
                              selectedClient.city,
                              selectedClient.country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <AddClientForm
                    onSaved={handleClientAdded}
                    onCancel={() => setShowAddForm(false)}
                  />
                )}
              </section>

              <Separator />

              {/* Markup section */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Markup
                </h3>

                <div className="space-y-2">
                  <Label
                    htmlFor="q_markup"
                    className="text-xs flex items-center gap-1"
                  >
                    <Percent className="h-3 w-3" />
                    Markup percentage
                  </Label>
                  <div className="relative">
                    <Input
                      id="q_markup"
                      type="number"
                      min={0}
                      max={200}
                      step={0.5}
                      value={markup}
                      onChange={(e) =>
                        setMarkup(Math.max(0, Number(e.target.value)))
                      }
                      className="h-8 pr-8 text-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    {MARKUP_PRESETS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMarkup(v)}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          markup === v
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                    {markup > 0 &&
                      !MARKUP_PRESETS.includes(
                        markup as (typeof MARKUP_PRESETS)[number],
                      ) && (
                        <span className="rounded border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                          {markup}% (custom)
                        </span>
                      )}
                  </div>
                </div>

                {markup > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Carrier price (incl. tax)</span>
                      <span>{fmt(quote.totalWithTax, quote.currency)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Markup ({markup}%)</span>
                      <span>+ {fmt(markupAmount, quote.currency)}</span>
                    </div>
                    <Separator className="!my-1.5" />
                    <div className="flex justify-between font-medium">
                      <span>Client quoted price</span>
                      <span>{fmt(finalTotal, quote.currency)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-0.5">
                      Markup is not shown on the generated quote.
                    </p>
                  </div>
                )}
              </section>

              {genError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
                  {genError}
                </p>
              )}

              <Button
                className="w-full"
                disabled={!isFormValid || generating || showAddForm}
                onClick={handleGenerate}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating PDF…
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate &amp; Preview Quote
                  </>
                )}
              </Button>
            </>
          )}

          {/* ── STEP 2: preview ───────────────────────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-4">
              {pdfUrl ? (
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    src={pdfUrl}
                    title="Quote Preview"
                    className="w-full"
                    style={{ height: "520px" }}
                  />
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg border bg-muted/30">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {uploadError && (
  <p className="rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
    {uploadError}
  </p>
)}

              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("form")}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Edit details
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleDownload}
                  disabled={!pdfUrl || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>

              <p className="text-center text-[10px] text-muted-foreground">
                {quoteNumber} · Valid 7 days · Markup not disclosed
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
