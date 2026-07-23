"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Send,
  Paperclip,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Building2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  sendQuoteEmailAction,
  getQuoteClientEmailAction,
} from "@/actions/quote/quoteEmail.action";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { displayServiceName } from "@/lib/branding/serviceName";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendQuoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: {
    id: string;
    quoteNumber: string;
    productName: string;
    vendorName: string;
    quotedTotal: number;
    currency: string;
    validUntil: Date | null;
    pdfUrl: string | null;
  };
  client: {
    companyName: string;
    contactName: string | null;
    email: string | null;
  };
};

type ClientInfo = {
  companyName: string;
  contactName: string | null;
  email: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function buildBody(
  quote: SendQuoteDialogProps["quote"],
  client: ClientInfo,
  showVendor: boolean,
) {
  const contact = client.contactName ?? client.companyName;
  const total = fmt(quote.quotedTotal, quote.currency);
  const validUntil = fmtDate(quote.validUntil);

  return [
    `Dear ${contact},`,
    "",
    `Thank you for the opportunity to submit our quotation. Please find the details of Quote #${quote.quoteNumber} below.`,
    "",
    `Product / Service: ${displayServiceName(quote.productName, showVendor)}`,
    // Vendor identity is Arena-internal — it never goes into the customer email.
    showVendor ? `Vendor: ${quote.vendorName}` : null,
    `Total Amount: ${total}`,
    validUntil ? `Valid Until: ${validUntil}` : null,
    "",
    `You can view and download the full quote document using the link provided below.`,
    "",
    `Should you have any questions or require clarification, please do not hesitate to reach out. We look forward to the opportunity to serve ${client.companyName}.`,
    "",
    `Warm regards,`,
    `Arena Logistics Team`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}





// ─── Main component ───────────────────────────────────────────────────────────

export default function SendQuoteDialog({
  open,
  onOpenChange,
  quote,
  client: clientProp,
}: SendQuoteDialogProps) {
  const isArena = useIsArenaOrg();
  const [client, setClient] = useState<ClientInfo>(clientProp);
  const [fetchingEmail, setFetchingEmail] = useState(false);

  const [to, setTo] = useState(clientProp.email ?? "");
  const [subject, setSubject] = useState(
    `Quotation #${quote.quoteNumber} – ${displayServiceName(quote.productName, isArena)} | Arena Logistics`,
  );
  const [body, setBody] = useState(() => buildBody(quote, clientProp, isArena));
  const [markAsSent, setMarkAsSent] = useState(true);

  const [banner, setBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasPdf = Boolean(quote.pdfUrl);
  const disabled = isPending || sent;

  const router = useRouter();

  // Fetch fresh client email from DB on open
  useEffect(() => {
    if (!open) return;
    setFetchingEmail(true);
    getQuoteClientEmailAction(quote.id)
      .then((result) => {
        if (result.success) {
          const fresh: ClientInfo = {
            companyName: result.companyName,
            contactName: result.contactName,
            email: result.email,
          };
          setClient(fresh);
          setTo(result.email ?? "");
          setBody(buildBody(quote, fresh, isArena));
        }
      })
      .finally(() => setFetchingEmail(false));
  }, [open, quote.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setClient(clientProp);
    setBanner(null);
    setSent(false);
    setTo(clientProp.email ?? "");
    setSubject(
      `Quotation #${quote.quoteNumber} – ${displayServiceName(quote.productName, isArena)} | Arena Logistics`,
    );
    setBody(buildBody(quote, clientProp, isArena));
    setMarkAsSent(true);
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) setTimeout(reset, 200);
    onOpenChange(next);
  }

  function handleSend() {
    setBanner(null);
    if (!to.trim()) {
      setBanner({ type: "error", message: "Recipient email is required." });
      return;
    }
    if (!subject.trim()) {
      setBanner({ type: "error", message: "Subject is required." });
      return;
    }
    if (!hasPdf) {
      setBanner({
        type: "error",
        message: "No PDF found. Generate a PDF for this quote first.",
      });
      return;
    }

    startTransition(async () => {
      const result = await sendQuoteEmailAction({
        quoteId: quote.id,
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        pdfUrl: quote.pdfUrl!,
        markAsSent,
      });

    if (result.success) {
  toast.success(
    markAsSent
      ? "Email sent and quote marked as Sent."
      : "Email sent successfully.",
  );

  router.refresh();

  handleOpenChange(false);
} else {
        setBanner({ type: "error", message: result.error });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
<DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl">

        {/* ── Header ── */}
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-semibold leading-snug">
                Send Quote by Email
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                #{quote.quoteNumber} &middot;{" "}
                {fmt(quote.quotedTotal, quote.currency)}
                {quote.validUntil && (
                  <> &middot; valid until {fmtDate(quote.validUntil)}</>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Client strip ── */}
        <div className="flex items-center gap-5 border-b bg-muted/30 px-6 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground">
              {client.companyName || "—"}
            </span>
          </div>
          {client.contactName && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span>{client.contactName}</span>
            </div>
          )}
        </div>

        {/* ── Form fields ── */}
     <div className="flex-1 overflow-y-auto">
  <div className="space-y-4 px-6 py-5">

          {/* Banner */}
          {banner && (
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
                banner.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
              )}
            >
              {banner.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>
          )}

          {/* To */}
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              To
            </Label>
            <div className="relative">
              <Input
                id="to"
                type="email"
                placeholder={fetchingEmail ? "Fetching…" : "client@company.com"}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={disabled || fetchingEmail}
                className="pr-9 font-mono text-sm"
              />
              {fetchingEmail && (
                <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="subject" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Subject
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={disabled}
              className="text-sm"
            />
          </div>

          {/* Attachment row */}
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5",
              hasPdf
                ? "bg-muted/30"
                : "border-dashed border-destructive/40 bg-destructive/5",
            )}
          >
            <Paperclip
              className={cn(
                "h-4 w-4 shrink-0",
                hasPdf ? "text-muted-foreground" : "text-destructive",
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-xs font-medium",
                  !hasPdf && "text-destructive",
                )}
              >
                {hasPdf
                  ? `Quote-${quote.quoteNumber}.pdf`
                  : "No PDF — generate one first"}
              </p>
              {hasPdf && (
                <p className="text-[11px] text-muted-foreground">
                  Delivered as a download link in the email
                </p>
              )}
            </div>
            {hasPdf && (
              <Link
                href={quote.pdfUrl!}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  tabIndex={-1}
                >
                  <ExternalLink className="h-3 w-3" />
                  Preview
                </Button>
              </Link>
            )}
          </div>

          {/* Body textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="body" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={disabled}
              rows={12}
                className="min-h-[280px] resize-none font-mono text-[13px] leading-relaxed"
              placeholder="Email body…"
            />
          </div>

          {/* Mark as sent toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium leading-none">
                Mark quote as Sent
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Updates status automatically after sending
              </p>
            </div>
            <Switch
              checked={markAsSent}
              onCheckedChange={setMarkAsSent}
              disabled={disabled}
            />
          </div>
        </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3.5">
          <p className="text-xs text-muted-foreground">
            From{" "}
            <span className="font-mono font-medium text-foreground">
              {process.env.NEXT_PUBLIC_FROM_EMAIL ?? "quotes@yourdomain.com"}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {sent ? "Close" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={disabled || !hasPdf || fetchingEmail}
              className="min-w-[110px] gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : sent ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sent
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}