"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Receipt,
  Trash2,
  X,
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
  cancelManualInvoiceAction,
  deleteManualInvoiceDraftAction,
  duplicateManualInvoiceAction,
  emailManualInvoiceAction,
  setManualInvoicePaidAction,
} from "@/actions/invoices/manualInvoices.action";

/**
 * Everything an admin can do to a manual invoice from a list row.
 *
 * Takes the four facts it branches on rather than a whole row DTO, so it can sit
 * in the merged invoice table without that table having to carry a second,
 * manual-shaped copy of every row it renders.
 *
 * Every item here re-checks admin standing server-side; nothing is gated by
 * being rendered.
 */
export function ManualInvoiceRowActions({
  id,
  isDraft,
  isCancelled,
  isPaid,
  fileUrl,
  lastSentAt,
  onDone,
}: {
  id: string;
  isDraft: boolean;
  isCancelled: boolean;
  isPaid: boolean;
  fileUrl: string | null;
  lastSentAt: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "That did not work.");
        return;
      }
      toast.success(ok);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/arena-dashboard/invoices/manual/${id}`}>
            <Receipt className="mr-2 h-4 w-4" />
            Open invoice
          </Link>
        </DropdownMenuItem>

        {isDraft ? (
          <DropdownMenuItem asChild>
            <Link href={`/arena-dashboard/invoices/manual/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Continue editing
            </Link>
          </DropdownMenuItem>
        ) : null}

        {fileUrl ? (
          <DropdownMenuItem asChild>
            <a href={fileUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </DropdownMenuItem>
        ) : null}

        {!isDraft && !isCancelled ? (
          <DropdownMenuItem
            onClick={() =>
              run(() => emailManualInvoiceAction(id), "Invoice sent.")
            }
          >
            <Mail className="mr-2 h-4 w-4" />
            {lastSentAt ? "Send again" : "Send to customer"}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          onClick={async () => {
            setBusy(true);
            try {
              const result = await duplicateManualInvoiceAction(id);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              router.push(
                `/arena-dashboard/invoices/manual/${result.data.id}/edit`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate as new draft
        </DropdownMenuItem>

        {!isDraft && !isCancelled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                run(
                  () => setManualInvoicePaidAction(id, !isPaid),
                  isPaid ? "Marked unpaid." : "Marked paid.",
                )
              }
            >
              <Receipt className="mr-2 h-4 w-4" />
              {isPaid ? "Mark unpaid" : "Mark paid"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                const reason = window.prompt(
                  "Why is this invoice being cancelled? The number and the PDF are kept for the record.",
                );
                if (!reason) return;
                run(
                  () => cancelManualInvoiceAction(id, reason),
                  "Invoice cancelled.",
                );
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel invoice
            </DropdownMenuItem>
          </>
        ) : null}

        {isDraft ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (
                  !window.confirm("Delete this draft? It has no number yet.")
                ) {
                  return;
                }
                run(
                  () => deleteManualInvoiceDraftAction(id),
                  "Draft deleted.",
                );
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete draft
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
