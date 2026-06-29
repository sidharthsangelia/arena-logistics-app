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

// What the dialog is confirming — null means closed
type ConfirmDialog =
  | { type: "ba-off" }
  | { type: "skip-on" }
  | null;

export default function OrgSettingsCard({
  orgId,
  orgName,
  initialMarkupPercent,
  initialIsBusinessAssociate,
  initialSkipPayment,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── form state ──────────────────────────────────────────────────────────
  const [markupPercent, setMarkupPercent] = useState(
    String(initialMarkupPercent)
  );
  const [isBusinessAssociate, setIsBusinessAssociate] = useState(
    initialIsBusinessAssociate
  );
  const [skipPayment, setSkipPayment] = useState(initialSkipPayment);

  // ── confirmation dialog ──────────────────────────────────────────────────
  // We only open this; we do NOT touch the real state until the user clicks
  // "Continue". The Switch stays at its current (unchanged) value until then.
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);

  // ── derived ─────────────────────────────────────────────────────────────
  const parsedMarkup = parseFloat(markupPercent);
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

  // ── handlers ─────────────────────────────────────────────────────────────

  /**
   * Turning BA *off* is destructive — it revokes /clients access.
   * Turning BA *on* is safe — show the dialog anyway so ops doesn't fat-finger.
   * We only open the dialog here; state is mutated in confirmAction().
   */
  function handleBusinessAssociateToggle(next: boolean) {
    if (!next) {
      // OFF → destructive: must confirm
      setConfirmDialog({ type: "ba-off" });
    } else {
      // ON → safe, apply immediately
      setIsBusinessAssociate(true);
    }
  }

  /**
   * Turning skip-payment *on* bypasses wallet checks — must confirm.
   * Turning it *off* is safe.
   */
  function handleSkipPaymentToggle(next: boolean) {
    if (next) {
      // ON → risky: must confirm
      setConfirmDialog({ type: "skip-on" });
    } else {
      // OFF → safe, apply immediately
      setSkipPayment(false);
    }
  }

  /** Called when the user clicks "Continue" inside the AlertDialog. */
  function confirmAction() {
    if (confirmDialog?.type === "ba-off") setIsBusinessAssociate(false);
    if (confirmDialog?.type === "skip-on") setSkipPayment(true);
    setConfirmDialog(null);
  }

  /** Called when the user clicks "Cancel" inside the AlertDialog. */
  function cancelAction() {
    // The real state was never touched — just close.
    setConfirmDialog(null);
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
        toast.success("Settings saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not save changes.");
      }
    });
  }

  function handleReset() {
    setMarkupPercent(String(initialMarkupPercent));
    setIsBusinessAssociate(initialIsBusinessAssociate);
    setSkipPayment(initialSkipPayment);
  }

  // ── dialog copy ──────────────────────────────────────────────────────────
  const dialogConfig =
    confirmDialog?.type === "ba-off"
      ? {
          title: "Revoke Business Associate status?",
          description: `${orgName} will lose access to the /clients route immediately on save. Their markup percentage will not change automatically — update it above if needed.`,
        }
      : {
          title: "Enable skip payment?",
          description: `${orgName}'s shipments will bypass wallet and payment checks. Make sure billing is handled manually before enabling this.`,
        };

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business settings</CardTitle>
          <CardDescription>
            Controls how quotes are priced and billed for{" "}
            <span className="font-medium text-foreground">{orgName}</span>.
            Changes take effect immediately on save.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ── Markup percent ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="markup-percent">Markup percentage</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Added on top of carrier rates when generating quotes for this
                  organisation. Standard orgs default to 30%; Business
                  Associates are typically given a lower rate.
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
                aria-invalid={!isMarkupValid}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
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

          {/* ── Business Associate toggle ───────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="is-ba" className="cursor-pointer">
                  Business Associate
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Grants access to the /clients route so this org can book
                    shipments on behalf of their own clients. Usually paired
                    with a lower markup.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Allows this organisation to manage clients and book on their
                behalf.
              </p>
            </div>
            <Switch
              id="is-ba"
              checked={isBusinessAssociate}
              onCheckedChange={handleBusinessAssociateToggle}
              disabled={isPending}
            />
          </div>

          {/* ── Skip payment toggle ─────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="skip-payment" className="cursor-pointer">
                  Skip payment
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    When enabled, this organisation&apos;s shipments bypass
                    wallet and payment checks entirely. Use only for trusted
                    orgs billed manually.
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
              onCheckedChange={handleSkipPaymentToggle}
              disabled={isPending}
            />
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2 border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || isPending}
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || isPending}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </Card>

      {/* ── Confirmation dialog ────────────────────────────────────────────── */}
      <AlertDialog
        open={confirmDialog !== null}
        onOpenChange={(open) => {
          if (!open) cancelAction();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogConfig.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogConfig.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelAction}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}