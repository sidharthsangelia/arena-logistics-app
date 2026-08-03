"use client";

/**
 * THE EXPORT PROFILE FORM
 * -----------------------------------------------------------------------------
 * The papers an international booking is filed under: IEC, AD code, LUT, IOSS,
 * and how the consignment is declared.
 *
 * ONE COMPONENT, TWO PLACES. It is rendered in org settings and again on a client
 * (components/clients/clientDetailPage/ClientExportProfileCard.tsx), because the
 * fields are identical and the only difference is which row is written. When a
 * client has values they WIN over the org's, since for a business associate
 * booking on behalf of a client the client is the party legally exporting.
 *
 * Content only: the caller owns the title, the description and the border, which
 * is the convention the other settings forms and the ops action panels follow.
 *
 * ── WHY MOST OF THIS IS OPTIONAL ────────────────────────────────────────────
 * Most exports go out on CSB-IV, the courier route for low-value consignments,
 * which needs none of it. IEC and AD code become genuinely necessary on a
 * CSB-V/commercial shipping bill, and the LUT only matters when claiming
 * zero-rated relief. So the copy explains when each one is needed rather than
 * marking everything required and stalling people who need none of it.
 */

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { saveExportProfileAction } from "@/actions/settings/exportProfile.action";
import type { ExportProfileFormShape } from "@/lib/booking/exportProfile";

/** Re-exported under a form-facing name so callers import one thing, not two. */
export type ExportProfileFormValues = ExportProfileFormShape;

/** Everything blank, and declaring nothing. The state a new party starts in. */
export const EMPTY_EXPORT_PROFILE: ExportProfileFormValues = {
  iecNumber: "",
  adCode: "",
  lutNumber: "",
  lutIssueDate: "",
  lutTillDate: "",
  iossNumber: "",
  incoterms: "DDP",
  exportType: "NA",
};

const TEXT_FIELDS: {
  name: keyof ExportProfileFormValues;
  label: string;
  hint: string;
  placeholder?: string;
  span?: "full";
}[] = [
  {
    name: "iecNumber",
    label: "IEC number",
    placeholder: "AAAAA1234A",
    hint: "Importer Exporter Code. Needed for commercial shipping bills; low-value courier exports go without one.",
  },
  {
    name: "adCode",
    label: "AD code",
    placeholder: "6390004",
    hint: "Your bank's Authorised Dealer code. Ties the consignment to the account the money comes back to.",
  },
  {
    name: "iossNumber",
    label: "IOSS number",
    placeholder: "IM0123456789",
    span: "full",
    hint: "Only if you are registered for the EU import scheme. Leave blank otherwise.",
  },
];

export function ExportProfileForm({
  initialValues,
  scope,
  clientId,
  partyLabel,
  onSaved,
  onCancel,
}: {
  initialValues: ExportProfileFormValues;
  scope: "ORG" | "CLIENT";
  /** Required when scope is CLIENT. */
  clientId?: string;
  /** Whose papers these are, for the copy. e.g. "your" or the company name. */
  partyLabel?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { register, handleSubmit, control } = useForm<ExportProfileFormValues>({
    defaultValues: initialValues,
  });

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // useWatch rather than the form's watch(): the latter cannot be memoised
  // safely and the lint rule rejects it. This subscribes to one field.
  const exportType = useWatch({ control, name: "exportType" });

  // The LUT fields are meaningless unless the export is declared as moving under
  // one, so they appear when that is chosen rather than sitting there greyed out.
  const showLut = exportType === "LUT";

  const onSubmit = async (values: ExportProfileFormValues) => {
    setSaving(true);
    setError(null);
    const result = await saveExportProfileAction({ ...values, scope, clientId });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div
            key={f.name}
            className={cn("space-y-1.5", f.span === "full" && "sm:col-span-2")}
          >
            <Label htmlFor={f.name} className="flex items-center gap-1.5">
              {f.label}
              <span className="text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              id={f.name}
              placeholder={f.placeholder}
              autoComplete="off"
              spellCheck={false}
              {...register(f.name)}
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exportType">How the export is declared</Label>
          <Controller
            control={control}
            name="exportType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="exportType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NA">Neither applies</SelectItem>
                  <SelectItem value="LUT">Under an LUT (zero-rated)</SelectItem>
                  <SelectItem value="BOND">Under bond</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            An LUT lets you export without paying IGST up front. Choose
            &ldquo;neither applies&rdquo; if you hold neither, which is the
            common case for samples and gifts.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="incoterms">Who pays duty on arrival</Label>
          <Controller
            control={control}
            name="incoterms"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="incoterms" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DDP">
                    DDP — {partyLabel ?? "the sender"} pays
                  </SelectItem>
                  <SelectItem value="DDU">DDU — the receiver pays</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            The default for new bookings. It can still be changed per shipment.
          </p>
        </div>
      </div>

      {showLut && (
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lutNumber">LUT number</Label>
            <Input
              id="lutNumber"
              placeholder="AD070424000123M"
              autoComplete="off"
              spellCheck={false}
              {...register("lutNumber")}
            />
            <p className="text-xs text-muted-foreground">
              The acknowledgement number from your LUT filing. Bookings are held
              if this is missing, because zero-rating without the document it
              claims is a tax exposure.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lutIssueDate">Issued on</Label>
            <Input id="lutIssueDate" type="date" {...register("lutIssueDate")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lutTillDate">Valid until</Label>
            <Input id="lutTillDate" type="date" {...register("lutTillDate")} />
            <p className="text-xs text-muted-foreground">
              LUTs are issued for one financial year. An expired one is refused
              at the border, so bookings stop rather than go out against it.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save export profile
        </Button>
      </div>
    </form>
  );
}
