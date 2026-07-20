import type { Org } from "@/generated/prisma";
import { PartyType } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { KYC_DOC_CONFIGS } from "@/lib/booking/kyc";

// companyName is intentionally NOT here: an individual shipping to a relative
// abroad has no company, and requiring it would leave them permanently unable
// to "complete" their profile. Company name stays a nice-to-have field on the
// form; only these identify a usable sender.
const PROFILE_ADDRESS_FIELDS = [
  "contactName", "email", "phone",
  "addressLine1", "city", "state", "country", "postalCode",
] as const;

// Aadhaar + individual PAN only — company PAN is intentionally excluded.
// Resolved against KYC_DOC_CONFIGS (not hardcoded KycDocType) so this stays
// correct if the config's docType mapping ever changes.
const PROFILE_KYC_KEYS = ["pan", "aadhaar"] as const;
const PROFILE_KYC_CONFIGS = KYC_DOC_CONFIGS.filter((c) =>
  (PROFILE_KYC_KEYS as readonly string[]).includes(c.key),
);

export function isOrgAddressComplete(
  org: Pick<Org, (typeof PROFILE_ADDRESS_FIELDS)[number]>,
): boolean {
  return PROFILE_ADDRESS_FIELDS.every((f) => !!org[f]?.trim());
}

export async function getOrgKycBaselineStatus(orgId: string) {
  const docTypes = PROFILE_KYC_CONFIGS.map((c) => c.docType);
  const docs = await prisma.kycDocument.findMany({
    where: { orgId, partyType: PartyType.ORG, docType: { in: docTypes } },
    select: { docType: true },
  });
  const found = new Set(docs.map((d) => d.docType));
  return {
    complete: docTypes.every((t) => found.has(t)),
    missing: PROFILE_KYC_CONFIGS.filter((c) => !found.has(c.docType)),
  };
}

export interface OrgProfileStatus {
  addressComplete: boolean;
  kycComplete: boolean;
  complete: boolean;
}

export async function computeOrgProfileStatus(org: Org): Promise<OrgProfileStatus> {
  const addressComplete = isOrgAddressComplete(org);
  const { complete: kycComplete } = await getOrgKycBaselineStatus(org.id);
  return { addressComplete, kycComplete, complete: addressComplete && kycComplete };
}

export { PROFILE_KYC_CONFIGS };