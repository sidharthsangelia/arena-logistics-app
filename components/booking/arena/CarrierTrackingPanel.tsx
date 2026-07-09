"use client";

import { useState, useTransition } from "react";
import { Truck, Save, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
 
import { toast } from "sonner";
import { updateCarrierAwb } from "@/actions/book/carrierTrackingDetails.action";

export function CarrierTrackingPanel({
  shipmentId,
  initial,
}: {
  shipmentId: string;
  initial: {
    mawbNumber: string | null;
    hawbNumber: string | null;
    carrierAirline: string | null;
    vendorTrackingUrl: string | null;
    awbUpdatedAt: Date | null;
  };
}) {
  const [mawb, setMawb] = useState(initial.mawbNumber ?? "");
  const [hawb, setHawb] = useState(initial.hawbNumber ?? "");
  const [airline, setAirline] = useState(initial.carrierAirline ?? "");
  const [trackingUrl, setTrackingUrl] = useState(initial.vendorTrackingUrl ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await updateCarrierAwb({
          shipmentId,
          mawbNumber: mawb,
          hawbNumber: hawb,
          carrierAirline: airline,
          vendorTrackingUrl: trackingUrl,
        });
        toast.success("Carrier tracking info updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Carrier AWB Tracking</CardTitle>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Airline / Carrier</Label>
          <Input
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            placeholder="e.g. Emirates SkyCargo"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">MAWB Number</Label>
          <Input
            value={mawb}
            onChange={(e) => setMawb(e.target.value)}
            placeholder="Master Air Waybill"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">HAWB Number</Label>
          <Input
            value={hawb}
            onChange={(e) => setHawb(e.target.value)}
            placeholder="House Air Waybill (client-facing)"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tracking URL (optional)</Label>
          <Input
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm"
          />
        </div>

        {initial.awbUpdatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last updated {initial.awbUpdatedAt.toLocaleString("en-IN")}
          </p>
        )}

        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handleSave}
          disabled={isPending}
        >
          <Save className="h-3 w-3 mr-1.5" />
          {isPending ? "Saving..." : "Save tracking info"}
        </Button>

        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Preview tracking link
          </a>
        )}
      </CardContent>
    </Card>
  );
}