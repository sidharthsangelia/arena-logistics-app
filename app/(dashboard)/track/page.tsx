import { MapPin } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function TrackPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Track Shipment
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter your AWB number for live tracking updates.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base">Enter Tracking Number</CardTitle>
          </div>
          <CardDescription>
            Supports Aramex and Skart AWB numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="awb">AWB / Tracking Number</Label>
            <div className="flex gap-2">
              <Input
                id="awb"
                placeholder="e.g. AWB-20240512-001"
                className="flex-1"
              />
              <Button disabled className="shrink-0">
                Track
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Live tracking integration coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}