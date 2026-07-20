// app/settings/profile/page.tsx
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { computeOrgProfileStatus } from "@/lib/booking/profile";
import { getKycDocs } from "@/actions/book/kyc";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          on every future booking. Nothing here is required, so add what you
          have, skip the rest, and come back anytime.
        </p>
      </div>

      <OrgProfileForm
        initialValues={{
          contactName: org.contactName ?? "",
          // Pre-fill from the workspace name chosen at onboarding (kept in sync
          // with Clerk) so the user rarely retypes it — editable, and edits flow
          // back to Clerk on save.
          companyName: org.companyName ?? org.name ?? "",
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents (KYC)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your identity documents once, and we&apos;ll reuse them
            automatically on every future booking. These are also available in
            your{" "}
            <a href="/document-vault" className="underline underline-offset-2">
              Document Vault
            </a>
            .
          </p>
          <OrgDocumentsSection
            orgId={org.id}
            initialDocs={kycResult.success ? kycResult.docs : []}
          />
        </CardContent>
      </Card>
    </div>
  );
}