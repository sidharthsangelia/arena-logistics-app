"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { startRateSweepAction } from "@/actions/rateSweep.action";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Start a sweep by hand.
 *
 * Behind a confirmation, which is not ceremony: pressing this spends about
 * 2,400 calls against vendor accounts that bill us and rate-limit us, one of
 * which publishes a limit of ten a minute. The dialog says the cost out loud so
 * nobody discovers it afterwards.
 *
 * Non-admins see it disabled rather than not at all, so it is obvious the
 * capability exists and who to ask. The action re-checks the role regardless: a
 * disabled button is a hint, not a permission boundary.
 */
export function StartSweepButton({ canStart }: { canStart: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canStart) {
    return (
      <Button variant="outline" disabled title="Only Arena admins can start a sweep">
        <Play className="size-4" />
        Run a sweep
      </Button>
    );
  }

  const run = () => {
    startTransition(async () => {
      const result = await startRateSweepAction();

      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Play className="size-4" />
          Run a sweep
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run a full sweep now?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This asks every registered vendor for all 20 countries at all 30
                weights: about 2,400 calls in total.
              </p>
              <p>
                It takes roughly an hour, paced to stay under each vendor&apos;s
                rate limit. sKart is the slow one at eight calls a minute, which
                is their published ceiling.
              </p>
              <p className="text-muted-foreground">
                Existing rates stay exactly as they are until the new ones land,
                so nothing is lost if this run goes badly.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // The dialog closes itself on action by default, which would hide
              // the pending state and any error the action comes back with.
              event.preventDefault();
              run();
            }}
            disabled={pending}
          >
            {pending ? "Starting..." : "Start the sweep"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
