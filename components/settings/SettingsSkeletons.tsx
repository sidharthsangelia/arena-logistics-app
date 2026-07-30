import {
  CornerUpLeft,
  FolderOpen,
  ListChecks,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  SettingValueSkeleton,
  SettingsSection,
  StaticSettingRow,
} from "@/components/settings/SettingRow";

/**
 * SETTINGS SKELETONS
 * -----------------------------------------------------------------------------
 * The rule these follow: grey out what is this user's data, render everything
 * else for real.
 *
 * On this screen almost nothing is data. Section headings, row labels, the hints
 * under them, the icons, the explanatory copy: identical on every load for every
 * account. Hiding all of it behind grey boxes means the page arrives saying
 * nothing and then rearranges itself, when it could have arrived saying exactly
 * what you can do here.
 *
 * So each row keeps its label and its hint, and only the value on the right,
 * which really is a lookup, is a skeleton. The layout never shifts, because the
 * skeleton and the real thing are the same row.
 */

export function SettingsTabStripSkeleton() {
  return (
    <div className="flex gap-2 border-b pb-2">
      <Skeleton className="h-7 w-24 rounded-md" />
      <Skeleton className="h-7 w-32 rounded-md" />
    </div>
  );
}

export function ProfileTabSkeleton() {
  return (
    <div className="space-y-8">
      {/* The panel says whether anything is outstanding, which is entirely a
          lookup, so the border stays neutral rather than guessing a colour and
          repainting it a moment later. */}
      <div className="flex items-start gap-3 rounded-xl border p-4">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="space-y-2 py-0.5">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
      </div>

      <SettingsSection
        title="Your details"
        description="Saved once, then pre-filled as the sender on every booking. Nothing here is required, so add what you have and come back to the rest."
      >
        <StaticSettingRow
          icon={MapPin}
          label="Contact and address"
          hint="Name, email, phone and pickup address."
          value={<SettingValueSkeleton />}
        />
        <StaticSettingRow
          icon={ShieldCheck}
          label="Identity documents"
          hint="PAN and Aadhaar, attached to every booking for you."
          value={<SettingValueSkeleton className="w-20" />}
        />
      </SettingsSection>

      <SettingsSection
        title="Elsewhere"
        description="Related things that live on their own screen."
      >
        <StaticSettingRow
          icon={FolderOpen}
          label="Document Vault"
          hint="Every document on your account, including your clients'."
          action={<Skeleton className="h-8 w-16 rounded-md" />}
        />
      </SettingsSection>
    </div>
  );
}

export function ClientEmailsTabSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="space-y-2 py-0.5">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3.5 w-96 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
      </div>

      <SettingsSection title="What gets sent">
        <StaticSettingRow
          icon={ListChecks}
          label="Which updates they get"
          hint="Anything left out comes to you instead."
          value={<SettingValueSkeleton className="w-16" />}
        />
        <StaticSettingRow
          icon={CornerUpLeft}
          label="Where replies go"
          hint="Clients never see an Arena address."
          value={<SettingValueSkeleton className="w-40" />}
        />
      </SettingsSection>

      <SettingsSection
        title="Exceptions"
        description="Most clients should follow the setting above. Use this when one needs the opposite."
      >
        <StaticSettingRow
          icon={Users}
          label="Clients set differently"
          hint="Overrides the switch above, in either direction."
          value={<SettingValueSkeleton className="w-20" />}
        />
      </SettingsSection>
    </div>
  );
}
