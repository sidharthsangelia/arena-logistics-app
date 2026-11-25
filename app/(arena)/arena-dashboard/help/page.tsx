import type { Metadata } from "next";

import { HelpHome } from "@/components/help/HelpViews";
import { resolveHelpAudience } from "@/lib/help/audience.server";

export const metadata: Metadata = { title: "Help & Docs" };

/**
 * Help home. Article lists are static per audience and the audience comes from
 * request-cached reads the layout already made, so only the setup checklist
 * (live account data) waits behind a skeleton.
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ q }, audience] = await Promise.all([searchParams, resolveHelpAudience()]);
  return (
    <HelpHome
      audience={audience}
      scope="arena"
      initialQuery={typeof q === "string" ? q.slice(0, 200) : ""}
    />
  );
}
