import type { Metadata } from "next";
// app/onboarding/page.tsx
// Shown after sign-up, before the user can access the dashboard.
// Creates the Clerk org and the DB Org row together.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const metadata: Metadata = { title: "Get started" };

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

export default async function OnboardingPage() {
  const { userId, orgId } = await auth();

  if (orgId === ARENA_ORG_ID) redirect("/arena-dashboard");
  if (orgId) redirect("/"); // tenant already onboarded
  if (!userId) redirect("/sign-in");

  return (
    <AuthShell story="onboarding">
      {/* Same width, frame and heading scale as Clerk's card on the sign-in
          screens, so the hand-off from sign-up does not change the page. */}
      <div className="w-full rounded-xl border bg-card px-10 py-8 shadow-sm max-sm:px-6">
        <div className="mb-8 space-y-1.5 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Set up your workspace</h2>
          <p className="text-sm text-muted-foreground">
            Name it after your company, or yourself if you ship as an individual.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </AuthShell>
  );
}
