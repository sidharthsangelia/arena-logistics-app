import "server-only";

import type { HelpArticle } from "../types";

/**
 * Getting started. The first thing a new customer reads, so it explains the
 * order of things before any one screen.
 *
 * Copy rules for every file in content/: plain words, second person, no em
 * dashes, never name a carrier or vendor in a customer-visible block (see
 * carrierBranding.md). Arena-only detail goes in a block tagged for arena.
 */
export const gettingStartedArticles: HelpArticle[] = [
  {
    slug: "welcome",
    title: "Welcome to Arena",
    summary: "What you can do here, and the order to do it in.",
    category: "getting-started",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/" }],
    keywords: ["overview", "dashboard", "home", "start", "introduction", "tour"],
    updated: "2026.11.21",
    related: ["first-shipment", "book-international", "book-domestic"],
    blocks: [
      {
        type: "p",
        text: "Arena lets you check shipping prices, book international and domestic shipments, pay for them from a prepaid wallet, and follow each one until it is delivered. Everything lives in the sidebar on the left.",
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "As a **Business Associate** you can also keep a list of your own clients, book shipments on their behalf, and send them branded price quotes.",
      },
      { type: "heading", text: "The order of things" },
      {
        type: "flow",
        stages: [
          { label: "Set up your profile", hint: "Contact details and address" },
          { label: "Upload ID", hint: "PAN and Aadhaar, once" },
          { label: "Top up wallet", hint: "Pay for bookings instantly" },
          { label: "Check rates", hint: "Optional, to compare prices" },
          { label: "Book", hint: "Form saves as you go" },
          { label: "Print label", hint: "Attach it to the parcel" },
          { label: "Track", hint: "Until delivered", tone: "success" },
        ],
      },
      {
        type: "p",
        text: "None of the setup steps blocks you from looking around, but doing them first means the booking form fills itself in and you are never stopped halfway for a missing document. The [first shipment checklist](help:first-shipment) walks through each one.",
      },
      { type: "heading", text: "Your dashboard" },
      {
        type: "list",
        items: [
          "**Finish setting up** appears until your profile, documents and wallet are ready, then disappears on its own.",
          "**Alerts** at the top warn you when your wallet balance is running low or a document on file is about to expire.",
          "**Shipment counts** show what is moving, what needs your attention and what was delivered this month.",
          "**Recent shipments** lists your latest bookings. Click one to open it.",
          "**Wallet activity** shows your latest top-ups and charges.",
          "The wallet balance and the notification bell stay at the top right of every page.",
        ],
      },
      {
        type: "list",
        audiences: ["ba"],
        items: [
          "A **Quotes** card summarises the quotes you have sent to your clients.",
        ],
      },
      { type: "heading", text: "Getting help" },
      {
        type: "p",
        text: "Press [[key:Ctrl K]] (or [[key:⌘ K]] on a Mac) anywhere to search these guides and jump to any page. The [[button:?]] button at the top of every page opens the guide for that screen without leaving it.",
      },
    ],
  },
  {
    slug: "first-shipment",
    title: "Your first shipment, step by step",
    summary: "A checklist from a brand new account to a parcel on its way.",
    category: "getting-started",
    order: 2,
    audiences: ["standard", "ba"],
    keywords: ["checklist", "setup", "onboarding", "new account", "first booking", "order"],
    updated: "2026.11.21",
    related: ["profile-and-contact", "identity-documents", "wallet", "book-international"],
    blocks: [
      {
        type: "p",
        text: "Follow these in order. The checklist at the top of the [Help home](app:/help) ticks each one off for you as it gets done.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Add your contact details and address",
            body: "Go to [Settings](app:/settings) and open **Contact and address**. This becomes the sender on every booking, so you only type it once. See [Profile and contact details](help:profile-and-contact).",
          },
          {
            title: "Upload your PAN and Aadhaar",
            body: "In [Settings](app:/settings), open **Identity documents**, or use the [Document Vault](app:/document-vault). Every international shipment needs these two, and they are attached for you from then on. See [Identity documents (KYC)](help:identity-documents).",
          },
          {
            title: "Top up your wallet",
            body: "Bookings are paid from your [Wallet](app:/wallet) the moment you confirm them. The minimum top-up is ₹100. See [Your wallet](help:wallet).",
          },
          {
            title: "Check a price (optional)",
            body: "Use [International Rates](app:/rates) or [Domestic Rates](app:/domestic-rates) to compare services before you commit. Nothing is booked from these pages.",
          },
          {
            title: "Book the shipment",
            body: "Open [Book Shipment](app:/book) and pick International or Domestic. The form saves after every step, so you can stop and come back. See [Book an international shipment](help:book-international) or [Book a domestic shipment](help:book-domestic).",
          },
          {
            title: "Print the label and hand the parcel over",
            body: "When the shipping label is ready it appears under **Documents** on the shipment page and you get a notification. Print it and attach it to the parcel. See [Shipping labels](help:shipping-labels).",
          },
          {
            title: "Follow it to delivery",
            body: "The shipment page updates as the carrier scans the parcel. You can also [track](app:/track) by shipment number or carrier tracking number. See [What each status means](help:shipment-statuses).",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        audiences: ["ba"],
        title: "Booking for a client?",
        text: "Add the client first from [Clients](app:/clients), upload their KYC documents on the client's page, and then choose **A client** on the first step of the booking form. Their documents are used instead of yours. See [Book for a client](help:book-for-client).",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Shipping something small inside India? You can skip the PAN upload: a domestic booking only asks individual senders for an Aadhaar card, and company senders for a tax invoice instead.",
      },
    ],
  },
  {
    slug: "using-help",
    title: "Using these guides",
    summary: "Search, keyboard shortcuts, the page help button and What's new.",
    category: "getting-started",
    order: 9,
    audiences: ["standard", "ba", "arena-ops"],
    routes: [
      { scope: "tenant", path: "/help" },
      { scope: "tenant", path: "/help/[slug]" },
      { scope: "tenant", path: "/help/whats-new" },
      { scope: "arena", path: "/help" },
      { scope: "arena", path: "/help/[slug]" },
      { scope: "arena", path: "/help/whats-new" },
    ],
    keywords: ["search", "shortcut", "command", "palette", "docs", "documentation", "changelog", "updates"],
    updated: "2026.11.21",
    blocks: [
      { type: "heading", text: "Search from anywhere" },
      {
        type: "p",
        text: "Press [[key:Ctrl K]] on Windows or [[key:⌘ K]] on a Mac, or click **Search** at the top of the page. Type a few words, such as `customs hold` or `print label`. Results include these guides and the pages of the app you can open, so the same box takes you straight to [Book Shipment](app:/book) too.",
      },
      { type: "heading", text: "Help for the page you are on" },
      {
        type: "p",
        text: "The [[button:?]] button at the top right opens the guide for the current screen in a side panel. Your work stays where it is underneath.",
      },
      { type: "heading", text: "What's new" },
      {
        type: "p",
        text: "Every change that affects how you use Arena is listed on [What's new](app:/help/whats-new), newest first, with links to the guides it touched. A dot appears on **Help & Docs** in the sidebar when there is something you have not read yet. Guides that changed in the latest release are marked **Updated**.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Still stuck?",
        text: "Every guide ends with our support email. Include your shipment number (it starts with `ARN`) and we can look straight at it.",
      },
    ],
  },
];
