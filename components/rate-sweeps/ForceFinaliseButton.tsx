"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleStop } from "lucide-react";
import { toast } from "sonner";

import { forceFinaliseSweepAction } from "@/actions/rateSweep.action";
import { Button } from "@/components/ui/button";

/**
 * Close out a run that is stuck.
 *
 * Rarely needed and important when it is. The cron refuses to start while a run
 * is marked RUNNING, so one stranded run blocks every future sweep. The
 * automatic backstop covers this, but only while the planner that opened the run
 * is still alive; if that died too, this button is the only way back.
 *
 * It stops the run, it does not cancel work: any lane still going will keep
 * writing rows, and they are kept.
 */
export function ForceFinaliseButton({ runId }: { runId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await forceFinaliseSweepAction(runId);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else {
            toast.error(result.message);
          }
        })
      }
    >
      <CircleStop className="size-4" />
      {pending ? "Closing..." : "Force close"}
    </Button>
  );
}
