// app/activate-org/page.tsx
"use client";
import { useOrganizationList } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ARENA_ORG_ID = process.env.NEXT_PUBLIC_ARENA_ORG_ID!;

export default function ActivateOrg() {
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: true,
  });
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !userMemberships?.data) return;

    const arena = userMemberships.data.find(
      (m) => m.organization.id === ARENA_ORG_ID
    );

    if (arena && setActive) {
      setActive({ organization: ARENA_ORG_ID }).then(() => {
        router.replace("/arena-dashboard");
      });
    } else {
      // Not actually an Arena member — send to dashboard
      router.replace("/");
    }
  }, [isLoaded, userMemberships]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Setting up your workspace...</p>
    </div>
  );
}