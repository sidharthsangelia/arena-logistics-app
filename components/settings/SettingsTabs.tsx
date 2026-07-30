"use client";

import * as React from "react";
import { MailCheck, UserRound } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SettingsTabKey = "profile" | "emails";

/**
 * The tab strip.
 *
 * Both panels are rendered on the server and handed in as props, so switching is
 * instant and costs nothing: no navigation, no refetch, no skeleton on the way
 * back to a tab you already looked at.
 *
 * The URL still moves, through the native history API rather than the router.
 * That keeps ?tab=emails linkable, refresh-safe, and usable as the destination of
 * the link in the footer of a diverted shipment email, without paying for a
 * server round trip every time somebody flicks between two tabs.
 */
export function SettingsTabs({
  defaultTab,
  showClientEmails,
  profile,
  clientEmails,
}: {
  defaultTab: SettingsTabKey;
  showClientEmails: boolean;
  profile: React.ReactNode;
  clientEmails: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<SettingsTabKey>(defaultTab);

  // Only one tab exists for a standard org, so the strip would be a control with
  // nothing to choose. The panel renders on its own.
  if (!showClientEmails) {
    return <div className="mt-2">{profile}</div>;
  }

  const onValueChange = (next: string) => {
    const key = next as SettingsTabKey;
    setTab(key);
    window.history.replaceState(
      null,
      "",
      key === "emails" ? "/settings?tab=emails" : "/settings",
    );
  };

  return (
    <Tabs value={tab} onValueChange={onValueChange} className="gap-6">
      <TabsList variant="line" className="w-full justify-start border-b">
        <TabsTrigger value="profile" className="flex-none px-3">
          <UserRound />
          Profile
        </TabsTrigger>
        <TabsTrigger value="emails" className="flex-none px-3">
          <MailCheck />
          Client emails
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="emails">{clientEmails}</TabsContent>
    </Tabs>
  );
}
