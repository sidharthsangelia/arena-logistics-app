"use client";

// components/accounts/AccountRowActions.tsx
//
// Promote or demote an account without leaving the list.
//
// ADMIN ONLY, and the list is responsible for not rendering this to anyone else.
// That is presentation: setBusinessAssociateStatus calls requireArenaAdmin for
// itself, so a member who reaches the action directly is refused there.
//
// The dialog asks for a markup rather than applying one silently. Promotion
// changes what Arena earns on everything this account books from that moment on,
// which is too consequential to happen behind a menu item.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Loader2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setBusinessAssociateStatus } from "@/actions/accounts/accounts.action";
import {
  DEFAULT_BA_MARKUP_PERCENT,
  DEFAULT_STANDARD_MARKUP_PERCENT,
  markupPercentSchema,
} from "@/lib/accounts/schema";

type Props = {
  orgId: string;
  orgName: string;
  isBusinessAssociate: boolean;
  /** Current markup, so the dialog can offer it instead of guessing. */
  markupPercent: number | null;
};

export default function AccountRowActions({
  orgId,
  orgName,
  isBusinessAssociate,
  markupPercent,
}: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  // Promotion moves the markup down, demotion puts it back. Both are offers the
  // admin can overwrite before confirming.
  const suggestedMarkup = isBusinessAssociate
    ? DEFAULT_STANDARD_MARKUP_PERCENT
    : DEFAULT_BA_MARKUP_PERCENT;

  const [markupInput, setMarkupInput] = useState(String(suggestedMarkup));
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setMarkupInput(String(suggestedMarkup));
    setError(null);
    setIsOpen(true);
  }

  function handleConfirm() {
    // Validated against the same schema the action uses, so the message the
    // admin sees here is the message the server would have sent back.
    const parsed = markupPercentSchema.safeParse(Number(markupInput));

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid markup");
      return;
    }

    setError(null);

    startSaving(async () => {
      const result = await setBusinessAssociateStatus({
        orgId,
        isBusinessAssociate: !isBusinessAssociate,
        markupPercent: parsed.data,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setIsOpen(false);
      toast.success(
        isBusinessAssociate
          ? `${orgName} is no longer a business associate.`
          : `${orgName} is now a business associate.`,
      );
      // The action revalidates the route; this pulls the fresh rows in without
      // a full reload so the row updates under the cursor.
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Actions for ${orgName}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/arena-dashboard/accounts/${orgId}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open account
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={openDialog}>
            {isBusinessAssociate
              ? "Remove business associate status"
              : "Make business associate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isBusinessAssociate
                ? `Remove business associate status from ${orgName}?`
                : `Make ${orgName} a business associate?`}
            </DialogTitle>
            <DialogDescription>
              {isBusinessAssociate
                ? "They lose access to the Clients area and their shipments reprice at the markup below. Any clients they have already added stay on file."
                : "They gain access to the Clients area, where they can book on behalf of their own customers, and their shipments reprice at the markup below."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="row-action-markup">Markup percentage</Label>
            <Input
              id="row-action-markup"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.001"
              value={markupInput}
              onChange={(event) => setMarkupInput(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error ? "row-action-markup-error" : undefined}
            />
            <p className="text-xs text-muted-foreground">
              {markupPercent === null
                ? "Applied on top of carrier rates for everything they book."
                : `Currently ${markupPercent.toFixed(2)}%. Applied on top of carrier rates for everything they book.`}
            </p>
            {error && (
              <p id="row-action-markup-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isBusinessAssociate ? "Remove status" : "Make associate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
