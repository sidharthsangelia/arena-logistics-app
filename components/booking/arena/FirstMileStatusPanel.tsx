"use client";

import { useState, useTransition } from "react";
import { Home, Save, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { FirstMileStatus } from "@/generated/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateFirstMileStatus } from "@/actions/book/companySideBookings.action";
import {
  FIRST_MILE_STAGES,
  FIRST_MILE_STAGE_ORDER,
  isFirstMileEmailMilestone,
} from "@/lib/booking/firstMileStatus";

interface Props {
  shipmentId: string;
  initial: {
    status: FirstMileStatus;
    trackingNumber: string | null;
    trackingUrl: string | null;
    pickupScheduledAt: Date | null;
    updatedAt: Date | null;
  };
}

/** Date → yyyy-mm-dd for a <input type="date">, or "" when unset. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function FirstMileStatusPanel({ shipmentId, initial }: Props) {
  const [status, setStatus] = useState<FirstMileStatus>(initial.status);
  const [tracking, setTracking] = useState(initial.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(initial.trackingUrl ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    toDateInput(initial.pickupScheduledAt),
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    startTransition(async () => {
      const willEmail =
        status !== initial.status && isFirstMileEmailMilestone(status);

      const result = await updateFirstMileStatus({
        shipmentId,
        status,
        trackingNumber: tracking,
        trackingUrl,
        pickupScheduledAt: scheduledAt,
      });

      if (!result.success) {
        toast.error("Couldn't update pickup", { description: result.message });
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      const stageLabel = FIRST_MILE_STAGES[status].label;
      if (result.emailed) {
        toast.success(`Pickup set to ${stageLabel}`, {
          description: "The customer has been notified by email.",
        });
      } else if (willEmail) {
        toast.warning(`Pickup set to ${stageLabel}`, {
          description: "Saved, but the customer could not be emailed. Check their email on file.",
        });
      } else {
        toast.success(`Pickup set to ${stageLabel}`, {
          description: "This stage does not send a customer email.",
        });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Door pickup (first mile)</CardTitle>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stage</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as FirstMileStatus)}
          >
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIRST_MILE_STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="text-sm">
                  {FIRST_MILE_STAGES[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Scheduled pickup date
          </Label>
          <Input
            type="date"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Courier tracking number
          </Label>
          <Input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Domestic courier AWB"
            className="h-8 font-mono text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Tracking URL (optional)
          </Label>
          <Input
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm"
          />
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          Picked up and Arrived at hub email the customer and post to their
          inbox. Arrived at hub is when a pay-on-arrival booking becomes
          collectable.
        </p>

        <Button
          size="sm"
          className="h-8 w-full text-xs"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="mr-1.5 h-3 w-3" />
              Pickup updated
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-3 w-3" />
              Save pickup
            </>
          )}
        </Button>

        {initial.updatedAt && (
          <p className="text-center text-[10px] text-muted-foreground">
            Last updated {initial.updatedAt.toLocaleString("en-IN")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
