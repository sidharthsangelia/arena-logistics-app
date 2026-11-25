import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";
import { getCurrentOrg } from "@/utils/tenant";
import { getOrgKycBaselineStatus, isOrgAddressComplete } from "@/lib/booking/profile";
import { getOnboardingCounts } from "@/lib/dashboard/tenantOverview";

/**
 * The "Getting started" checklist on the help home. Every tick is derived from
 * facts the app already stores; nothing is recorded for the checklist itself.
 *
 * The same setup steps as the dashboard's OnboardingChecklist, in the order the
 * guides teach them, plus the two that close the loop: a first booking. Unlike
 * the dashboard card it never hides itself, because here it doubles as the
 * table of contents for a new customer.
 */

export interface SetupStep {
  key: string;
  label: string;
  /** Article that explains the step. */
  article: string;
  /** Where to go to do it, relative to the tenant dashboard. */
  href: string;
  done: boolean;
}

/** Shipments past the draft stage. 30s cache: a first booking is not something anyone refreshes for. */
function getPlacedShipmentCount(orgId: string) {
  return unstable_cache(
    () =>
      prisma.shipment.count({
        where: { orgId, status: { notIn: ["DRAFT", "PENDING_PAYMENT"] } },
      }),
    [`help-placed-shipments:${orgId}`],
    { revalidate: 30 },
  )();
}

export async function getSetupProgress(): Promise<SetupStep[] | null> {
  const org = await getCurrentOrg();
  if (!org) return null;

  const [kyc, counts, placed] = await Promise.all([
    getOrgKycBaselineStatus(org.id),
    getOnboardingCounts(org.id, org.isBusinessAssociate, org.skipPayment),
    getPlacedShipmentCount(org.id),
  ]);

  const steps: SetupStep[] = [
    {
      key: "address",
      label: "Add your contact details and address",
      article: "profile-and-contact",
      href: "/settings",
      done: isOrgAddressComplete(org),
    },
    {
      key: "kyc",
      label: "Upload your PAN and Aadhaar",
      article: "identity-documents",
      href: "/document-vault",
      done: kyc.complete,
    },
  ];

  if (!org.skipPayment) {
    steps.push({
      key: "wallet",
      label: "Top up your wallet",
      article: "wallet",
      href: "/wallet",
      // A booking already paid from the wallet proves this step, even if the
      // balance has since been spent down to zero.
      done:
        placed > 0 ||
        (counts.walletBalance != null && Number(counts.walletBalance) > 0),
    });
  }

  if (org.isBusinessAssociate) {
    steps.push({
      key: "client",
      label: "Add your first client",
      article: "clients",
      href: "/clients",
      done: counts.clientCount > 0,
    });
  }

  steps.push({
    key: "booking",
    label: "Book your first shipment",
    article: "book-international",
    href: "/book",
    done: placed > 0,
  });

  return steps;
}
