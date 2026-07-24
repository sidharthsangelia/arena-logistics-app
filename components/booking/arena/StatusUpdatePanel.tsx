"use client";

import React from "react";
import { ShipmentStatus } from "@/generated/prisma";
 

import { toast } from "sonner";

import { CheckCircle2, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateShipmentStatus } from "@/actions/book/companySideBookings.action";
import { isEmailMilestone } from "@/lib/email/shipment/milestones";

interface Props {
  shipmentId: string;
  currentStatus: ShipmentStatus;
  allStatuses: Array<{ value: ShipmentStatus; label: string }>;
}

export function StatusUpdatePanel({ shipmentId, currentStatus, allStatuses }: Props) {
  const [selectedStatus, setSelectedStatus] = React.useState<ShipmentStatus>(currentStatus);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = selectedStatus !== currentStatus;

  async function handleSave() {
    if (!isDirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const statusLabel =
      allStatuses.find((s) => s.value === selectedStatus)?.label ?? "updated";

    const result = await updateShipmentStatus(shipmentId, selectedStatus, note);

    setSaving(false);
    if (result.success) {
      setSaved(true);
      setNote("");
      setTimeout(() => setSaved(false), 3000);

      if (result.emailed && result.emailAudience === "associate") {
        // A business associate chose to keep their clients out of our mail, so
        // the update went to the associate instead. Nothing to fix here, and
        // saying "the client has been notified" would be untrue.
        toast.success(`Status changed to ${statusLabel}`, {
          description:
            "The business associate has been emailed. They pass updates to their client themselves.",
        });
      } else if (result.emailed) {
        toast.success(`Status changed to ${statusLabel}`, {
          description: "The client has been notified by email.",
        });
      } else if (isEmailMilestone(selectedStatus)) {
        // Milestone status, but the notification did not go out (no email on
        // file, or the send failed — captured in Sentry). Don't claim we told
        // the client when we didn't.
        toast.warning(`Status changed to ${statusLabel}`, {
          description: "Saved, but the client could not be emailed. Check their email on file.",
        });
      } else {
        toast.success(`Status changed to ${statusLabel}`, {
          description: "This status does not send a client email.",
        });
      }
    } else {
      setError(result.message);
      toast.error("Couldn't update status", { description: result.message });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Update Status</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">New status</Label>
          <Select
            value={selectedStatus}
            onValueChange={(v) => setSelectedStatus(v as ShipmentStatus)}
          >
            <SelectTrigger className="w-full text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allStatuses.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-sm">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Note{" "}
            <span className="text-muted-foreground/60">(optional — saved to timeline)</span>
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Awaiting AWB from carrier…"
            className="h-20 resize-none text-sm"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="w-full h-9"
          size="sm"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
              Status updated
            </>
          ) : (
            "Save status"
          )}
        </Button>

        {!isDirty && !saving && (
          <p className="text-center text-[10px] text-muted-foreground">
            Select a different status to save
          </p>
        )}
      </CardContent>
    </Card>
  );
}