"use client";

/**
 * src/components/quotes/QuoteActions.tsx
 *
 * Row-level action menu. Handles status transitions and delete with
 * optimistic feedback via toasts.
 *
 * Status transitions available per current status:
 *   DRAFT     → SENT, CANCELLED
 *   SENT      → ACCEPTED, CANCELLED
 *   ACCEPTED  → (none — terminal state; only delete)
 *   EXPIRED   → (none — only delete)
 *   CANCELLED → (none — only delete)
 */

import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import type { QuoteStatus } from "@/generated/prisma";
import { deleteQuoteAction, updateQuoteStatusAction } from "@/actions/quotesList.action";

// ---------------------------------------------------------------------------
// Status transition map
// ---------------------------------------------------------------------------

const TRANSITIONS: Partial<Record<QuoteStatus, { to: QuoteStatus; label: string }[]>> = {
  DRAFT:    [{ to: "SENT",      label: "Mark as Sent"     },
             { to: "CANCELLED", label: "Cancel quote"     }],
  SENT:     [{ to: "ACCEPTED",  label: "Mark as Accepted" },
             { to: "CANCELLED", label: "Cancel quote"     }],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  quoteId: string;
  quoteNumber: string;
  status: QuoteStatus;
}

export default function QuoteActions({ quoteId, quoteNumber, status }: Props) {
  const [isPending, startTransition] = useTransition();

  const transitions = TRANSITIONS[status] ?? [];

  const handleStatus = (to: QuoteStatus) => {
    startTransition(async () => {
      const result = await updateQuoteStatusAction(quoteId, to);
      if (result.success) {
        toast.success(`Quote marked as ${to.toLowerCase()}.`);
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteQuoteAction(quoteId);
      if (result.success) {
        toast.success("Quote deleted.");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isPending}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
            {quoteNumber}
          </DropdownMenuLabel>

          {transitions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {transitions.map(({ to, label }) => (
                <DropdownMenuItem
                  key={to}
                  onSelect={() => handleStatus(to)}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          {/* Delete triggers AlertDialog — cannot use DropdownMenuItem onClick
              directly because the dialog closes the dropdown first. Use
              AlertDialogTrigger as the item instead. */}
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {quoteNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the quote record. The PDF on
            UploadThing will not be removed automatically.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}