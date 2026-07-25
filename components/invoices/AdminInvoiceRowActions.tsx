"use client";

import * as React from "react";
import {
  Ban,
  CircleCheck,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InvoiceStatus } from "@/generated/prisma";
import {
  deleteInvoiceAction,
  setInvoiceStatusAction,
} from "@/actions/invoices/invoices.action";
import type { InvoiceRow } from "@/lib/invoices/config";

/**
 * The per-row actions on the Arena invoice table. Money-shaped changes (paid,
 * void) sit behind a click; the destructive delete sits behind a confirm.
 */
export function AdminInvoiceRowActions({
  invoice,
  onView,
  onEdit,
  onChanged,
}: {
  invoice: InvoiceRow;
  onView: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [confirmVoid, setConfirmVoid] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";

  async function changeStatus(status: InvoiceStatus, successMsg: string) {
    setBusy(true);
    try {
      const res = await setInvoiceStatusAction(invoice.id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(successMsg);
      onChanged();
    } catch {
      toast.error("Could not update the invoice.");
    } finally {
      setBusy(false);
      setConfirmVoid(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await deleteInvoiceAction(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice deleted.");
      onChanged();
    } catch {
      toast.error("Could not delete the invoice.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onView(invoice)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={invoice.fileUrl} download={invoice.fileName}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {!isCancelled &&
            (isPaid ? (
              <DropdownMenuItem
                onClick={() =>
                  changeStatus(InvoiceStatus.UNPAID, "Marked as unpaid.")
                }
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Mark unpaid
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() =>
                  changeStatus(InvoiceStatus.PAID, "Marked as paid.")
                }
              >
                <CircleCheck className="mr-2 h-4 w-4" />
                Mark paid
              </DropdownMenuItem>
            ))}

          <DropdownMenuItem onClick={() => onEdit(invoice)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>

          {!isCancelled && (
            <DropdownMenuItem onClick={() => setConfirmVoid(true)}>
              <Ban className="mr-2 h-4 w-4" />
              Void
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Void confirm */}
      <AlertDialog open={confirmVoid} onOpenChange={setConfirmVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void invoice {invoice.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays on record as cancelled and the customer can still see it,
              but it no longer counts as owed. You can reissue a corrected
              invoice afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                changeStatus(InvoiceStatus.CANCELLED, "Invoice voided.");
              }}
            >
              Void invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice {invoice.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from both dashboards. The PDF stays in storage but
              the record is hidden. Prefer voiding if you only want to cancel the
              charge.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
