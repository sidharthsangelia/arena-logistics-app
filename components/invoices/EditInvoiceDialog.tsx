"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { updateInvoiceAction } from "@/actions/invoices/invoices.action";
import { updateInvoiceSchema, type InvoiceRow } from "@/lib/invoices/config";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
type FieldErrors = Record<string, string>;

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Edit an existing invoice's billing fields. The PDF itself is not replaced
 * here; to swap the file, void this invoice and issue a fresh one.
 *
 * The form body is a separate component keyed by invoice id, so it initialises
 * its state straight from props on mount rather than syncing via an effect.
 */
export function EditInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {invoice && (
          <EditInvoiceForm
            key={invoice.id}
            invoice={invoice}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditInvoiceForm({
  invoice,
  onOpenChange,
  onSaved,
}: {
  invoice: InvoiceRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = React.useState(invoice.invoiceNumber);
  const [amount, setAmount] = React.useState(String(invoice.amount));
  const [currency, setCurrency] = React.useState(invoice.currency);
  const [issueDate, setIssueDate] = React.useState(toDateInput(invoice.issueDate));
  const [dueDate, setDueDate] = React.useState(toDateInput(invoice.dueDate));
  const [notes, setNotes] = React.useState(invoice.notes ?? "");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setErrors({});

    const parsed = updateInvoiceSchema.safeParse({
      invoiceNumber: invoiceNumber.trim(),
      amount: Number(amount),
      currency,
      issueDate,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await updateInvoiceAction(invoice.id, parsed.data);
      if (!res.ok) {
        toast.error(res.error);
        setSaving(false);
        return;
      }
      toast.success("Invoice updated.");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Could not update the invoice.");
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit invoice</DialogTitle>
        <DialogDescription>
          Update the billing details for {invoice.orgName}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-number">Invoice number</Label>
          <Input
            id="edit-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="h-9"
          />
          {errors.invoiceNumber && (
            <p className="text-xs text-red-600">{errors.invoiceNumber}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-amount">Amount</Label>
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
              id="edit-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 flex-1"
            />
          </div>
          {errors.amount && (
            <p className="text-xs text-red-600">{errors.amount}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-issue">Issue date</Label>
            <Input
              id="edit-issue"
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
            <Label htmlFor="edit-due">Due date</Label>
            <Input
              id="edit-due"
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

        <div className="space-y-1.5">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}
