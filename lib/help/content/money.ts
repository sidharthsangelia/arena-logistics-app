import "server-only";

import { WALLET_HISTORY_RANGE_DAYS } from "@/lib/wallet/historyRange";
import type { HelpArticle } from "../types";

export const moneyArticles: HelpArticle[] = [
  {
    slug: "wallet",
    title: "Your wallet",
    summary: "Top up, see every charge and refund, and what each line means.",
    category: "money",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/wallet" }],
    keywords: ["wallet", "balance", "top up", "topup", "add money", "recharge", "payment", "refund", "transactions", "upi", "card"],
    updated: "2026.11.21",
    related: ["invoices", "faq-payments"],
    blocks: [
      {
        type: "p",
        text: "Shipments are paid from a prepaid wallet, so a booking is confirmed the moment you place it with no payment page in between. Your balance shows at the top right of every page.",
      },
      { type: "heading", text: "Top up" },
      {
        type: "steps",
        items: [
          { title: "Open your wallet and click Recharge", body: "Go to [Wallet](app:/wallet), or click the balance at the top of any page to get there." },
          { title: "Choose an amount", body: "Pick ₹500, ₹1,000, ₹2,500 or ₹5,000, or type your own. The minimum is ₹100." },
          { title: "Pay in the secure payment window", body: "Use any method it offers. Keep the window open until it closes on its own." },
          { title: "Done", body: "The balance updates as soon as the payment is confirmed, usually within seconds." },
        ],
      },
      { type: "heading", text: "Reading the history" },
      {
        type: "p",
        text: `Choose how far back to look: the last ${WALLET_HISTORY_RANGE_DAYS.join(", ")} days.`,
      },
      {
        type: "table",
        head: ["Line", "Meaning"],
        rows: [
          ["Top-up", "Money you added"],
          ["Shipment", "A booking paid from the wallet"],
          ["Refund", "Money returned for a shipment, for example one that was cancelled"],
          ["Added by Arena", "A credit our team made for you"],
          ["Corrected by Arena", "A deduction our team made to correct your balance"],
          ["Adjustment", "Any other correction"],
        ],
      },
      {
        type: "p",
        text: "Each line also has a state: **Success**, **Pending** (waiting for the bank), **Failed** (no money moved) or **Reversed**.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Paying later",
        text: "Some accounts are set up by Arena to pay when the parcel reaches our hub instead of from the wallet. If that is you, bookings show **Payment pending** and you do not need to keep a balance.",
      },
    ],
  },
  {
    slug: "invoices",
    title: "Invoices and credit notes",
    summary: "Your GST tax invoices, account bills and credit notes in one list.",
    category: "money",
    order: 2,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/invoices" }],
    keywords: ["invoice", "tax invoice", "gst invoice", "bill", "credit note", "download", "outstanding", "overdue", "receipt", "gstin"],
    updated: "2026.11.21",
    related: ["wallet", "prices-and-tax"],
    blocks: [
      {
        type: "p",
        text: "[Invoices](app:/invoices) holds every billing document Arena issues to you. The cards at the top show what is **outstanding**, what is **overdue** and the total count.",
      },
      {
        type: "table",
        head: ["Type", "What it is", "How it is paid"],
        rows: [
          ["Booking", "The GST tax invoice raised automatically for each shipment", "Already paid from your wallet when you booked"],
          ["Services", "A tax invoice for work arranged with us directly, outside the booking form", "As shown on the invoice"],
          ["Account bill", "A bill raised to your account by our team", "As shown on the bill"],
          ["Credit note", "Reverses part or all of an earlier invoice", "Nothing to pay"],
        ],
      },
      {
        type: "list",
        items: [
          "Filter by **Document type** or status, and sort by any column.",
          "**Download** gets the PDF. A new invoice may say **Preparing** for a few moments while its PDF is made.",
          "An unpaid bill past its due date shows as **Overdue**.",
          "A shipment's tax invoice is also on that shipment's page under **Documents**.",
        ],
      },
      {
        type: "p",
        text: "The invoice number looks like `ARN112600047`: the prefix, the month and year, then a running number. The total on a booking invoice always matches what left your wallet, split into taxable value and GST.",
      },
      {
        type: "callout",
        tone: "tip",
        title: "Need your GSTIN on invoices?",
        text: "Upload your GST certificate with its number under [Identity documents](help:identity-documents). Invoices raised after that carry it.",
      },
    ],
  },
];
