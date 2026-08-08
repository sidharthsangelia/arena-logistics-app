"use client";

/**
 * What can still be done to an issued invoice: send it, mark it paid, cancel
 * it, credit it, or copy it into a new draft.
 *
 * Editing is deliberately absent. An issued invoice is frozen, and the
 * correction path is the credit note here.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Mail, Receipt, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ManualInvoiceStatus } from "@/generated/prisma";
import {
  cancelManualInvoiceAction,
  createCreditNoteAction,
  duplicateManualInvoiceAction,
  emailManualInvoiceAction,
  setManualInvoicePaidAction,
} from "@/actions/invoices/manualInvoices.action";

export function ManualInvoiceActions({
  id,
  status,
  partyEmail,
  alreadySent,
}: {
  id: string;
  status: ManualInvoiceStatus;
  partyEmail: string | null;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const isPaid = status === ManualInvoiceStatus.PAID;
  const isCancelled = status === ManualInvoiceStatus.CANCELLED;

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok: string,
  ) {
    setBusy(key);
    try {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "That did not work.");
        return;
      }
      toast.success(ok);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {!isCancelled ? (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() => setSending(true)}
        >
          <Mail className="mr-2 h-4 w-4" />
          {alreadySent ? "Send again" : "Send to customer"}
        </Button>
      ) : null}

      {!isCancelled ? (
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            run(
              "paid",
              () => setManualInvoicePaidAction(id, !isPaid),
              isPaid ? "Marked unpaid." : "Marked paid.",
            )
          }
        >
          {busy === "paid" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Receipt className="mr-2 h-4 w-4" />
          )}
          {isPaid ? "Mark unpaid" : "Mark paid"}
        </Button>
      ) : null}

      <Button
        variant="outline"
        disabled={busy !== null}
        onClick={async () => {
          setBusy("duplicate");
          try {
            const result = await duplicateManualInvoiceAction(id);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            router.push(`/arena-dashboard/invoices/manual/${result.data.id}/edit`);
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === "duplicate" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        Duplicate
      </Button>

      {/* The correction path for a frozen document. Opens a pre-filled draft
          rather than issuing anything, so the admin decides what is actually
          being credited before a second serial is spent. */}
      <Button
        variant="outline"
        disabled={busy !== null}
        onClick={async () => {
          setBusy("credit");
          try {
            const result = await createCreditNoteAction(id);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            router.push(`/arena-dashboard/invoices/manual/${result.data.id}/edit`);
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === "credit" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="mr-2 h-4 w-4" />
        )}
        Raise a credit note
      </Button>

      {!isCancelled ? (
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy !== null}
          onClick={() => setCancelling(true)}
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      ) : null}

      <SendDialog
        open={sending}
        onOpenChange={setSending}
        defaultEmail={partyEmail}
        onSend={async (to) => {
          const result = await emailManualInvoiceAction(id, to || undefined);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(`Sent to ${result.data.sentTo}.`);
          router.refresh();
          return true;
        }}
      />

      <CancelDialog
        open={cancelling}
        onOpenChange={setCancelling}
        onCancel={async (reason) => {
          const result = await cancelManualInvoiceAction(id, reason);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success("Invoice cancelled.");
          router.refresh();
          return true;
        }}
      />
    </>
  );
}

/**
 * The dialog shells hold no state of their own. Radix unmounts DialogContent
 * when closed, so the form inside it is a separate component whose useState
 * initialiser runs fresh on every open. That is what a reset-on-open effect was
 * simulating, and this needs no effect and no extra render.
 */
function SendDialog({
  open,
  onOpenChange,
  defaultEmail,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string | null;
  onSend: (to: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send the invoice</DialogTitle>
          <DialogDescription>
            The PDF goes out as an attachment. Change the address if it should go
            somewhere other than the one on file.
          </DialogDescription>
        </DialogHeader>

        <SendForm
          defaultEmail={defaultEmail}
          onCancel={() => onOpenChange(false)}
          onSend={async (to) => {
            if (await onSend(to)) onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SendForm({
  defaultEmail,
  onCancel,
  onSend,
}: {
  defaultEmail: string | null;
  onCancel: () => void;
  onSend: (to: string) => Promise<void>;
}) {
  const [to, setTo] = React.useState(defaultEmail ?? "");
  const [busy, setBusy] = React.useState(false);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="send-to">Send to</Label>
        <Input
          id="send-to"
          type="email"
          autoFocus
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="accounts@customer.com"
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={busy || !to.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSend(to.trim());
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Send
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (reason: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this invoice</DialogTitle>
          <DialogDescription>
            The number and the PDF are kept. An issued serial cannot be withdrawn
            from existence, and a gap where one used to be is worse than a
            document marked cancelled. If the customer already has it, raise a
            credit note instead.
          </DialogDescription>
        </DialogHeader>

        <CancelForm
          onKeep={() => onOpenChange(false)}
          onCancel={async (reason) => {
            if (await onCancel(reason)) onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CancelForm({
  onKeep,
  onCancel,
}: {
  onKeep: () => void;
  onCancel: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="cancel-reason">Reason</Label>
        <Textarea
          id="cancel-reason"
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Raised against the wrong customer"
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" disabled={busy} onClick={onKeep}>
          Keep it
        </Button>
        <Button
          variant="destructive"
          disabled={busy || reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            try {
              await onCancel(reason.trim());
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Cancel invoice
        </Button>
      </DialogFooter>
    </>
  );
}
