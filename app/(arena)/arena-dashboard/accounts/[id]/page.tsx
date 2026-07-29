// app/(arena)/arena-dashboard/accounts/[id]/page.tsx
//
// One account, associate or standard. This used to live under
// /business-associates/[id], which was never accurate: it reads any org and was
// the only way to inspect a standard signup. The old URL redirects here.
//
// STREAMING SHAPE
// Three boundaries, ordered by how fast they resolve and how much they matter:
//
//   overview  the org row itself. One indexed read, so it lands first and
//             brings the header, the tiles and the settings card with it.
//   activity  the recent clients, quotes and shipments. Three reads that
//             nobody is waiting on to know whose page this is.
//   people    a call to Clerk. Off-network, so it is given no chance to hold up
//             anything else, and it degrades to a message if it fails.
//
// The back link outside them all renders instantly, so there is always a way out
// even while the page is still filling in.

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { canSeeMoney, getArenaAuth } from "@/utils/arena-auth";
import { getActiveKycWaiver } from "@/lib/booking/waiver";
import {
  getAccountActivity,
  getAccountDetail,
  getOrgTeam,
} from "@/queries/accounts";
import AccountDetailHeader from "@/components/accounts/detail/AccountDetailHeader";
import AccountStatsGrid from "@/components/accounts/detail/AccountStatsGrid";
import AccountContactCard from "@/components/accounts/detail/AccountContactCard";
import AccountMetaCard from "@/components/accounts/detail/AccountMetaCard";
import OrgTeamCard from "@/components/accounts/detail/OrgTeamCard";
import OrgSettingsCard from "@/components/accounts/detail/OrgSettingsCard";
import RecentShipmentsTable from "@/components/accounts/detail/RecentShipmentsTable";
import RecentQuotesTable from "@/components/accounts/detail/RecentQuotesTable";
import RecentClientsTable from "@/components/accounts/detail/RecentClientsTable";
import {
  AccountActivitySkeleton,
  AccountOverviewSkeleton,
  OrgTeamCardSkeleton,
} from "./skeletons";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AccountDetailPage({ params }: PageProps) {
  const [{ id }, viewerCanSeeMoney, arena] = await Promise.all([
    params,
    canSeeMoney(),
    getArenaAuth(),
  ]);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/arena-dashboard/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to accounts
      </Link>

      <Suspense fallback={<AccountOverviewSkeleton />}>
        <AccountOverview
          id={id}
          canSeeMoney={viewerCanSeeMoney}
          isArenaAdmin={arena.isArenaAdmin}
        />
      </Suspense>
    </div>
  );
}

async function AccountOverview({
  id,
  canSeeMoney: viewerCanSeeMoney,
  isArenaAdmin,
}: {
  id: string;
  canSeeMoney: boolean;
  isArenaAdmin: boolean;
}) {
  // The waiver read is one indexed row and only an admin can see the control it
  // feeds, so it rides alongside the account read rather than after it.
  const [account, kycWaiver] = await Promise.all([
    getAccountDetail(id, viewerCanSeeMoney),
    isArenaAdmin
      ? getActiveKycWaiver({ partyType: "ORG", orgId: id })
      : Promise.resolve(null),
  ]);

  if (!account) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <AccountDetailHeader account={account} />
      <AccountStatsGrid account={account} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/*
            Markup is Arena's margin, so the card that sets it is admin only.
            Members still get everything else on this page; they simply cannot
            change the commercial terms. updateOrgSettings re-checks the role
            itself, so hiding the card is presentation, not the gate.

            The KYC waiver rides in the same card for the same reason: waiving
            KYC sets aside a compliance requirement on Arena's own licence to
            move goods, which belongs with margin and payment rather than in
            ops' hands. Its own actions re-check the role too.
          */}
          {viewerCanSeeMoney && account.markupPercent !== null && (
            <OrgSettingsCard
              orgId={account.id}
              orgName={account.name}
              initialMarkupPercent={account.markupPercent}
              initialIsBusinessAssociate={account.isBusinessAssociate}
              initialSkipPayment={account.skipPayment}
              kycWaiver={
                kycWaiver
                  ? {
                      id: kycWaiver.id,
                      reason: kycWaiver.reason,
                      expiresAt: kycWaiver.expiresAt.toISOString(),
                      grantedByName: kycWaiver.grantedByName,
                      grantedAt: kycWaiver.grantedAt.toISOString(),
                    }
                  : null
              }
            />
          )}

          <Suspense fallback={<AccountActivitySkeleton />}>
            <AccountActivity
              orgId={account.id}
              isBusinessAssociate={account.isBusinessAssociate}
            />
          </Suspense>
        </div>

        <div className="space-y-6">
          <AccountContactCard account={account} />

          <Suspense fallback={<OrgTeamCardSkeleton />}>
            <AccountTeam clerkOrgId={account.clerkOrgId} />
          </Suspense>

          <AccountMetaCard account={account} />
        </div>
      </div>
    </div>
  );
}

async function AccountActivity({
  orgId,
  isBusinessAssociate,
}: {
  orgId: string;
  isBusinessAssociate: boolean;
}) {
  const { clients, quotes, shipments } = await getAccountActivity(orgId);

  return (
    <div className="space-y-6">
      <RecentShipmentsTable shipments={shipments} />
      <RecentQuotesTable quotes={quotes} />

      {/* Standard accounts ship for themselves and never create clients, so the
          table would always be empty for them. */}
      {isBusinessAssociate && <RecentClientsTable clients={clients} />}
    </div>
  );
}

async function AccountTeam({ clerkOrgId }: { clerkOrgId: string }) {
  const members = await getOrgTeam(clerkOrgId);

  return <OrgTeamCard members={members} />;
}
