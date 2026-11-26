import type { Metadata } from "next";
import { ClerkLoaded, ClerkLoading, SignUp } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/AuthShell";
import { ClerkFormSkeleton } from "@/components/auth/ClerkFormSkeleton";
import { clerkAppearance } from "@/components/auth/clerkAppearance";

export const metadata: Metadata = { title: "Create your account" };

export default function Page() {
  return (
    <AuthShell story="sign-up">
      <ClerkLoading>
        <ClerkFormSkeleton fields={2} />
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp appearance={clerkAppearance} />
      </ClerkLoaded>
    </AuthShell>
  );
}
