"use client";

/**
 * What can be done to a customer from their own page: correct them, raise them
 * an invoice, or remove one nobody has ever billed.
 *
 * A client island on an otherwise server-rendered page, so the particulars and
 * the invoice history stay static HTML and only the buttons ship JavaScript.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { BillingPartyDetail } from "@/lib/invoices/manual/config";
import { BillingPartyDialog } from "@/components/invoices/manual/BillingPartyDialog";
import { deleteBillingPartyAction } from "@/actions/invoices/manualInvoices.action";

export function BillingPartyActions({
  party,
  /**
   * Issued invoices, drafts excluded. Removing is offered only at zero: an
   * issued invoice is a document somebody is holding, and a customer list you
   * can empty of people who owe money is a list nobody can trust.
   */
  issuedCount,
}: {
  party: BillingPartyDetail;
  issuedCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  async function remove() {
    setRemoving(true);
    try {
      const result = await deleteBillingPartyAction(party.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${party.legalName} removed.`);
      router.push("/arena-dashboard/invoices/customers");
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit details
        </Button>

        <Button asChild variant="outline">
          <Link href={`/arena-dashboard/invoices/new?party=${party.id}`}>
            <FileText className="mr-2 h-4 w-4" />
            New invoice
          </Link>
        </Button>

        {issuedCount === 0 ? (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>

      <BillingPartyDialog
        open={editing}
        onOpenChange={setEditing}
        party={party}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {party.legalName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They come off the customer list and out of the invoice form&rsquo;s
              picker. Nothing has been invoiced to them, so there is no document
              to lose. Any drafts naming them stay where they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={removing}>
              {removing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing
                </>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
