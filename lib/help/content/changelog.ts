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
    version: "2026.11.26",
    entries: [
      {
        kind: "improved",
        title: "A new sign-in page",
        body: "Sign in, create account and workspace setup share one cleaner look, with the Arena emblem and a short summary of what you can do here. The sign-in form now matches the rest of the app. Setting up a workspace shows the steps to your first booking, and its **Workspace ID** field no longer shows a web address in front of it.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
      },
      {
        kind: "improved",
        title: "Easier box sizes",
        body: "Wherever you enter box sizes, in the rate calculators and the booking form, a **How to measure** link shows a box with length, breadth and height marked. **Common sizes** chips fill in a standard carton in one click, each box shows its size weight as you type, and a short note flags a number that looks mistyped. The booking form now takes sizes in inches too, calls the second side breadth, and lists count and weight first, the same as the calculators.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["international-rates", "domestic-rates", "chargeable-weight", "book-international"],
      },
      {
        kind: "improved",
        title: "You can see when rates arrive",
        body: "After **Get live rates**, the rate calculators move down to the results and show placeholders while carriers answer, so the prices appear where you are already looking. If you scroll away meanwhile, a message with a **View** button tells you they are ready. A search that finds no rates now says so, instead of showing nothing.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["international-rates"],
      },
      {
        kind: "improved",
        title: "Keyboard shortcuts in the rate calculators",
        body: "Use the arrow keys to move around the box rows like a spreadsheet, and Cmd + Enter (Ctrl + Enter on Windows) to get rates from any field. Press **?** or click the keyboard icon above your boxes for the full list. Enter on its own no longer searches, and scrolling over a box field no longer changes its number.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["international-rates", "domestic-rates"],
      },
      {
        kind: "improved",
        title: "Courier logos on domestic rates",
        body: "Domestic rate cards now show each courier's logo, as international ones do, so you can spot a courier at a glance.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["domestic-rates"],
      },
      {
        kind: "fixed",
        title: "Error marks clear as you fix them",
        body: "In the booking form and the rate calculators, a field marked in red now clears the moment you fill it in correctly, including ones you pick from a list or switch on, and the message under the form counts down what is left. In the calculators, a box row now outlines only the empty fields and names them.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
        articles: ["book-international", "international-rates"],
      },
      {
        kind: "improved",
        title: "A tidier sidebar",
        body: "The sidebar shows the Arena emblem clearly, and its icons now match their pages: a globe for international rates, a calculator for domestic rates, a receipt for invoices and a contacts book for the address book. Collapsing it to icons is smoother, with the icons staying put while the labels fade away.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
      },
    ],
  },
  {
    version: "2026.11.25",
    entries: [
      {
        kind: "improved",
        title: "Pages load without the wait",
        body: "Headings, labels, buttons and table headers now appear the moment you open a page, with only your own figures and rows filling in after. Each browser tab is now named after its page, so several open tabs are easy to tell apart.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
      },
      {
        kind: "improved",
        title: "Simpler client list",
        body: "The Business Associate filter is gone from your client list. It only ever showed your own business, so it did nothing.",
        audiences: ["ba"],
        articles: ["clients"],
      },
      {
        kind: "fixed",
        title: "Error and missing pages",
        body: "If a page fails to load, Try again now loads it afresh instead of showing the same error. A link to something that does not exist keeps you inside the app with a way back to your dashboard.",
        audiences: ["standard", "ba", "arena-ops", "arena-admin"],
      },
      {
        kind: "improved",
        title: "Cancelling and deleting manual invoices from the list",
        body: "The row menu now asks for the cancellation reason, and confirms a draft delete, in the same dialogs as the invoice page instead of browser pop-ups.",
        audiences: ["arena-admin"],
        articles: ["ops-manual-invoices"],
      },
    ],
  },
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
