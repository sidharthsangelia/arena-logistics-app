// components/business-assoicates/OrgSettingsCard.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
import { updateOrgSettings } from "@/actions/business-associates/action";
 

type Props = {
  orgId: string;
  orgName: string;
  initialMarkupPercent: number;
  initialIsBusinessAssociate: boolean;
  initialSkipPayment: boolean;
};

type PendingAction = "ba-off" | "skip-on" | null;

export default function OrgSettingsCard({
  orgId,
  orgName,
  initialMarkupPercent,
  initialIsBusinessAssociate,
  initialSkipPayment,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [markupPercent, setMarkupPercent] = useState(
    String(initialMarkupPercent)
  );
  const [isBusinessAssociate, setIsBusinessAssociate] = useState(
    initialIsBusinessAssociate
  );
  const [skipPayment, setSkipPayment] = useState(initialSkipPayment);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const parsedMarkup = Number(markupPercent);
  const isMarkupValid =
    markupPercent.trim() !== "" &&
    !Number.isNaN(parsedMarkup) &&
    parsedMarkup >= 0 &&
    parsedMarkup <= 100;

  const isDirty =
    isMarkupValid &&
    (parsedMarkup !== initialMarkupPercent ||
      isBusinessAssociate !== initialIsBusinessAssociate ||
      skipPayment !== initialSkipPayment);

  function handleBusinessAssociateChange(checked: boolean) {
    if (!checked && isBusinessAssociate) {
      // Turning OFF revokes /clients access — confirm first.
      setPendingAction("ba-off");
      return;
    }
    setIsBusinessAssociate(checked);
  }

  function handleSkipPaymentChange(checked: boolean) {
    if (checked && !skipPayment) {
      // Turning ON bypasses wallet/payment checks — confirm first.
      setPendingAction("skip-on");
      return;
    }
    setSkipPayment(checked);
  }

  function confirmPendingAction() {
    if (pendingAction === "ba-off") setIsBusinessAssociate(false);
    if (pendingAction === "skip-on") setSkipPayment(true);
    setPendingAction(null);
  }

  function handleSave() {
    if (!isMarkupValid) {
      toast.error("Enter a markup percentage between 0 and 100.");
      return;
    }

    startTransition(async () => {
      const result = await updateOrgSettings({
        orgId,
        markupPercent: parsedMarkup,
        isBusinessAssociate,
        skipPayment,
      });

      if (result.success) {
        toast.success("Business settings updated.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleReset() {
    setMarkupPercent(String(initialMarkupPercent));
    setIsBusinessAssociate(initialIsBusinessAssociate);
    setSkipPayment(initialSkipPayment);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business settings</CardTitle>
          <CardDescription>
            Controls how quotes are priced and billed for {orgName}. Changes
            apply immediately on save.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="markup-percent">Markup percentage</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Percentage added on top of carrier rates when generating
                  quotes for this organisation. Standard orgs default to 30%;
                  Business Associates are typically given a lower rate.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative max-w-[180px]">
              <Input
                id="markup-percent"
                type="number"
                min={0}
                max={100}
                step="0.001"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                className="pr-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            {!isMarkupValid && (
              <p className="text-xs text-destructive">
                Enter a value between 0 and 100.
              </p>
            )}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="is-ba">Business Associate</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Grants access to the /clients route so this org can book
                    shipments on behalf of their own clients. Usually paired
                    with a lower markup.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Allows this organisation to manage and book on behalf of
                clients.
              </p>
            </div>
            <Switch
              id="is-ba"
              checked={isBusinessAssociate}
              onCheckedChange={handleBusinessAssociateChange}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="skip-payment">Skip payment</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    When enabled, this organisation&apos;s shipments bypass
                    wallet/payment checks entirely. Use only for trusted orgs
                    billed manually.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Bypasses wallet debit for this organisation&apos;s shipments.
              </p>
            </div>
            <Switch
              id="skip-payment"
              checked={skipPayment}
              onCheckedChange={handleSkipPaymentChange}
            />
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={!isDirty || isPending}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "ba-off"
                ? "Revoke Business Associate status?"
                : "Enable skip payment?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "ba-off"
                ? `${orgName} will lose access to the /clients route. Their markup percentage will not change automatically — update it above if needed.`
                : `${orgName}'s shipments will bypass wallet/payment checks and will not be charged automatically. Make sure billing is handled manually for this org.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}