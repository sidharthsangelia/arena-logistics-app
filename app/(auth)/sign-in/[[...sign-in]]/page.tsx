import type { Metadata } from "next";
import { ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/auth/AuthShell";
import { ClerkFormSkeleton } from "@/components/auth/ClerkFormSkeleton";
import { clerkAppearance } from "@/components/auth/clerkAppearance";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthShell story="sign-in">
      <ClerkLoading>
        <ClerkFormSkeleton />
      </ClerkLoading>
      <ClerkLoaded>
        <SignIn appearance={clerkAppearance} />
      </ClerkLoaded>
    </AuthShell>
  );
}
