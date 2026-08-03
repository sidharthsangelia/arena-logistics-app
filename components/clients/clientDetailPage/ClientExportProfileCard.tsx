"use client";

/**
 * THIS CLIENT'S EXPORT PAPERS
 * -----------------------------------------------------------------------------
 * Shown on the client record because that is where the question comes up: an
 * international booking for this client is filed at customs under THIS client's
 * IEC, not the associate's.
 *
 * That precedence is the whole reason this card exists rather than only the one
 * in settings. For a business associate booking on behalf of a customer, the
 * customer is the party legally exporting, and filing under the associate's IEC
 * names the wrong entity on the shipping bill. Resolution is field by field
 * (lib/booking/exportProfile.ts), so a client with an IEC but no AD code still
 * inherits the org's AD code rather than losing it.
 *
 * Empty is the normal state and is presented as such. Most clients ship CSB-IV,
 * which needs none of this, so the card explains what it is for instead of
 * nagging about being unfilled.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ExportProfileForm,
  type ExportProfileFormValues,
} from "@/components/settings/ExportProfileForm";

const EXPORT_TYPE_LABEL: Record<ExportProfileFormValues["exportType"], string> = {
  LUT: "Under an LUT",
  BOND: "Under bond",
  NA: "Neither applies",
};

export function ClientExportProfileCard({
  clientId,
  clientName,
  profile,
  hasDetail,
}: {
  clientId: string;
  clientName: string;
  profile: ExportProfileFormValues;
  hasDetail: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Export documents
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {hasDetail ? "Edit" : "Add"}
        </Button>
      </div>

      {hasDetail ? (
        <div className="divide-y px-4">
          <Row label="IEC number" value={profile.iecNumber} mono />
          <Row label="AD code" value={profile.adCode} mono />
          <Row label="IOSS number" value={profile.iossNumber} mono />
          <Row label="Declared as" value={EXPORT_TYPE_LABEL[profile.exportType]} />
          {profile.exportType === "LUT" && (
            <>
              <Row label="LUT number" value={profile.lutNumber} mono />
              <Row label="LUT valid until" value={profile.lutTillDate} />
            </>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3 px-4 py-4">
          <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Nothing on file, which is fine for most clients. These are only
            needed when this client&rsquo;s consignments go out on a commercial
            shipping bill, or under a Letter of Undertaking. When set, they are
            used in place of your own.
          </p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export documents</DialogTitle>
            <DialogDescription>
              What {clientName}&rsquo;s international consignments are filed
              under at customs. Anything set here is used instead of your
              organisation&rsquo;s, field by field.
            </DialogDescription>
          </DialogHeader>

          <ExportProfileForm
            scope="CLIENT"
            clientId={clientId}
            partyLabel={clientName}
            initialValues={profile}
            onCancel={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-sm ${mono ? "font-mono" : ""} ${
          value ? "text-foreground" : "text-muted-foreground/60"
        }`}
      >
        {value || "Not set"}
      </span>
    </div>
  );
}
