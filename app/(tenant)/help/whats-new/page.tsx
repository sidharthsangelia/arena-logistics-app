import type { Metadata } from "next";

import { WhatsNewView } from "@/components/help/HelpViews";
import { resolveHelpAudience } from "@/lib/help/audience.server";

export const metadata: Metadata = { title: "What's new | Help" };

export default async function WhatsNewPage() {
  const audience = await resolveHelpAudience();
  return <WhatsNewView audience={audience} scope="tenant" />;
}
