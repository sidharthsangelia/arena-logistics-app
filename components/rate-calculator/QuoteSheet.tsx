"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building2,
  Clock,
  Download,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Percent,
  Phone,
  User,
} from "lucide-react";
import { RateQuote, RateRequest } from "@/lib/types";
import { pdf } from "@react-pdf/renderer";
import QuoteDocument from "./QuoteDocument";

// ─── types ───────────────────────────────────────────────────────────────────

export interface ClientInfo {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: RateQuote;
  request: RateRequest;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const MARKUP_PRESETS = [5, 10, 15, 20];

const defaultClient: ClientInfo = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
};

// ─── component ───────────────────────────────────────────────────────────────

export default function QuoteSheet({ open, onOpenChange, quote, request }: Props) {
  const [step, setStep] = useState<"form" | "preview">("form");
  const [client, setClient] = useState<ClientInfo>(defaultClient);
  const [markup, setMarkup] = useState<number>(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Stable quote number for the session (regenerates per sheet open)
  const [quoteNumber] = useState(
    () => `FQ-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("form");
        setPdfUrl(null);
        setGenError(null);
      }, 300); // wait for close animation
    }
  }, [open]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const markupFactor = 1 + markup / 100;
  const finalTotal   = quote.totalWithTax * markupFactor;
  const markupAmount = quote.totalWithTax * (markup / 100);

  const setField =
    (field: keyof ClientInfo) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setClient((p) => ({ ...p, [field]: e.target.value }));

  const isFormValid =
    client.name.trim().length > 0 &&
    client.company.trim().length > 0 &&
    client.email.trim().length > 0;

  const handleGenerate = async () => {

    if (!request) {
    setGenError("Shipment request details are missing. Please close and try again.");
    return;
  }
  setGenerating(true);
  setGenError(null);
    
    try {
      const blob = await pdf(
        <QuoteDocument
          quote={quote}
          request={request}
          client={client}
          markupPercent={markup}
          quoteNumber={quoteNumber}
        />
      ).toBlob();

      // Revoke previous URL if any
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);

      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setStep("preview");
    } catch (err) {
      console.error("PDF generation failed:", err);
      setGenError("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    const safeName = (client.company || "quote").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.download = `${quoteNumber}_${safeName}.pdf`;
    a.click();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        {/* ── header ──────────────────────────────────────────────────── */}
        <SheetHeader className="sticky top-0 z-10 border-b bg-white px-6 py-4">
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
                  ? "Fill in client details and markup to create a professional PDF quote"
                  : `${quoteNumber} — ready to download`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 px-6 py-5 space-y-5">
          {/* ── service summary card ────────────────────────────────── */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {quote.productName}
                </p>
                <Badge
                  variant="outline"
                  className="mt-1.5 text-[10px]"
                >
                  {quote.vendorName}
                </Badge>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold text-slate-900">
                  {fmt(finalTotal, quote.currency)}
                </p>
                {markup > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Base: {fmt(quote.totalWithTax, quote.currency)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {quote.tatDays > 0 ? `${quote.tatDays} days transit` : "TAT TBD"}
              </span>
              {markup > 0 && (
                <span className="ml-auto rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  +{markup}% markup applied
                </span>
              )}
            </div>
          </div>

          {/* ── STEP 1: form ────────────────────────────────────────── */}
          {step === "form" && (
            <>
              {/* client info */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Client Information
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="q_name" className="text-xs flex items-center gap-1 text-slate-600">
                      <User className="h-3 w-3" />
                      Full name <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="q_name"
                      value={client.name}
                      onChange={setField("name")}
                      placeholder="John Smith"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="q_company" className="text-xs flex items-center gap-1 text-slate-600">
                      <Building2 className="h-3 w-3" />
                      Company <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="q_company"
                      value={client.company}
                      onChange={setField("company")}
                      placeholder="Acme Corp"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="q_email" className="text-xs flex items-center gap-1 text-slate-600">
                      <Mail className="h-3 w-3" />
                      Email <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="q_email"
                      type="email"
                      value={client.email}
                      onChange={setField("email")}
                      placeholder="john@acme.com"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="q_phone" className="text-xs flex items-center gap-1 text-slate-600">
                      <Phone className="h-3 w-3" />
                      Phone
                    </Label>
                    <Input
                      id="q_phone"
                      value={client.phone}
                      onChange={setField("phone")}
                      placeholder="+91 98765 43210"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="q_address" className="text-xs flex items-center gap-1 text-slate-600">
                    <MapPin className="h-3 w-3" />
                    Billing address
                  </Label>
                  <Input
                    id="q_address"
                    value={client.address}
                    onChange={setField("address")}
                    placeholder="123 Business Park, Mumbai 400001"
                    className="h-8 text-sm"
                  />
                </div>
              </section>

              <Separator />

              {/* markup */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Markup
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="q_markup" className="text-xs flex items-center gap-1 text-slate-600">
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
                      onChange={(e) => setMarkup(Math.max(0, Number(e.target.value)))}
                      className="h-8 pr-8 text-sm"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>

                  {/* preset chips */}
                  <div className="flex gap-1.5">
                    {MARKUP_PRESETS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setMarkup(v)}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                          markup === v
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                    {markup > 0 && !MARKUP_PRESETS.includes(markup) && (
                      <span className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {markup}% (custom)
                      </span>
                    )}
                  </div>
                </div>

                {/* price breakdown preview */}
                {markup > 0 && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between text-slate-500">
                      <span>Carrier price (incl. tax)</span>
                      <span>{fmt(quote.totalWithTax, quote.currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Markup ({markup}%)</span>
                      <span className="text-emerald-600">+ {fmt(markupAmount, quote.currency)}</span>
                    </div>
                    <Separator className="!my-1.5" />
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Client quoted price</span>
                      <span>{fmt(finalTotal, quote.currency)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 pt-0.5">
                      Markup is not shown on the generated quote.
                    </p>
                  </div>
                )}
              </section>

              {genError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2">
                  {genError}
                </p>
              )}

              <Button
                className="w-full"
                disabled={!isFormValid || generating}
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

          {/* ── STEP 2: preview ─────────────────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-4">
              {pdfUrl ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <iframe
                    src={pdfUrl}
                    title="Quote Preview"
                    className="w-full"
                    style={{ height: "520px" }}
                  />
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
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
                  disabled={!pdfUrl}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              <p className="text-center text-[10px] text-slate-400">
                {quoteNumber} · Valid 30 days · Markup not disclosed
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}