// components/profile/ProfileCompletionBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import Link from "next/link";
import { AlertCircle, X } from "lucide-react";

const DISMISS_KEY = "profile-banner-dismissed";

export function ProfileCompletionBanner() {
  const { organization, isLoaded } = useOrganization();
  const [dismissed, setDismissed] = useState(true); // hidden until we know

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!isLoaded || dismissed) return null;
  if (organization?.publicMetadata?.profileComplete === true) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Complete your profile to speed up future bookings —{" "}
          <Link href="/settings/profile" className="font-medium underline">
            add your address &amp; KYC docs
          </Link>.
        </span>
      </div>
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}
        aria-label="Dismiss"
        className="text-amber-600 hover:text-amber-800"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}