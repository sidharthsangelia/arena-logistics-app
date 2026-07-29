"use client";

/**
 * KycWaiverControl
 *
 * The Arena admin control for the KYC waiver: "they spoke to ops, let them book
 * on Aadhaar alone". One switch, plus the record of the live waiver underneath
 * it.
 *
 * CONTENT ONLY, NO CARD CHROME. It sits in the Business settings card on an
 * account's detail page, alongside Skip payment, and inside KycWaiverCard on a
 * client's detail page where there is no settings card to join. Whoever renders
 * it owns the surrounding card, the same split the ops booking-detail panels
 * use.
 *
 * ADMIN ONLY. Callers render it behind an admin check and the two server
 * actions re-check for themselves, so a member who reaches it another way still
 * gets nowhere. Nothing here is ever rendered tenant-side.
 *
 * SAVES ON CONFIRM, not on the host card's Save button. Turning the switch on
 * opens a dialog for the reason and an expiry, because a compliance exception
 * with no stated reason and no end date is the thing this feature exists to
 * avoid; turning it off lifts the waiver there and then. Staging either behind a
 * Save would invent a half-waived state that means nothing, so the row says
 * plainly that it applies immediately.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { grantKycWaiver, revokeKycWaiver } from "@/actions/kyc/waiver.action";
import {
  MAX_WAIVER_DAYS,
  defaultWaiverExpiry,
  waiverReasonSchema,
} from "@/lib/booking/waiverSchema";

// ---------------------------------------------------------------------------
// Props — dates arrive as ISO strings, since this is a client component
// ---------------------------------------------------------------------------

export type WaiverParty =
  | { partyType: "ORG"; orgId: string }
  | { partyType: "CLIENT"; clientId: string };

export interface KycWaiverSummary {
  id: string;
  reason: string;
  /** ISO string. */
  expiresAt: string;
  grantedByName: string | null;
  /** ISO string. */
  grantedAt: string;
}

type Props = {
  party: WaiverParty;
  /** The org or client this waiver is for, named in the confirmation copy. */
  partyName: string;
  /** The live waiver, or null when there isn't one. */
  waiver: KycWaiverSummary | null;
  /** Host card is mid-save: the switch goes quiet rather than racing it. */
  disabled?: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days from now until an ISO instant, rounded up. Never negative. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** The date input's ceiling, so the picker can't offer an invalid expiry. */
function maxExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + MAX_WAIVER_DAYS);
  return date.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function KycWaiverControl({
  party,
  partyName,
  waiver,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState(defaultWaiverExpiry());
  const [reasonError, setReasonError] = useState<string | null>(null);

  const isActive = waiver !== null;
  const busy = isPending || disabled;

  function openGrantDialog() {
    setReason("");
    setExpiresOn(defaultWaiverExpiry());
    setReasonError(null);
    setGrantOpen(true);
  }

  function handleToggle(next: boolean) {
    if (next) {
      openGrantDialog();
    } else {
      setRevokeOpen(true);
    }
  }

  function handleGrant() {
    const parsed = waiverReasonSchema.safeParse(reason);
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? "Add a reason.");
      return;
    }
    setReasonError(null);

    startTransition(async () => {
      const result = await grantKycWaiver({
        party,
        reason: parsed.data,
        expiresOn,
      });

      if (result.success) {
        setGrantOpen(false);
        toast.success("KYC waiver recorded.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRevoke() {
    if (!waiver) return;

    startTransition(async () => {
      const result = await revokeKycWaiver({ waiverId: waiver.id });

      if (result.success) {
        setRevokeOpen(false);
        toast.success("KYC waiver lifted.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="skip-kyc" className="cursor-pointer">
              Skip KYC
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                For customers who have spoken to the operations team and cannot
                produce their full paperwork yet. Bookings then need an Aadhaar
                card only: PAN, Company PAN, GST, IEC and LUT all stop being
                required, whatever the shipment type. Aadhaar is never waivable.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-sm text-muted-foreground">
            Lets this {party.partyType === "ORG" ? "organisation" : "client"}{" "}
            book with an Aadhaar card only. Needs a reason and an expiry date,
            and applies as soon as you confirm.
          </p>
        </div>
        <Switch
          id="skip-kyc"
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={busy}
        />
      </div>

      {/* The live waiver's record: what ops said, who allowed it, how long it
          has left. Reading it back here is the point of storing it at all. A
          switch on its own would answer none of these. */}
      {waiver && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            Active until {formatDate(waiver.expiresAt)}
            <span className="text-xs font-normal text-muted-foreground">
              · {daysUntil(waiver.expiresAt)} days left
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {waiver.reason}
          </p>
          <p className="text-xs text-muted-foreground">
            Granted by {waiver.grantedByName ?? "an Arena admin"} on{" "}
            {formatDate(waiver.grantedAt)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={openGrantDialog}
            disabled={busy}
          >
            Change reason or expiry
          </Button>
        </div>
      )}

      {/* ── Grant / extend ─────────────────────────────────────────────────── */}
      <Dialog
        open={grantOpen}
        onOpenChange={(open) => {
          if (!isPending) setGrantOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isActive ? "Update the KYC waiver" : "Waive KYC"}
            </DialogTitle>
            <DialogDescription>
              {partyName} will be able to book with an Aadhaar card alone. PAN,
              GST, IEC and LUT stop being required until the waiver expires.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waiver-reason">Reason</Label>
              <Textarea
                id="waiver-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What was agreed with the customer, and who agreed it."
                rows={3}
                aria-invalid={!!reasonError}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Kept on the record. Never shown to the customer.
              </p>
              {reasonError && (
                <p className="text-xs text-destructive">{reasonError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="waiver-expiry">Expires on</Label>
              <Input
                id="waiver-expiry"
                type="date"
                value={expiresOn}
                min={todayDate()}
                max={maxExpiryDate()}
                onChange={(e) => setExpiresOn(e.target.value)}
                className="max-w-[200px]"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                The full document list applies again from this date. Up to{" "}
                {MAX_WAIVER_DAYS} days out.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setGrantOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleGrant} disabled={isPending}>
              {isPending ? "Saving…" : isActive ? "Update waiver" : "Waive KYC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke ─────────────────────────────────────────────────────────── */}
      <AlertDialog
        open={revokeOpen}
        onOpenChange={(open) => {
          if (!isPending) setRevokeOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lift the KYC waiver?</AlertDialogTitle>
            <AlertDialogDescription>
              {partyName} will need their full document set again from their very
              next booking. Shipments already placed are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={isPending}>
              {isPending ? "Lifting…" : "Lift waiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
