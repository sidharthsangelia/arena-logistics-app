import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getOrgShell } from "@/utils/tenant";
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { getKycDocs } from "@/actions/book/kyc";
import { computeOrgProfileStatus } from "@/lib/booking/profile";
import {
  getClientEmailRosterSummary,
  getClientEmailSettings,
} from "@/lib/email/queries";
import {
  SettingValue,
  SettingValueSkeleton,
} from "@/components/settings/SettingRow";
import { SettingsTabs, type SettingsTabKey } from "@/components/settings/SettingsTabs";
import {
  ClientEmailsTabSkeleton,
  ProfileTabSkeleton,
  SettingsTabStripSkeleton,
} from "@/components/settings/SettingsSkeletons";
import { ProfileTab } from "@/components/settings/profile/ProfileTab";
import { ClientEmailsTab } from "@/components/settings/client-emails/ClientEmailsTab";

/**
 * SETTINGS
 * -----------------------------------------------------------------------------
 * One route, two tabs. It used to be three screens: a placeholder /settings with
 * hardcoded values and a disabled Save, plus two real ones a level down that
 * nothing linked to each other. Somebody looking for "can I stop Arena emailing
 * my clients" had to already know the answer lived under a nav item called
 * Settings, and a different one to the Settings they were on.
 *
 * The client emails tab is for business associates only. A standard org ships for
 * itself, so there is no third party to decide about, and it sees the profile tab
 * on its own with no tab strip at all rather than a strip it cannot use.
 *
 * Loading is deliberately granular. The heading is static and paints first. Each
 * tab's data sits in its own boundary, and inside a tab the row labels are real
 * while only the values wait. Nothing here is served from cache: this is the
 * screen people edit these values on, and a stale one would read as a lost save.
 */

export const metadata = {
  title: "Settings",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  // Params only, no data fetch, so the header below is never held up by them.
  const sp = await searchParams;
  const requestedTab: SettingsTabKey = sp.tab === "emails" ? "emails" : "profile";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Your details, your documents, and who hears about your shipments.
        </p>
      </header>

      <Suspense fallback={<SettingsShellSkeleton />}>
        <SettingsShell requestedTab={requestedTab} />
      </Suspense>
    </div>
  );
}

async function SettingsShell({
  requestedTab,
}: {
  requestedTab: SettingsTabKey;
}) {
  // Two columns, served from the same cross-request cache the tenant layout
  // already read this request, so gating the tab strip costs nothing.
  const shell = await getOrgShell();
  if (!shell) redirect("/onboarding");

  const isBusinessAssociate = shell.isBusinessAssociate;

  return (
    <SettingsTabs
      showClientEmails={isBusinessAssociate}
      // A standard org landing on a bookmarked ?tab=emails gets the profile tab
      // rather than an empty panel.
      defaultTab={isBusinessAssociate ? requestedTab : "profile"}
      profile={
        <Suspense fallback={<ProfileTabSkeleton />}>
          <ProfilePanel />
        </Suspense>
      }
      clientEmails={
        isBusinessAssociate ? (
          <Suspense fallback={<ClientEmailsTabSkeleton />}>
            <ClientEmailsPanel orgId={shell.id} />
          </Suspense>
        ) : null
      }
    />
  );
}

async function ProfilePanel() {
  const { org } = await getCurrentOrgContext();
  const [status, kycResult] = await Promise.all([
    computeOrgProfileStatus(org),
    getKycDocs({ partyType: "ORG", orgId: org.id }),
  ]);

  return (
    <ProfileTab
      orgId={org.id}
      addressComplete={status.addressComplete}
      initialDocs={kycResult.success ? kycResult.docs : []}
      profile={{
        contactName: org.contactName ?? "",
        // Pre-filled from the workspace name chosen at onboarding (kept in sync
        // with Clerk) so the user rarely retypes it. Edits flow back to Clerk.
        companyName: org.companyName ?? org.name ?? "",
        email: org.email ?? "",
        phone: org.phone ?? "",
        addressLine1: org.addressLine1 ?? "",
        city: org.city ?? "",
        state: org.state ?? "",
        postalCode: org.postalCode ?? "",
        country: org.country ?? "India",
        gstin: org.gstin ?? "",
      }}
    />
  );
}

async function ClientEmailsPanel({ orgId }: { orgId: string }) {
  const settings = await getClientEmailSettings(orgId);

  // getOrgShell just resolved this org, so a miss here means it was deleted
  // between the two reads. Rare enough to handle plainly.
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        We could not load your settings. Please refresh the page.
      </p>
    );
  }

  return (
    <ClientEmailsTab
      settings={settings}
      // Suspended on its own so counting clients never holds up the switch, which
      // is what most people opened this tab to move.
      exceptionsValue={
        <Suspense fallback={<SettingValueSkeleton className="w-20" />}>
          <ExceptionsValue orgId={orgId} />
        </Suspense>
      }
    />
  );
}

async function ExceptionsValue({ orgId }: { orgId: string }) {
  const { totalClients, exceptionCount } =
    await getClientEmailRosterSummary(orgId);

  if (totalClients === 0) {
    return <SettingValue>No clients yet</SettingValue>;
  }

  if (exceptionCount === 0) {
    return <SettingValue>None</SettingValue>;
  }

  return (
    <SettingValue tone="set">
      {exceptionCount} of {totalClients}
    </SettingValue>
  );
}

/**
 * Shown while the org's BA flag resolves, which decides whether there is a tab
 * strip at all. The profile tab is the default and the only one a standard org
 * ever sees, so its shape is the honest guess to hold the space with.
 */
function SettingsShellSkeleton() {
  return (
    <div className="space-y-6">
      <SettingsTabStripSkeleton />
      <ProfileTabSkeleton />
    </div>
  );
}
