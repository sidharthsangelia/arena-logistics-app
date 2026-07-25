"use client";

import * as React from "react";
import { FileText, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUploadThing } from "@/utils/uploadthing";
import {
  createInvoiceAction,
  listInvoiceOrgsAction,
  listOrgShipmentsForInvoiceAction,
} from "@/actions/invoices/invoices.action";
import { createInvoiceSchema, formatFileSize } from "@/lib/invoices/config";

import { AsyncCombobox, type ComboOption } from "./AsyncCombobox";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type FieldErrors = Record<string, string>;

/**
 * The Arena admin's "issue an invoice" panel. The PDF uploads first (admin-gated
 * orgInvoice route); once storage returns the file, createInvoiceAction writes
 * the billing row with the rest of the fields. Kept in a Sheet so the table
 * behind it stays visible.
 */
export function NewInvoiceSheet({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [org, setOrg] = React.useState<ComboOption | null>(null);
  const [shipment, setShipment] = React.useState<ComboOption | null>(null);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<string>("INR");
  const [issueDate, setIssueDate] = React.useState(todayIso());
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const { startUpload } = useUploadThing("orgInvoice");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function resetForm() {
    setOrg(null);
    setShipment(null);
    setInvoiceNumber("");
    setAmount("");
    setCurrency("INR");
    setIssueDate(todayIso());
    setDueDate("");
    setNotes("");
    setFile(null);
    setErrors({});
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) resetForm();
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      setErrors((p) => ({ ...p, file: "Invoice must be a PDF." }));
      return;
    }
    if (picked.size > 16 * 1024 * 1024) {
      setErrors((p) => ({ ...p, file: "File too large. Max 16 MB." }));
      return;
    }
    setErrors((p) => {
      const next = { ...p };
      delete next.file;
      return next;
    });
    setFile(picked);
  }

  async function handleSubmit() {
    setErrors({});

    if (!file) {
      setErrors({ file: "Attach the invoice PDF." });
      return;
    }

    // Validate the billing fields before spending an upload.
    const candidate = {
      orgId: org?.id ?? "",
      shipmentId: shipment?.id ?? null,
      invoiceNumber: invoiceNumber.trim(),
      amount: Number(amount),
      currency,
      issueDate,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      // placeholder file fields, replaced after upload — kept valid so the same
      // schema can pre-check the rest of the form.
      fileUrl: "https://placeholder.local/pending.pdf",
      fileKey: "pending",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    };

    const pre = createInvoiceSchema.safeParse(candidate);
    if (!pre.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of pre.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await startUpload([file]);
      const data = uploaded?.[0]?.serverData;
      if (!data?.url) {
        toast.error("The file upload failed. Please try again.");
        setSubmitting(false);
        return;
      }

      const res = await createInvoiceAction({
        ...pre.data,
        fileUrl: data.url,
        fileKey: data.key,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      });

      if (!res.ok) {
        toast.error(res.error);
        setSubmitting(false);
        return;
      }

      toast.success(`Invoice ${pre.data.invoiceNumber} issued.`);
      setOpen(false);
      resetForm();
      onCreated();
    } catch {
      toast.error("Something went wrong issuing the invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        New invoice
      </Button>

      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Issue an invoice</SheetTitle>
          <SheetDescription>
            Bill a customer organisation. Attach the PDF and record what it is
            for.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-6 py-5">
          {/* Bill to */}
          <div className="space-y-1.5">
            <Label>Bill to</Label>
            <AsyncCombobox
              value={org}
              onChange={(next) => {
                setOrg(next);
                setShipment(null); // shipment belongs to a specific org
              }}
              fetcher={async (q) => listInvoiceOrgsAction(q)}
              placeholder="Search organisations…"
              emptyText="No organisations found."
            />
            {errors.orgId && (
              <p className="text-xs text-red-600">{errors.orgId}</p>
            )}
          </div>

          {/* Shipment (optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Shipment</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <AsyncCombobox
              value={shipment}
              onChange={setShipment}
              disabled={!org}
              allowClear
              clearLabel="No shipment (standalone)"
              fetcher={async (q) =>
                org ? listOrgShipmentsForInvoiceAction(org.id, q) : []
              }
              placeholder={
                org ? "Search this org's shipments…" : "Choose an organisation first"
              }
              emptyText="No shipments found."
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for a standalone or consolidated invoice.
            </p>
          </div>

          <Separator />

          {/* Invoice number */}
          <div className="space-y-1.5">
            <Label htmlFor="inv-number">Invoice number</Label>
            <Input
              id="inv-number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-0042"
              className="h-9"
            />
            {errors.invoiceNumber && (
              <p className="text-xs text-red-600">{errors.invoiceNumber}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Use the number printed on the PDF from your accounting system.
            </p>
          </div>

          {/* Amount + currency */}
          <div className="space-y-1.5">
            <Label htmlFor="inv-amount">Amount</Label>
            <div className="flex gap-2">
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="inv-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 flex-1"
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-red-600">{errors.amount}</p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-issue">Issue date</Label>
              <Input
                id="inv-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="h-9"
              />
              {errors.issueDate && (
                <p className="text-xs text-red-600">{errors.issueDate}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-due">Due date</Label>
                <span className="text-xs text-muted-foreground">Optional</span>
              </div>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                min={issueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
              {errors.dueDate && (
                <p className="text-xs text-red-600">{errors.dueDate}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="inv-notes">Notes</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <Textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the customer should see about this invoice."
              rows={2}
              className="resize-none"
            />
          </div>

          <Separator />

          {/* File */}
          <div className="space-y-1.5">
            <Label>Invoice PDF</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFilePick}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFile(null)}
                  disabled={submitting}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed py-6 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40",
                  errors.file && "border-red-300",
                )}
              >
                <Upload className="h-5 w-5" />
                <span>Click to attach a PDF</span>
                <span className="text-xs">Max 16 MB</span>
              </button>
            )}
            {errors.file && (
              <p className="text-xs text-red-600">{errors.file}</p>
            )}
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {submitting ? "Issuing…" : "Issue invoice"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
