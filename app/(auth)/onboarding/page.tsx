// app/onboarding/page.tsx
// Shown after sign-up, before the user can access the dashboard.
// Creates the Clerk org and the DB Org row together.

import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
 

export default async function OnboardingPage() {
  const { userId, orgId } = await auth();

  // Already has an org — skip onboarding
  if (orgId) redirect("/dashboard");
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set up your workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Create your organisation to get started.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}