// app/settings/profile/page.tsx
import { Suspense } from "react";

import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { computeOrgProfileStatus } from "@/lib/booking/profile";
import { getKycDocs } from "@/actions/book/kyc";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { OrgDocumentsSection } from "@/components/documents/OrgDocumentsSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// The heading is static copy and paints immediately. The form below it holds the
// user's own saved details, which are never served from cache: this is the page
// they edit those details on, and stale values here would look like a lost save.
export default function ProfileSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save your address and identity documents once, and we&apos;ll pre-fill
          them on every future booking. Nothing here is required, so add what you
          have, skip the rest, and come back anytime.
        </p>
      </div>

      <Suspense fallback={<ProfilePanelSkeleton />}>
        <ProfilePanel />
      </Suspense>
    </div>
  );
}

async function ProfilePanel() {
  const { org } = await getCurrentOrgContext();
  const [status, kycResult] = await Promise.all([
    computeOrgProfileStatus(org),
    getKycDocs({ partyType: "ORG", orgId: org.id }),
  ]);

  return (
    <>
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
    </>
  );
}

/** Mirrors the profile form's fields and the documents card beneath it. */
function ProfilePanelSkeleton() {
  return (
    <>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents (KYC)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}