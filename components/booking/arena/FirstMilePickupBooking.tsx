"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Truck,
  Home,
  Warehouse,
  ArrowRight,
  Loader2,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bookFirstMilePickup } from "@/actions/book/firstMilePickupBooking.action";

interface Props {
  shipmentId: string;
  courierName: string | null;
  charge: number | null;
  currency: string;
  pickupFromLabel: string;
  pickupContact: string | null;
  hubLabel: string | null;
  weightKg: number;
  boxes: number;
  booked: {
    awb: string | null;
    orderId: string | null;
    bookedAt: string | null; // pre-formatted
  };
}

function money(n: number | null, currency: string): string {
  if (n == null) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function FirstMilePickupBooking(props: Props) {
  const { shipmentId, booked } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Set when the paid courier could not be resolved; the dialog then asks ops to
  // explicitly authorise an auto-assigned courier instead.
  const [unresolved, setUnresolved] = useState<string | null>(null);

  const alreadyBooked = Boolean(booked.awb);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setUnresolved(null); // reset the override prompt on close
  }

  function handleBook(allowAutoAssign: boolean) {
    startTransition(async () => {
      const result = await bookFirstMilePickup(
        shipmentId,
        allowAutoAssign ? { allowAutoAssign: true } : undefined,
      );
      if (result.success) {
        setOpen(false);
        setUnresolved(null);
        toast.success("Pickup booked with Shipmozo", {
          description: result.awb
            ? `AWB ${result.awb}${result.carrier ? ` · ${result.carrier}` : ""}`
            : "Order pushed.",
        });
        router.refresh();
      } else if (result.code === "COURIER_UNRESOLVED") {
        setUnresolved(result.message);
      } else {
        toast.error("Couldn't book pickup", { description: result.message });
      }
    });
  }

  // --- Already booked: compact confirmation card ---------------------------
  if (alreadyBooked) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-sm">Pickup booked with Shipmozo</CardTitle>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-2.5 pt-4">
          <Row label="AWB" value={<span className="font-mono">{booked.awb}</span>} />
          {props.courierName && <Row label="Courier" value={props.courierName} />}
          {booked.orderId && (
            <Row
              label="Shipmozo order"
              value={<span className="font-mono text-xs">{booked.orderId}</span>}
            />
          )}
          {booked.bookedAt && <Row label="Booked" value={booked.bookedAt} />}
          <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground/70">
            Status updates arrive automatically from Shipmozo and advance the
            pickup leg above.
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Not booked: review + confirm ----------------------------------------
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Book door pickup</CardTitle>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-3 pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Push this pickup to Shipmozo so the courier collects from the customer
          and brings it to the hub. No need to open the Shipmozo panel.
        </p>

        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 w-full text-xs">
              <Truck className="mr-1.5 h-3 w-3" />
              Book pickup with Shipmozo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm door pickup</DialogTitle>
              <DialogDescription>
                Review the pickup before it is booked. This books the exact
                courier the customer paid for, pushes the order, and schedules
                collection.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Home className="h-3.5 w-3.5 text-muted-foreground" />
                  {props.pickupFromLabel || "Pickup"}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="flex items-center gap-1.5 font-medium">
                  <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                  {props.hubLabel ? `${props.hubLabel} hub` : "Carrier hub"}
                </span>
              </div>

              <div className="space-y-2">
                <Row label="Courier" value={props.courierName ?? "As booked"} />
                {props.pickupContact && (
                  <Row label="Pickup contact" value={props.pickupContact} />
                )}
                <Row
                  label="Parcel"
                  value={`${props.boxes} box${props.boxes !== 1 ? "es" : ""} · ${props.weightKg.toFixed(2)} kg`}
                />
                <Row label="Pickup charge" value={money(props.charge, props.currency)} />
              </div>

              {unresolved && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-semibold">Paid courier not confirmed</p>
                  <p className="mt-0.5">{unresolved}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              {unresolved ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleBook(true)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    "Book with auto-assigned courier"
                  )}
                </Button>
              ) : (
                <Button size="sm" onClick={() => handleBook(false)} disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Confirm &amp; book
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
