import "server-only";

import { CSB4_MAX_VALUE } from "@/lib/booking/cargo";
import type { HelpArticle } from "../types";

/**
 * Arena admin guides. Money, pricing, legal-adjacent documents and runtime
 * configuration. Tagged `arena-admin` only, so ops members never receive
 * them, matching the money gating on the routes themselves.
 *
 * KYC waivers are the exception: granting one is admin-only, but every ops
 * member meets waived shipments, so that guide is readable by ops too.
 */
export const opsAdminArticles: HelpArticle[] = [
  {
    slug: "ops-kyc-waivers",
    title: "KYC waivers",
    summary: "Letting a customer book with an Aadhaar card alone, for a limited time and on the record.",
    category: "operations",
    order: 8.5,
    audiences: ["arena-ops", "arena-admin"],
    keywords: ["kyc waiver", "waive kyc", "aadhaar only", "exception", "relaxed", "paperwork", "expiry"],
    updated: "2026.11.21",
    related: ["ops-accounts", "ops-clients"],
    blocks: [
      {
        type: "p",
        text: "For a customer who has spoken to the operations team and cannot produce their full paperwork yet. While a waiver is live, their bookings need an **Aadhaar card only**: PAN, Company PAN, GST, IEC and LUT stop being required for every shipment type. Aadhaar itself is never waivable.",
      },
      {
        type: "steps",
        audiences: ["arena-admin"],
        items: [
          { title: "Open the account, or the BA client, the exception is for", body: "Waivers sit on the account page and the client page, next to the other business settings." },
          { title: "Write the reason", body: "What was agreed with the customer and who agreed it. Kept on the record, never shown to the customer." },
          { title: "Set the expiry", body: "Required. Defaults to 90 days, at most 365. The full document list applies again from that date." },
          { title: "Save", body: "Applies from their next booking. Shipments already placed are unaffected. **Change reason or expiry** and **Lift the KYC waiver** are on the same card." },
        ],
      },
      {
        type: "p",
        audiences: ["arena-ops"],
        text: "Only admins can grant, change or lift a waiver. Ask one, with the customer's name and what was agreed.",
      },
      {
        type: "list",
        items: [
          "**No cascade.** Waiving a BA does not waive its clients. Each party is waived on its own.",
          "The customer sees only \"KYC requirements relaxed by Arena ops\" on the KYC step: never the reason, the admin or the date.",
          "Every shipment records whether it went out on a waiver (`kycWaivedAtBooking`), because the waiver itself expires.",
        ],
      },
    ],
  },
  {
    slug: "ops-wallets",
    title: "Wallets and money",
    summary: "Balances, the ledger, adding or removing money by hand, and collections.",
    category: "operations",
    order: 20,
    audiences: ["arena-admin"],
    routes: [{ scope: "arena", path: "/wallets" }],
    keywords: ["wallet", "balance", "ledger", "credit", "debit", "add money", "remove money", "neft", "cheque", "offline payment", "collections", "write off", "razorpay", "refund"],
    updated: "2026.11.21",
    related: ["ops-pay-on-arrival", "ops-invoices"],
    blocks: [
      {
        type: "table",
        head: ["Tab", "Shows"],
        rows: [
          ["Overview", "Money in and out over a period, and how old the uncollected balances are"],
          ["Organisations", "Every account's balance"],
          ["Transactions", "The full ledger: top-ups, shipment debits, refunds and manual adjustments, with who made each"],
          ["Collections", "Pay-on-arrival balances still owed, how long each has waited, and who owes it"],
        ],
      },
      { type: "heading", text: "Add or remove money by hand" },
      {
        type: "p",
        text: "Online top-ups credit themselves through the Razorpay webhook. Use a manual adjustment for anything else:",
      },
      {
        type: "table",
        head: ["Choose", "When"],
        rows: [
          ["Add money: They paid us offline", "NEFT, cheque or UPI straight to our account"],
          ["Remove money: Fixing an over-credit", "Money credited twice or against the wrong account"],
        ],
      },
      {
        type: "list",
        items: [
          "A **reason** is required and recorded on the ledger. Write it so it makes sense months later: `NEFT received on 22 July against invoice 4471`.",
          "Add the **reference**: bank UTR, cheque number or UPI reference.",
          "A confirmation step shows exactly what will happen before it goes through. Your name is recorded on the entry.",
        ],
      },
      { type: "heading", text: "Collections" },
      {
        type: "list",
        items: [
          "Anyone on the team records a payment from the booking page. Only admins **reverse** a payment or **write off** a balance.",
          "A write-off needs a reason (`Client stopped responding after three months of follow-up`). Choose **Keep chasing it** to back out.",
        ],
      },
    ],
  },
  {
    slug: "ops-invoices",
    title: "Invoices",
    summary: "Every invoice Arena issues, the booking invoices that failed to generate, and GST rules.",
    category: "operations",
    order: 21,
    audiences: ["arena-admin"],
    routes: [{ scope: "arena", path: "/invoices" }],
    keywords: ["invoice", "tax invoice", "gst", "booking invoice", "account bill", "credit note", "missing invoice", "retry invoice", "numbering", "ARN", "igst", "cgst", "sgst"],
    updated: "2026.11.21",
    related: ["ops-manual-invoices", "ops-billing-customers", "ops-gst-incident"],
    blocks: [
      {
        type: "p",
        text: "[Invoices](app:/invoices) is one feed of every invoice, searchable by number, customer, shipment, AWB or reference.",
      },
      {
        type: "table",
        head: ["Kind", "Raised by", "Paid how"],
        rows: [
          ["Booking tax invoice", "Automatically for every paid booking", "Already, from the wallet"],
          ["Manual tax invoice", "An admin, for work arranged off the platform. See [Manual invoices](help:ops-manual-invoices)", "Bank transfer, marked paid by hand"],
          ["Credit note", "An admin, against an issued invoice", "Nothing to pay"],
          ["Account bill", "An admin uploading a PDF from another system (**Issue an invoice**)", "Marked paid by hand"],
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Needs attention",
        text: "The panel at the top lists paid bookings whose tax invoice did not generate. Retry from there. A booking without its invoice is a GST filing gap.",
      },
      { type: "heading", text: "Numbering" },
      {
        type: "p",
        text: "Booking and manual tax invoices share one series: `ARN` + month and year + a running number, for example `ARN112600047`. The number runs through the financial year and resets in April. Credit notes have their own series, `ARNCN`. Never rename the `TAX_INVOICE` counter: it would restart at 1 and reissue numbers customers already hold.",
      },
      { type: "heading", text: "GST" },
      {
        type: "list",
        items: [
          "Prices are tax inclusive. The invoice splits what the customer paid into taxable value and 18% GST; the total never changes.",
          "Same state as Arena: CGST + SGST. Different state: IGST. Arena's state comes from `INVOICE_ISSUER_STATE_CODE`, which must equal the first two digits of `INVOICE_ISSUER_GSTIN`. The new-invoice page warns if they disagree.",
          "International freight is charged at 18% pending the CA's confirmation; switching to exempt is one setting in `lib/invoices/tax/config.ts`.",
          "Issued invoices are records. Never edit one in the database; correct it from the app.",
        ],
      },
    ],
  },
  {
    slug: "ops-manual-invoices",
    title: "Manual invoices",
    summary: "Raising, sending, correcting and cancelling GST invoices for off-platform work.",
    category: "operations",
    order: 22,
    audiences: ["arena-admin"],
    routes: [
      { scope: "arena", path: "/invoices/new" },
      { scope: "arena", path: "/invoices/manual/[id]" },
      { scope: "arena", path: "/invoices/manual/[id]/edit" },
    ],
    keywords: ["manual invoice", "new invoice", "draft", "issue invoice", "credit note", "correction", "revise", "cancel invoice", "irn", "reimbursement", "place of supply", "consignment", "charges"],
    updated: "2026.11.21",
    related: ["ops-invoices", "ops-billing-customers"],
    blocks: [
      {
        type: "p",
        text: "For freight, customs clearance or other work arranged with Arena directly, outside the booking form. The customer is a **billing customer**, who may or may not have an Arena account.",
      },
      {
        type: "steps",
        items: [
          { title: "New invoice, then pick the customer", body: "Or add one. Their saved defaults (currency, tax mode, terms, charge labels) fill in." },
          { title: "Add consignments", body: "Forwarder and product (for example DHL, Express Worldwide), route, ship type (CSB-IV, CSB-V or Commercial, a label only), transport and up to three custom fields." },
          { title: "Add charges to each consignment", body: "From the charge catalogue or typed. Each has its own GST rate. Tick **reimbursement** for duty or origin taxes paid on the customer's behalf: they stay out of taxable value and every tax head." },
          { title: "Choose tax inclusive or exclusive and the place of supply", body: "Place of supply is picked from the government's list only; it decides IGST against CGST + SGST." },
          { title: "Preview, then Save draft", body: "A draft has no number and can be changed or deleted freely." },
          { title: "Issue invoice", body: "Takes the next ARN number and renders the PDF in one step. If rendering fails, nothing is issued and the number is not used." },
          { title: "Send to customer, then Mark paid", body: "Sending emails the PDF. **Mark paid** when the money arrives." },
        ],
      },
      { type: "heading", text: "Fixing a mistake" },
      {
        type: "table",
        head: ["Situation", "Do this"],
        rows: [
          ["A wrong figure, address or line on an issued or paid invoice", "**Edit** it. Same number, the old version kept in its history, a new PDF. A paid invoice stays paid. Nothing is re-sent: the page shows **Revised after sending** so you can send it again"],
          ["Money to give back", "**Raise a credit note** against the invoice"],
          ["Raised against the wrong customer, or should never exist", "**Cancel this invoice** with a reason. The number and PDF are kept"],
        ],
      },
      {
        type: "list",
        items: [
          "A correction cannot change the customer, the document type, or the invoice a credit note corrects. The date can move only within the same month, because the month is in the number.",
          "Cancelled invoices are frozen.",
          "IRN, acknowledgement and QR are pasted in by hand. If an invoice has an IRN, a correction must also be amended on the IRP portal.",
          "Invoices in a currency other than INR state GST in that currency, which is not filing-correct. Check with the CA before using one.",
        ],
      },
    ],
  },
  {
    slug: "ops-billing-customers",
    title: "Billing customers",
    summary: "The address book of everyone Arena invoices by hand.",
    category: "operations",
    order: 23,
    audiences: ["arena-admin"],
    routes: [
      { scope: "arena", path: "/invoices/customers" },
      { scope: "arena", path: "/invoices/customers/[id]" },
    ],
    keywords: ["billing customer", "billing party", "customer list", "gstin", "outstanding", "billed"],
    updated: "2026.11.21",
    related: ["ops-manual-invoices"],
    blocks: [
      {
        type: "p",
        text: "[Billing customers](app:/invoices/customers) is separate from accounts and BA clients on purpose: an off-platform customer has no account, and putting them in a BA's client list would leak them into that BA's screens and exports.",
      },
      {
        type: "list",
        items: [
          "A billing customer can be linked to an account or a BA client. Their invoices then also appear in that account's Invoices page.",
          "Details are copied once at linking. If the account's details change later, the customer's page shows the difference and offers **use their current details**. Nothing updates on its own, because an invoice address must not change behind your back.",
          "**Billed** counts issued and paid invoices. Booking invoices for a linked account are shown as a count, never added to outstanding: they were paid from the wallet.",
          "A customer can be removed only while they have nothing but drafts.",
        ],
      },
    ],
  },
  {
    slug: "ops-rate-cards",
    title: "Rate cards",
    summary: "Building a multi-country Excel price list from the rate sweep, safely.",
    category: "operations",
    order: 24,
    audiences: ["arena-admin"],
    routes: [{ scope: "arena", path: "/quotes/new-rate-card" }],
    keywords: ["rate card", "workbook", "excel", "price list", "customer rate card", "internal cost card", "markup", "terms", "ARQ"],
    updated: "2026.11.21",
    related: ["ops-rate-sweeps", "ops-quotes"],
    blocks: [
      {
        type: "callout",
        tone: "warning",
        title: "The audience choice is the dangerous one",
        text: "**Customer rate card**: marked-up prices, vendors masked, safe to send. **Internal cost card**: our raw buying price with every vendor named, stamped INTERNAL on every sheet. Sending an internal card to a customer hands them our cost book. A customer card at 0% markup is refused for the same reason.",
      },
      {
        type: "steps",
        items: [
          { title: "Who is this file for", body: "Customer or internal, and optionally link a client." },
          { title: "Coverage", body: "Countries and weight slabs. Only what the sweep priced is offered, so no number is invented." },
          { title: "Pricing and presentation", body: "Markup (applied the same way as the live calculator), and the shape: one grid of the best rate per lane, or one sheet per carrier." },
          { title: "Services normally left out", body: "Gifts-only and B2B-only services are excluded by default, because a price you cannot sell for a general consignment is not one you can honour." },
          { title: "Build", body: "The file downloads and is logged with an `ARQ-` number under Quotes, Rate cards." },
        ],
      },
      {
        type: "list",
        items: [
          "Customer files are also stored, so they can be downloaded again. Internal files are never uploaded, because a storage link is public: keep the download safe.",
          "Rate cards state no transit times on purpose. Give timing on a call.",
          "Prices come from the last sweep and are indicative; bookings always price live.",
          "The payment, cancellation, liability and jurisdiction terms have not yet been signed off by anyone at Arena. Get them reviewed before the first customer file goes out.",
        ],
      },
    ],
  },
  {
    slug: "ops-configuration",
    title: "Configuration and switches",
    summary: "The environment settings that change behaviour, and the traps in them.",
    category: "operations",
    order: 25,
    audiences: ["arena-admin"],
    keywords: ["env", "environment", "config", "settings", "flags", "vercel", "INTL_AUTO_BOOK_ENABLED", "ARAMEX_FOREIGN_HAWB", "AADHAAR_ENCRYPTION_KEY", "INVOICE_ISSUER", "CRON_SECRET", "database", "password", "dollar"],
    updated: "2026.11.21",
    related: ["ops-integrations", "ops-gst-incident"],
    blocks: [
      {
        type: "table",
        head: ["Setting", "What it does", "If wrong or missing"],
        rows: [
          ["`INTL_AUTO_BOOK_ENABLED`", "Turns on export auto-booking", "Unset: nothing auto-books, silently"],
          ["`ARAMEX_FOREIGN_HAWB`", "`off` stops sending our reference to Aramex", "Off: loses the duplicate-booking guard"],
          ["`AADHAAR_ENCRYPTION_KEY`", "Encrypts full Aadhaar numbers for Aramex", "Missing: only masked numbers stored, Sentry errors, Aramex bookings lack Aadhaar"],
          ["`INVOICE_ISSUER_*`", "Arena's name, address, GSTIN, bank and state on every invoice", "Invoicing is blocked while a placeholder remains. A state code that disagrees with the GSTIN files GST under the wrong heads"],
          ["`SHIPMOZO_WEBHOOK_TOKEN`", "Secret path for the Shipmozo tracking webhook", "Unset: webhook acts only on shipments it can match"],
          ["`SPEEDOPOST_CLIENT_CODE`", "Required on every SpeedoPost order", "Blank: SpeedoPost quotes but every booking fails, money held"],
          ["`CRON_SECRET`", "Protects the quote-expiry and attention crons", "Wrong: crons are refused and nothing expires or escalates"],
          ["`RESEND_FROM_EMAIL`", "Sender of every customer email", "Wrong domain: emails bounce or land in spam"],
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "A $ in a password",
        text: "Next.js expands `$` in env files, so a password containing one is silently cut short and the vendor answers \"invalid username or password\". Escape it as `\\$`. The backslash looks like a typo and keeps getting removed; it is not part of the password. Diagnose by comparing lengths, never by eye.",
      },
      {
        type: "list",
        items: [
          "There is one database, and local `.env` points at production. Never run jobs, syncs or test scripts locally that write or email.",
          "Schema changes are applied with `prisma db push`; there is no migrations folder. Restart the dev server after generating, or new models read as undefined.",
          `The CSB-IV ceiling (₹${CSB4_MAX_VALUE.toLocaleString("en-IN")}) and other customs thresholds are code constants, not settings.`,
        ],
      },
    ],
  },
  {
    slug: "ops-gst-incident",
    title: "Incident: GST state code (July to August 2026)",
    summary: "21 early booking invoices filed IGST instead of CGST + SGST. Fixed; how to handle the records.",
    category: "operations",
    order: 26,
    audiences: ["arena-admin"],
    keywords: ["gst", "incident", "state code", "igst", "cgst", "sgst", "haryana", "delhi", "07", "06", "gstr-1", "amendment"],
    updated: "2026.11.21",
    related: ["ops-invoices", "ops-configuration"],
    blocks: [
      {
        type: "p",
        text: "`INVOICE_ISSUER_STATE_CODE` was set to `07` (Delhi) while Arena's GSTIN starts `06` (Haryana). That state code alone decides IGST against CGST + SGST, so Haryana customers were billed IGST.",
      },
      {
        type: "table",
        head: ["", "Detail"],
        rows: [
          ["Affected", "21 booking invoices, `ARN/26-27/00001` to `00021`, issued 31 July to 5 August 2026"],
          ["Buyers", "All in Haryana, none with a GSTIN (B2C), all paid"],
          ["Tax", "₹3,319.59 shown as IGST instead of about ₹1,659.80 CGST and ₹1,659.79 SGST"],
          ["Customer impact", "None. Totals are identical either way"],
          ["Fixed", "8 August 2026. Every invoice since then is correct"],
        ],
      },
      { type: "heading", text: "Handling it" },
      {
        type: "list",
        items: [
          "Do not edit or re-issue the 21 invoices. They are records of what was issued.",
          "The correction belongs in the returns: the CA checks what was filed for July and August and, if needed, amends it (B2C amendment in a later GSTR-1, with the tax moved to the right heads).",
          "Remaining risk: if `INVOICE_ISSUER_STATE_CODE` is ever missing, the code falls back to `07`. Keep it set to `06` in every environment.",
        ],
      },
    ],
  },
];
