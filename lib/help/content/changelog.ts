import "server-only";

import type { HelpRelease } from "../types";

/**
 * What's new. Newest release FIRST.
 *
 * Add an entry in the same commit as any change a user would notice (see the
 * "Help docs" rule in AGENTS.md). One release per day you ship; append to
 * today's release if it already exists. Version is the IST date, "YYYY.MM.DD".
 *
 * Tag each entry with who it matters to. A customer never sees an entry tagged
 * only for Arena staff, and Arena ops never see one tagged only for admins.
 */
export const releases: HelpRelease[] = [
  {
    version: "2026.11.21",
    entries: [
      {
        kind: "new",
        title: "Help & Docs",
        body: "Guides for every part of Arena, searchable from anywhere with Ctrl K (⌘ K on a Mac). The ? button at the top of each page opens the guide for that screen, and a setup checklist shows what is left before your first booking.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["using-help", "first-shipment"],
      },
      {
        kind: "new",
        title: "Guides for Business Associates",
        body: "Step-by-step guides for working with clients: adding and importing them, their KYC documents, booking on their behalf, quoting at your own markup and choosing which shipment emails they receive.",
        audiences: ["ba"],
        articles: ["business-associate-guide", "book-for-client", "create-quote", "client-emails"],
      },
      {
        kind: "new",
        title: "Ops console guides",
        body: "A guide for every ops screen, plus runbooks for carrier auto-booking, door pickups, failed courier orders, carrier status sync and pay-on-arrival collections, and an integrations status table.",
        audiences: ["arena-ops"],
        articles: ["ops-start-here", "ops-carrier-auto-booking", "ops-integrations"],
      },
      {
        kind: "new",
        title: "Admin guides for money and configuration",
        body: "Wallets, invoices, manual invoices and corrections, billing customers, rate cards, environment switches, and a write-up of the July 2026 GST state code incident.",
        audiences: ["arena-admin"],
        articles: ["ops-wallets", "ops-manual-invoices", "ops-configuration", "ops-gst-incident"],
      },
    ],
  },
];
