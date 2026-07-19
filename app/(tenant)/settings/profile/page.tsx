// app/settings/profile/page.tsx
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { computeOrgProfileStatus, PROFILE_KYC_CONFIGS } from "@/lib/booking/profile";
import { getKycDocs } from "@/actions/book/kyc";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { OrgKycSection } from "@/components/settings/OrgKycSection";
import { Separator } from "@/components/ui/separator";

export default async function ProfileSettingsPage() {
  const { org } = await getCurrentOrgContext();
  const [status, kycResult] = await Promise.all([
    computeOrgProfileStatus(org),
    getKycDocs({ partyType: "ORG", orgId: org.id }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save your address and identity documents once, and we'll pre-fill them
          on every future booking. Nothing here is required — add what you have,
          skip the rest, and come back anytime.
        </p>
      </div>

      <OrgProfileForm
        initialValues={{
          contactName: org.contactName ?? "",
          companyName: org.companyName ?? "",
          email: org.email ?? "",
          phone: org.phone ?? "",
          addressLine1: org.addressLine1 ?? "",
          city: org.city ?? "",
          state: org.state ?? "",
          postalCode: org.postalCode ?? "",
          country: org.country ?? "India",
        }}
        addressComplete={status.addressComplete}
      />

      <Separator />

      <OrgKycSection
        orgId={org.id}
        configs={PROFILE_KYC_CONFIGS}
        initialDocs={kycResult.success ? kycResult.docs : []}
      />
    </div>
  );
}