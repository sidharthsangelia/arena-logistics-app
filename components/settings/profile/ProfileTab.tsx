"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FolderOpen, MapPin, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import {
  SettingRow,
  SettingValue,
  SettingsSection,
  StaticSettingRow,
} from "@/components/settings/SettingRow";
import { getKycDocs, type PartyKycDoc } from "@/actions/book/kyc";
import { BASELINE_KYC_CONFIGS } from "@/lib/booking/kyc";
import type { OrgProfileInput } from "@/actions/settings/profile.action";

/**
 * PROFILE TAB
 * -----------------------------------------------------------------------------
 * Two things a person can actually do here: fill in who they are, and upload the
 * two documents we reuse on every booking. So there are two rows.
 *
 * The document count is read through react-query under the same key the upload
 * UI writes to, which is what keeps the row honest: upload a PAN inside the
 * dialog and the row behind it moves from "1 of 2 added" to done, without a
 * refetch or a page reload.
 */

export function ProfileTab({
  profile,
  addressComplete,
  orgId,
  initialDocs,
}: {
  profile: OrgProfileInput;
  addressComplete: boolean;
  orgId: string;
  initialDocs: PartyKycDoc[];
}) {
  const router = useRouter();

  const { data: docs = initialDocs } = useQuery({
    queryKey: ["org-kyc-docs", orgId],
    queryFn: async () => {
      const result = await getKycDocs({ partyType: "ORG", orgId });
      return result.success ? result.docs : [];
    },
    initialData: initialDocs,
    staleTime: 30_000,
  });

  const onFile = new Set(docs.map((d) => d.key));
  const baselineOnFile = BASELINE_KYC_CONFIGS.filter((c) => onFile.has(c.key));
  const kycComplete = baselineOnFile.length === BASELINE_KYC_CONFIGS.length;

  // Nothing typed in at all reads differently from a half-finished address, and
  // the copy should say which it is rather than "incomplete" for both.
  const hasAnyDetail = Boolean(
    profile.contactName || profile.addressLine1 || profile.email,
  );

  const addressSummary = [profile.contactName, profile.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-8">
      <ProfileStatusPanel
        addressComplete={addressComplete}
        kycComplete={kycComplete}
      />

      <SettingsSection
        title="Your details"
        description="Saved once, then pre-filled as the sender on every booking. Nothing here is required, so add what you have and come back to the rest."
      >
        <SettingRow
          icon={MapPin}
          label="Contact and address"
          hint="Name, email, phone and pickup address."
          value={
            addressComplete ? (
              <SettingValue tone="set">
                {addressSummary || "Complete"}
              </SettingValue>
            ) : (
              <SettingValue tone="attention">
                {hasAnyDetail ? "Half filled in" : "Not added yet"}
              </SettingValue>
            )
          }
          dialogTitle="Contact and address"
          dialogDescription="This is who your shipments are sent as. Change it any time, and future bookings pick it up."
        >
          {(close) => (
            <OrgProfileForm
              initialValues={profile}
              onCancel={close}
              onSaved={() => {
                close();
                // The row above and the panel at the top both read server data,
                // so re-render the page rather than guessing the new state here.
                router.refresh();
              }}
            />
          )}
        </SettingRow>

        <SettingRow
          icon={ShieldCheck}
          label="Identity documents"
          hint="PAN and Aadhaar, attached to every booking for you."
          value={
            kycComplete ? (
              <SettingValue tone="set">Both on file</SettingValue>
            ) : (
              <SettingValue tone="attention">
                {baselineOnFile.length} of {BASELINE_KYC_CONFIGS.length} added
              </SettingValue>
            )
          }
          dialogTitle="Identity documents"
          dialogDescription="Upload these once. We attach them to your bookings so you are not asked again."
          dialogClassName="sm:max-w-2xl"
        >
          {() => (
            <OrgDocumentsSection orgId={orgId} initialDocs={initialDocs} />
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Elsewhere"
        description="Related things that live on their own screen."
      >
        <StaticSettingRow
          icon={FolderOpen}
          label="Document Vault"
          hint="Every document on your account, including your clients'."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/document-vault">Open</Link>
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}

/**
 * One sentence at the top saying whether there is anything left to do.
 *
 * Colour is the cue, not the message: the sentence stands on its own if you
 * cannot see the difference between the two.
 */
function ProfileStatusPanel({
  addressComplete,
  kycComplete,
}: {
  addressComplete: boolean;
  kycComplete: boolean;
}) {
  const complete = addressComplete && kycComplete;

  const outstanding = [
    !addressComplete && "your contact details",
    !kycComplete && "your identity documents",
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        complete ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700",
        )}
      >
        {complete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <span className="text-xs font-semibold tabular-nums">
            {outstanding.length}
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">
          {complete ? "Your profile is ready" : "Booking gets quicker once this is done"}
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {complete
            ? "Every booking pre-fills from here, so there is nothing left to type twice."
            : `Add ${outstanding.join(" and ")} and we stop asking for them on every booking.`}
        </p>
      </div>
    </div>
  );
}
