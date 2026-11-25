import "server-only";

import {
  CARRIER_SYNC_JOB_MAX_AGE_DAYS,
  CARRIER_SYNC_MAX_AGE_DAYS,
  CARRIER_SYNC_TIERS,
} from "@/lib/tracking/carrierStatus";
import type { HelpArticle } from "../types";

const SYNC_TIERS_TEXT = CARRIER_SYNC_TIERS.map(
  (t) => `every ${t.everyHours} hours from day ${t.fromDays}`,
).join(", ");

/**
 * Arena ops guides: everything an ops member does day to day.
 *
 * Staff-only, so these may name vendors, env vars and internal tables. Money
 * (wallets, invoicing, account pricing) lives in ops-admin.ts, tagged for
 * admins only. Paths in "app:" links are relative to /arena-dashboard.
 */
export const opsArticles: HelpArticle[] = [
  {
    slug: "ops-start-here",
    title: "Ops console: start here",
    summary: "What the ops console covers, who can do what, and a daily routine.",
    category: "operations",
    order: 1,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/" }],
    keywords: ["overview", "dashboard", "ops", "routine", "daily", "roles", "admin", "member", "permissions"],
    updated: "2026.11.21",
    related: ["ops-international-bookings", "ops-domestic-bookings", "ops-notifications", "ops-integrations"],
    blocks: [
      {
        type: "p",
        text: "The ops console at `/arena-dashboard` is where Arena staff run every customer's bookings, accounts and money. Customers never see it, and staff cannot open customer screens: the proxy sends Arena staff back here.",
      },
      { type: "heading", text: "Who can do what" },
      {
        type: "table",
        head: ["Area", "Ops member", "Admin"],
        rows: [
          ["Bookings, status, carrier and pickup booking, documents, notes", "Yes", "Yes"],
          ["Record a pay-on-arrival collection", "Yes", "Yes"],
          ["Reverse or write off a collection", "", "Yes"],
          ["Account markup, skip payment, make or revoke a Business Associate", "", "Yes"],
          ["KYC waivers", "", "Yes"],
          ["Wallets, invoices, billing customers", "", "Yes"],
          ["Rate cards (customer and internal workbooks)", "", "Yes"],
          ["View rate sweeps", "Yes", "Yes"],
          ["Start or force-finish a rate sweep", "", "Yes"],
          ["Notices and messages to tenants", "Yes", "Yes"],
        ],
      },
      {
        type: "p",
        text: "Admin is the Clerk **Admin** role on the Arena organisation. Money is removed from screens for ops members, not greyed out, so an ops member sees no revenue tile, no amount columns and no Wallets link.",
      },
      { type: "heading", text: "A daily routine" },
      {
        type: "steps",
        items: [
          { title: "Clear the bell", body: "Critical notifications first: a paid booking a carrier refused, a top-up the bank rejected. See [Notifications](help:ops-notifications)." },
          { title: "Overview: Needs Review", body: "Shipments on hold, pending BA applications, unverified KYC documents and (admins) organisations low on wallet balance." },
          { title: "International Bookings: Awaiting ops", body: "Every new export. Check KYC, confirm the carrier booked, book door pickups. See [International bookings](help:ops-international-bookings)." },
          { title: "Domestic Bookings", body: "Anything whose courier order is not back with an AWB. See [Domestic bookings](help:ops-domestic-bookings)." },
          { title: "Needs attention", body: "Documents pending, customs holds and on-hold shipments. Every one of these needs a person to contact the customer; none of them email automatically." },
          { title: "Pay on arrival", body: "Parcels at the hub from skip-payment accounts: collect and record. See [Pay on arrival](help:ops-pay-on-arrival)." },
        ],
      },
      { type: "heading", text: "The Overview page" },
      {
        type: "list",
        items: [
          "**Total Shipments**, **Delivered (MTD)**, **Active Companies** (BAs and clients with a booking in the last 30 days) and **Avg. Transit Time** (booked to delivered, last 90 days).",
          "**Est. Revenue (MTD)** is admin-only: markup earned this month, backed out of each shipment's quoted total at the markup applied when it was booked.",
          "**Recent Bookings** and **Top Organisations** for the last 30 days.",
          "**Needs Review** collects the counts that want a person today.",
        ],
      },
    ],
  },
  {
    slug: "ops-international-bookings",
    title: "International bookings",
    summary: "Working an export from booked to delivered on the booking page.",
    category: "operations",
    order: 2,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/bookings" },
      { scope: "arena", path: "/bookings/[id]" },
    ],
    keywords: ["bookings", "export", "international", "booking detail", "operate", "hawb", "mawb", "awb", "documents", "visibility", "internal notes", "needs attention"],
    updated: "2026.11.21",
    related: ["ops-carrier-auto-booking", "ops-first-mile", "ops-status-and-tracking", "ops-pay-on-arrival"],
    blocks: [
      {
        type: "p",
        text: "[International Bookings](app:/bookings) lists every export. The cards along the top count **Awaiting ops**, **Processing**, **In transit** and **Needs attention** (on hold, documents pending, customs hold). Domestic bookings live on their own page.",
      },
      { type: "heading", text: "The booking page" },
      {
        type: "p",
        text: "The hero at the top shows the shipment number, status, route, weight, declared value, quoted total and carrier. Under it, a **Needs attention** banner states the one thing blocking the shipment, if any. The left column is for reviewing; the sticky right rail is for acting.",
      },
      {
        type: "table",
        head: ["Banner says", "What to do"],
        rows: [
          ["Payment is not confirmed", "Do not process until it clears"],
          ["Documents are pending from the customer", "Chase the customer before processing"],
          ["Held at customs", "Work the release with the carrier and customer"],
          ["Door pickup is booked but no courier tracking is recorded", "Add the courier AWB in the door pickup panel so the customer can follow it"],
          ["Pay on arrival / parcel has arrived at the hub", "Collect the amount and record it. See [Pay on arrival](help:ops-pay-on-arrival)"],
        ],
      },
      { type: "heading", text: "The operate rail, top to bottom" },
      {
        type: "list",
        items: [
          "**Update status**: always open. Pick the new status and an optional note. See [Statuses, emails and tracking](help:ops-status-and-tracking) for who gets emailed.",
          "**Carrier booking**: the automatic booking with the international carrier, its AWB, and **Book with carrier** to retry or **Cancel**. See [Carrier auto-booking](help:ops-carrier-auto-booking).",
          "**Carrier tracking**: airline or carrier, **HAWB** (the house waybill the customer sees), **MAWB** (master waybill) and an optional tracking URL. Fill this in for any shipment booked by hand.",
          "**Door pickup**: book the first-mile courier and move its stages. See [Door pickup](help:ops-first-mile).",
          "**Status history**: every change, who made it and the note.",
        ],
      },
      { type: "heading", text: "The review column" },
      {
        type: "list",
        items: [
          "**KYC documents**: the documents attached at booking, with anything missing flagged. Collapses when nothing is missing.",
          "**Documents**: upload labels, invoices and customs papers with a label (for example `AWB - Aramex`). Each document has a visibility switch: **Visible to client** shows it on the customer's shipment page, hidden keeps it internal.",
          "**Internal notes**: free text for the team, never shown to the customer.",
          "Addresses, packages, pricing, wallet transactions and booking metadata, including which Aramex contract sold the service.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text: "A label uploaded here is visible to the customer only when switched to **Visible to client**. Check the switch on anything with carrier names or our buying price on it.",
      },
    ],
  },
  {
    slug: "ops-carrier-auto-booking",
    title: "Carrier auto-booking (international)",
    summary: "How paid exports book themselves with the carrier, and what to do when one does not.",
    category: "operations",
    order: 3,
    audiences: ["arena-ops"],
    keywords: ["auto book", "intl booking", "carrier booking failed", "inngest", "retry", "skart", "shipmozo", "aramex", "intlBookingError", "COURIER_BOOKING_FAILED", "INTL_AUTO_BOOK_ENABLED"],
    updated: "2026.11.21",
    related: ["ops-international-bookings", "ops-integrations", "ops-configuration"],
    blocks: [
      {
        type: "flow",
        stages: [
          { label: "Paid" },
          { label: "Book at vendor", hint: "Inngest job" },
          { label: "AWB + label" },
          { label: "Customer told", hint: "Notification + email" },
          { label: "Door pickup released", tone: "success" },
        ],
      },
      {
        type: "p",
        text: "When an export is paid, an Inngest job books it with the vendor that sold the service (Shipmozo international, sKart or Aramex direct), stores the AWB and label, announces the label to the customer, and releases the door pickup if there is one.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Only runs when switched on",
        text: "The whole path is gated by `INTL_AUTO_BOOK_ENABLED=true` in the environment. Unset, nothing auto-books and there is no error: every export waits for ops. If exports are piling up unbooked, check this first.",
      },
      { type: "heading", text: "When it fails" },
      {
        type: "steps",
        items: [
          { title: "You get a critical notification", body: "`COURIER_BOOKING_FAILED`, naming the shipment. The customer's money stays held. Nothing is refunded or cancelled automatically." },
          { title: "Read the error", body: "The carrier booking panel shows the vendor's error, stored on the shipment as `intlBookingError`. The Inngest run has the full trace." },
          { title: "Fix the cause, then Book with carrier", body: "Usually missing paperwork (IEC and AD code for CSB-V and Commercial, LUT when declared under LUT, a GSTIN for an Aramex company sender) or an address the vendor rejects." },
          { title: "Or book by hand", body: "Book in the vendor's own panel, then enter the HAWB, MAWB and carrier in **Carrier tracking** and upload the label under Documents, visible to the client." },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "Never switch the carrier",
        text: "International carriers are not interchangeable and the customer paid for a named service. If the service cannot be identified the job stops for a person; it never picks another carrier.",
      },
      { type: "heading", text: "Vendor specifics" },
      {
        type: "list",
        items: [
          "**Aramex** bills to the contract that quoted (`aramex-direct` or `aramex-ups`, carried on the quote's courier id). An old Aramex quote with no account key is refused and must be booked by hand. Aramex bookings are plain prepaid: no FRDM, no COD.",
          "**Shipmozo** does not de-duplicate on our order id. Before retrying, check their panel that the first attempt really failed, or the customer gets two parcels.",
          "**ShipGlobal** quotes but cannot be booked from Arena yet. A paid ShipGlobal service is booked by hand.",
          "`ARAMEX_FOREIGN_HAWB=off` is the kill switch if Aramex rejects our reference format. It removes the duplicate-booking guard, so treat it as temporary.",
        ],
      },
    ],
  },
  {
    slug: "ops-first-mile",
    title: "Door pickup (first mile)",
    summary: "Booking the courier that brings an export from the customer's door to our hub.",
    category: "operations",
    order: 4,
    audiences: ["arena-ops"],
    keywords: ["first mile", "door pickup", "pickup", "hub", "dwarka", "shipmozo pickup", "auto-assign", "COURIER_UNRESOLVED", "webhook"],
    updated: "2026.11.21",
    related: ["ops-international-bookings", "ops-carrier-auto-booking"],
    blocks: [
      {
        type: "p",
        text: "When a customer ticks door pickup, they choose and pay for a domestic courier to carry the parcel from their pickup address to our hub (Dwarka, New Delhi, from `FIRST_MILE_HUBS` in `lib/booking/firstMile.ts`). The pickup is booked through Shipmozo from the booking page; nobody needs the Shipmozo panel.",
      },
      {
        type: "steps",
        items: [
          { title: "Open the Door pickup panel on the booking", body: "Check the pickup contact, parcel and the courier the customer paid for." },
          { title: "Confirm & book", body: "Arena creates the pickup point in Shipmozo, pushes the order to the hub, assigns the courier and schedules the pickup. Every id is stored as it arrives, so a failure halfway resumes instead of duplicating." },
          { title: "Wait for the AWB", body: "It usually appears within a minute." },
          { title: "Let tracking move it", body: "Shipmozo's webhook moves the stages (picked up, in transit to hub, arrived at hub) and emails the customer at picked up and arrived at hub. You can also move a stage by hand." },
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Courier could not be matched",
        text: "If the paid courier cannot be resolved (`COURIER_UNRESOLVED`), booking stops before any Shipmozo call. The dialog then offers **Book, auto-assign allowed**, which lets Shipmozo pick the courier. Use it only after checking the customer is fine with that.",
      },
      {
        type: "list",
        items: [
          "Only vendors on `FIRST_MILE_VENDOR_IDS` are offered for this leg. SpeedoPost is deliberately excluded: its create call cannot be safely retried, and this leg has a flight to make.",
          "When the pickup courier says delivered, it means delivered to our hub. Customers see it as in transit, not delivered.",
          "The webhook URL is `/api/webhooks/shipmozo/<SHIPMOZO_WEBHOOK_TOKEN>`. Without the token it still works, matching only shipments it can resolve.",
        ],
      },
    ],
  },
  {
    slug: "ops-domestic-bookings",
    title: "Domestic bookings",
    summary: "Courier orders placed automatically at payment, and what to do when one is stuck.",
    category: "operations",
    order: 5,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/domestic-bookings" },
      { scope: "arena", path: "/domestic-bookings/[id]" },
    ],
    keywords: ["domestic", "courier", "india", "cod", "awb", "speedopost", "shipmozo", "courier booking failed", "gst paperwork", "e-way bill", "auto-assign"],
    updated: "2026.11.21",
    related: ["ops-integrations", "ops-status-and-tracking"],
    blocks: [
      {
        type: "p",
        text: "[Domestic Bookings](app:/domestic-bookings) holds India-to-India shipments. They share the shipment table with exports (a `mode` column tells them apart) but have their own pages, because the work is different.",
      },
      {
        type: "flow",
        stages: [
          { label: "Paid" },
          { label: "Courier order", hint: "Automatic" },
          { label: "AWB + label" },
          { label: "Customer told", hint: "Notification + email" },
          { label: "Courier collects", tone: "success" },
        ],
      },
      { type: "heading", text: "The booking page" },
      {
        type: "list",
        items: [
          "**GST paperwork** checks the sender: a company sender should have a tax invoice on file, an individual an Aadhaar. Over ₹50,000, an e-way bill PDF and number are required.",
          "**Courier** shows the courier the customer paid for, the order id, the AWB and the label. **Book with courier** retries a failed order; **Cancel** cancels the courier order but leaves the shipment open.",
          "**Allow auto-assign** is a deliberate opt-in on retry that lets the vendor choose the courier. Never tick it without the customer's agreement.",
          "**Pricing** shows freight charged and any cash-on-delivery amount. COD is collected by the courier from the receiver and remitted; the freight was already paid from the wallet.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "A failed courier order holds the money",
        text: "If the vendor refuses the order, the shipment stays paid, ops get a critical `COURIER_BOOKING_FAILED` notification, and nothing is refunded or cancelled automatically. Fix and retry, book by hand and record the AWB, or cancel and refund with an admin.",
      },
      { type: "heading", text: "Vendors" },
      {
        type: "list",
        items: [
          "**Shipmozo**: books and tracks. Its webhook moves domestic statuses.",
          "**SpeedoPost**: quotes (B2B freight only) and can book, but has never booked live and needs `SPEEDOPOST_CLIENT_CODE`. Watch the first one closely. Tracking is pull only: status does not move on its own.",
          "**Delipack**: quotes only (shown as \"Delhivery\" with a Delipack badge for staff). It is not bookable and never appears in the booking form.",
        ],
      },
    ],
  },
  {
    slug: "ops-status-and-tracking",
    title: "Statuses, emails and tracking",
    summary: "Who is emailed when a status changes, how carrier scans move status, and when shipments count as stuck.",
    category: "operations",
    order: 6,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/track" }],
    keywords: ["status", "milestone email", "carrier sync", "tracking", "stuck", "attention sweep", "track", "hawb", "scan", "customs hold", "on hold"],
    updated: "2026.11.21",
    related: ["ops-international-bookings", "ops-notifications"],
    blocks: [
      { type: "heading", text: "Who gets emailed" },
      {
        type: "table",
        head: ["Status", "Email", "Inbox notification"],
        rows: [
          ["Booked, Processing, In transit, Out for delivery, Delivered", "Yes", "Yes"],
          ["Documents pending, Customs hold, On hold, Cancelled", "No: a person must explain these", "Yes"],
        ],
      },
      {
        type: "list",
        items: [
          "The email goes to the sender email frozen on the shipment at booking.",
          "On a BA's booking for a client, the BA's **Client emails** setting decides: the client is emailed under the BA's company name, or the BA gets it instead. The status panel tells you which happened.",
          "Write a note when moving to a hold status: it is the only explanation the customer gets until you call.",
        ],
      },
      { type: "heading", text: "Carrier scans move status" },
      {
        type: "p",
        text: `Carrier tracking moves a shipment forward on its own (to In transit, Out for delivery, Delivered), never backwards and never out of a hold. It runs when someone opens the shipment page, on **Refresh**, and in an Inngest job every 4 hours (IST). The job checks each shipment ${SYNC_TIERS_TEXT}, and stops at day ${CARRIER_SYNC_JOB_MAX_AGE_DAYS}. Opening the page or Refresh still moves a shipment up to day ${CARRIER_SYNC_MAX_AGE_DAYS}; after that it is display-only and moved by hand. Shipments booked before 25 October 2026 never auto-move. Problem scans (exceptions, returns) never move status; they raise one ops alert per scan instead.`,
      },
      {
        type: "callout",
        tone: "info",
        text: "Never run the carrier sync from a local machine: local `.env` points at the production database, so it would email real customers.",
      },
      { type: "heading", text: "When a shipment counts as stuck" },
      {
        type: "table",
        head: ["Status", "Alert after"],
        rows: [
          ["Booked", "2 days"],
          ["Processing, Documents pending, Customs hold, Out for delivery", "3 days"],
          ["On hold", "5 days"],
          ["In transit", "12 days"],
        ],
      },
      {
        type: "p",
        text: "A daily attention sweep raises a `SHIPMENT_STUCK` notification at each threshold and again as the delay doubles, so a shipment that stays stuck escalates rather than repeating the same alert.",
      },
      { type: "heading", text: "Track page" },
      {
        type: "p",
        text: "[Track Shipment](app:/track) takes any ARN, HAWB, MAWB or carrier AWB from any customer and merges the door pickup and international legs into one timeline. Customers can only track their own ARNs, and see carrier errors replaced with neutral wording.",
      },
    ],
  },
  {
    slug: "ops-pay-on-arrival",
    title: "Pay on arrival (skip-payment accounts)",
    summary: "Collecting and recording payment for accounts that do not pay from a wallet.",
    category: "operations",
    order: 7,
    audiences: ["arena-ops"],
    keywords: ["skip payment", "pay on arrival", "deferred", "collection", "record payment", "write off", "payment pending", "collect at hub"],
    updated: "2026.11.21",
    related: ["ops-international-bookings", "ops-accounts"],
    blocks: [
      {
        type: "p",
        text: "An admin can turn on **skip payment** for an account. Its bookings then go straight to Booked with no wallet charge, marked **Payment pending**, and payment is collected when the parcel reaches the hub. Domestic bookings are always paid up front unless an admin turned this on.",
      },
      {
        type: "steps",
        items: [
          { title: "Spot it", body: "The booking page banner says **Pay on arrival**, and once the parcel is at the hub, that it is time to collect." },
          { title: "Collect", body: "Cash, UPI, bank transfer or cheque, at the hub or from the customer." },
          { title: "Record a payment", body: "In **Payment on arrival** on the booking page: amount, how they paid, when it arrived and a note (for example `Collected at the Dwarka hub by Imran`). Part payments are fine; each is its own row." },
        ],
      },
      {
        type: "list",
        items: [
          "Any staff member can record a payment. Only admins can **reverse** one (entered against the wrong booking) or **write off** a balance.",
          "Admins see every open balance under Wallets, **Collections**, with how long each has waited.",
          "An uncollected balance raises a `COLLECTION_OVERDUE` notification, escalating the longer it waits.",
        ],
      },
    ],
  },
  {
    slug: "ops-accounts",
    title: "Accounts and Business Associates",
    summary: "Finding a customer account, reading it, and what admins can change on it.",
    category: "operations",
    order: 8,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/accounts" },
      { scope: "arena", path: "/accounts/[id]" },
      { scope: "arena", path: "/business-associates" },
      { scope: "arena", path: "/business-associates/[id]" },
    ],
    keywords: ["accounts", "organisation", "org", "tenant", "markup", "skip payment", "business associate", "make associate", "revoke", "team", "members", "promote"],
    updated: "2026.11.21",
    related: ["ops-kyc-waivers", "ops-pay-on-arrival", "ops-clients"],
    blocks: [
      {
        type: "p",
        text: "[Accounts](app:/accounts) lists every customer organisation. [Business Associates](app:/business-associates) is the same list narrowed to BAs, with their skip-payment setting.",
      },
      { type: "heading", text: "An account's page" },
      {
        type: "list",
        items: [
          "Contact details, metadata (including the Clerk org id) and the team members.",
          "Stats and recent shipments; for a BA also recent clients, recent quotes and quote outcomes.",
          "**Business settings** (admins): markup percentage, skip payment and BA standing.",
          "**KYC waiver** (admins). See [KYC waivers](help:ops-kyc-waivers).",
        ],
      },
      { type: "heading", text: "Admin changes" },
      {
        type: "table",
        head: ["Change", "Effect"],
        rows: [
          ["Markup percentage", "Applied on top of carrier rates for everything the account books, domestic and international, from their next search. 0 to 100"],
          ["Skip payment", "Bookings bypass the wallet and are collected on arrival. Make sure billing is handled before enabling. See [Pay on arrival](help:ops-pay-on-arrival)"],
          ["Make business associate", "From the Accounts row menu, with a markup. They gain Clients, Quotes and Client emails"],
          ["Revoke BA status", "They lose the Clients area immediately. Their clients stay on file. Markup does not change by itself"],
        ],
      },
      {
        type: "callout",
        tone: "info",
        text: "BA standing is a security boundary and is always read from the database, never from Clerk metadata. Changing it here also updates the Clerk mirror used for the sidebar.",
      },
      {
        type: "p",
        text: "There is no application form in the customer app. A customer who wants BA status emails us, and an admin promotes them here.",
      },
    ],
  },
  {
    slug: "ops-clients",
    title: "Clients across all BAs",
    summary: "Every Business Associate's clients in one list, with their documents and waivers.",
    category: "operations",
    order: 9,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/clients" },
      { scope: "arena", path: "/clients/[id]" },
    ],
    keywords: ["clients", "ba clients", "client kyc", "client detail", "client waiver"],
    updated: "2026.11.21",
    related: ["ops-accounts", "ops-kyc-waivers", "ops-document-vault"],
    blocks: [
      {
        type: "p",
        text: "[Clients](app:/clients) shows every client of every BA, filterable by Business Associate. A client's page mirrors what the BA sees, plus vendor names on quote history and, for admins, the client's own **KYC waiver**.",
      },
      {
        type: "list",
        items: [
          "Company versus individual: the `companyKind` field is unreliable on clients created before 25 September 2026. A client counts as an individual only if marked so *and* its display name equals the person's name.",
          "A client's export details (IEC, AD code, LUT, duty) override the BA's own, field by field.",
          "Aadhaar numbers uploaded before 25 September 2026 were not stored encrypted, so Aramex bookings for those clients need the Aadhaar uploaded again.",
        ],
      },
    ],
  },
  {
    slug: "ops-document-vault",
    title: "Document Vault (all accounts)",
    summary: "Every KYC document across every account and client.",
    category: "operations",
    order: 10,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/document-vault" }],
    keywords: ["vault", "kyc", "documents", "pan", "aadhaar", "gst", "iec", "lut", "verify"],
    updated: "2026.11.21",
    related: ["ops-clients", "ops-kyc-waivers"],
    blocks: [
      {
        type: "p",
        text: "The [Document Vault](app:/document-vault) lists identity and export documents uploaded by every organisation and for every BA client. Search and filter to check what a customer has on file before chasing them.",
      },
      {
        type: "p",
        text: "Shipment documents (labels, invoices, customs papers) are not here; they are on each booking under Documents.",
      },
    ],
  },
  {
    slug: "ops-rates",
    title: "Rates as staff see them",
    summary: "Raw vendors, Aramex contracts and how prices are branded for customers.",
    category: "operations",
    order: 11,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/rates" },
      { scope: "arena", path: "/domestic-rates" },
    ],
    keywords: ["rates", "calculator", "vendor", "branding", "white label", "aramex account", "delipack badge", "shipmozo arena", "skartedge", "markup"],
    updated: "2026.11.21",
    related: ["ops-quotes", "ops-integrations"],
    blocks: [
      {
        type: "p",
        text: "[International Rates](app:/rates) and [Domestic Rates](app:/domestic-rates) are the customer calculators, but staff see what customers do not: the real vendor on each card, and every Aramex contract as its own row with an account badge. Staff can also generate quotes from any card.",
      },
      { type: "heading", text: "What customers see instead" },
      {
        type: "table",
        head: ["Staff see", "Customers see"],
        rows: [
          ["A Shipmozo product name", "\"Arena\" in place of Shipmozo (we hold written white-label permission)"],
          ["sKartedge", "sKartedge (no permission yet, a known leak the owner accepted)"],
          ["Two Aramex rows, one per contract", "One row named Aramex, the cheaper. The other price is never sent to the browser"],
          ["Delipack's quote", "\"Delhivery\""],
          ["Vendor errors", "Neutral wording"],
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Never name a vendor to a customer",
        text: "Customers who learn the vendor can go to them directly. Do not paste a vendor name, our buying price or an internal label into an email, a note or a client-visible document. Branding rules are in `carrierBranding.md`.",
      },
      {
        type: "p",
        text: "Customer prices carry the account's markup. Rates are fetched live on every search; the booking form re-prices before payment.",
      },
    ],
  },
  {
    slug: "ops-quotes",
    title: "Quotes and rate cards",
    summary: "Every shipment quote across accounts, and the rate-card history.",
    category: "operations",
    order: 12,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/quotes" }],
    keywords: ["quotes", "shipment quotes", "rate cards", "quote expiry", "ARQ"],
    updated: "2026.11.21",
    related: ["ops-rate-cards", "ops-rates"],
    blocks: [
      {
        type: "p",
        text: "[Quotes](app:/quotes) has two tabs. **Shipment quotes** lists every quote any BA (or Arena) has saved, with the sourcing vendor shown to staff. **Rate cards** (admins only) lists every rate-card workbook ever generated, numbered `ARQ-YYYY-NNNN`.",
      },
      {
        type: "list",
        items: [
          "Quotes are valid for 7 days. A daily job expires drafts past that date, and sent quotes three days after it.",
          "No screen marks a quote Accepted or Cancelled, so those filters are empty and a client's \"win rate\" reads 0%.",
          "A `QUOTE_EXPIRING` notification flags a sent quote about to lapse.",
        ],
      },
    ],
  },
  {
    slug: "ops-rate-sweeps",
    title: "Rate sweeps",
    summary: "The stored matrix of international prices: how it is built and how to read it.",
    category: "operations",
    order: 13,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/rate-sweeps" },
      { scope: "arena", path: "/rate-sweeps/[id]" },
    ],
    keywords: ["sweep", "rate matrix", "snapshot", "carrier comparison", "unmapped services", "vendor health", "force finalise", "indicative"],
    updated: "2026.11.21",
    related: ["ops-rate-cards", "ops-integrations"],
    blocks: [
      {
        type: "p",
        text: "Vendor APIs price one shipment per call. A rate sweep calls every international vendor for every country and weight slab and stores the answers, so a multi-country quotation is a database query.",
      },
      {
        type: "list",
        items: [
          "Runs automatically every 5 days at 01:00 IST. Admins can **Start the sweep** by hand.",
          "Every vendor in the rate registry is swept, so a new adapter joins on its first night. sKart is paced at 8 calls a minute (their limit is 10), everyone else at 30.",
          "Each country is priced to one postcode (the capital's). Shipmozo is priced at a fixed declared value, so duty-driven charges are only valid near it.",
          "Every service a vendor returns is stored, not only the cheapest, with a normalised carrier.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        title: "Indicative only",
        text: "Sweep prices feed quotations and rate cards, never bookings. Bookings always price live.",
      },
      { type: "heading", text: "Reading a sweep" },
      {
        type: "list",
        items: [
          "**Recent runs** shows each run's outcome: completed, partial or failed, lanes expected against reported.",
          "**Vendor health** shows each vendor's failure rate. A rising rate usually means credentials or a rate limit.",
          "**Same carrier, every vendor** compares one carrier (say FedEx) as resold by each vendor.",
          "**Unmapped services** are product names the carrier rules could not place. They need a rule in `lib/rateSweep/carrier.ts`, then the backfill script.",
          "**Force finalise** (admins) closes a run that stalled.",
        ],
      },
    ],
  },
  {
    slug: "ops-notices",
    title: "Notices and messages to tenants",
    summary: "Dashboard banners for everyone, or a message to chosen organisations' inboxes.",
    category: "operations",
    order: 14,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/notices" }],
    keywords: ["notice", "banner", "announcement", "message", "inbox", "tell tenants", "holiday", "delay"],
    updated: "2026.11.21",
    related: ["ops-notifications"],
    blocks: [
      {
        type: "table",
        head: ["Mode", "Who sees it", "Use for"],
        rows: [
          ["Dashboard banner", "Everyone, or only BAs, or only standard accounts, across the top of the app", "Holidays, transit delays, rate changes"],
          ["Inbox message", "Chosen organisations, kept in their notification history", "Anything specific to a few customers"],
        ],
      },
      {
        type: "list",
        items: [
          "Banners have an importance, a priority, an optional link with its own label, and either run until switched off or for a date window.",
          "A banner saved switched off reaches nobody until you turn it on. **Duplicate** makes a switched-off copy.",
          "Say what changed and what the customer should do about it. The preview shows exactly what they will see.",
        ],
      },
    ],
  },
  {
    slug: "ops-notifications",
    title: "Ops notifications",
    summary: "What lands in the Arena inbox and what each kind asks of you.",
    category: "operations",
    order: 15,
    audiences: ["arena-ops"],
    routes: [{ scope: "arena", path: "/notifications" }],
    keywords: ["bell", "inbox", "alerts", "critical", "courier booking failed", "stuck", "payment failed", "collection overdue", "quote expiring", "sweep degraded"],
    updated: "2026.11.21",
    related: ["ops-status-and-tracking", "ops-carrier-auto-booking", "ops-pay-on-arrival"],
    blocks: [
      {
        type: "table",
        head: ["Kind", "Means", "Do"],
        rows: [
          ["Booking placed", "A tenant just booked", "Pick it up from Awaiting ops"],
          ["Courier booking failed", "A paid booking the carrier, courier or pickup vendor refused. Money held", "Fix and retry, or book by hand. Critical"],
          ["Shipment stuck", "In one status past its tolerance, or a carrier problem scan", "Find out why and update the customer"],
          ["Collection overdue", "A pay-on-arrival balance nobody has collected", "Collect, or ask an admin to write it off"],
          ["Payment failed (admins)", "A top-up the bank rejected", "Check with the customer"],
          ["Quote expiring", "A sent quote about to lapse", "Nudge the BA or client"],
          ["Rate sweep degraded", "A vendor failed too much of the matrix", "Check its credentials and the vendor health table"],
        ],
      },
      {
        type: "p",
        text: "Read state is per person, so one colleague reading a notification does not clear it for everyone. Successful top-ups are deliberately not notified.",
      },
    ],
  },
  {
    slug: "ops-integrations",
    title: "Integrations status",
    summary: "Which vendor does what today: rates, booking and tracking, and their known quirks.",
    category: "operations",
    order: 16,
    audiences: ["arena-ops"],
    keywords: ["vendors", "integrations", "shipmozo", "skart", "aramex", "shipglobal", "speedopost", "delipack", "logibuddy", "status", "live", "halted"],
    updated: "2026.11.21",
    related: ["ops-carrier-auto-booking", "ops-domestic-bookings", "ops-configuration"],
    blocks: [
      {
        type: "table",
        head: ["Vendor", "Rates", "Booking", "Tracking", "Notes"],
        rows: [
          ["Shipmozo (international)", "Live", "Auto, behind `INTL_AUTO_BOOK_ENABLED`", "Live", "Does not de-duplicate on our order id"],
          ["Shipmozo (domestic)", "Live", "Auto at payment, and door pickups", "Webhook + pull", "Customers see Shipmozo as \"Arena\""],
          ["sKart", "Live", "Auto, behind `INTL_AUTO_BOOK_ENABLED`", "Live", "10 calls a minute limit. sKartedge name shown to customers"],
          ["Aramex direct", "Live, every contract", "Auto, on the contract that quoted", "Live", "Never FRDM or COD. A failing contract is suspended for 30 minutes after 3 auth failures"],
          ["ShipGlobal", "Live", "Not built (halted pending their tech team)", "Not built", "Paid ShipGlobal services are booked by hand"],
          ["SpeedoPost", "Live, B2B freight only", "Built, never booked live", "Pull only", "Needs `SPEEDOPOST_CLIENT_CODE`. Not used for door pickups"],
          ["Delipack (LogiBuddy)", "Built, token rejected (401)", "No API for it", "Not built", "Shown as \"Delhivery\". Never bookable until they provide a create-docket API"],
        ],
      },
      {
        type: "callout",
        tone: "info",
        text: "Export auto-booking went live without a test booking on each vendor. If the first exports on a vendor fail, look at the vendor error before suspecting the wiring.",
      },
    ],
  },
  {
    slug: "ops-legacy-air-rates",
    title: "Legacy domestic air rates",
    summary: "The old airport-to-airport air freight calculator and its rate-card uploads.",
    category: "operations",
    order: 18,
    audiences: ["arena-ops"],
    routes: [
      { scope: "arena", path: "/domestic-rates-old" },
      { scope: "arena", path: "/domestic-rates-old/upload" },
      { scope: "arena", path: "/domestic-rates-old/debug" },
    ],
    keywords: ["air freight", "airport", "eds", "indigo cargo", "air india cargo", "rate card upload", "legacy", "old"],
    updated: "2026.11.21",
    related: ["ops-rates"],
    blocks: [
      {
        type: "p",
        text: "Before courier rates, domestic pricing was airport to airport air freight from uploaded rate cards (EDS, IndiGo CarGo, Air India Cargo). The calculator, the upload screen and a debug view still exist under `/arena-dashboard/domestic-rates-old` but are not in the sidebar, and customers never see them.",
      },
      {
        type: "p",
        text: "The Overview's **Active Rate Cards** and **Rate cards staged** refer to these uploads. Use the current [Domestic Rates](app:/domestic-rates) for courier pricing.",
      },
    ],
  },
  {
    slug: "ops-help-maintenance",
    title: "Keeping these guides current",
    summary: "How the help centre is written, and the rule that keeps it in step with the app.",
    category: "operations",
    order: 19,
    audiences: ["arena-ops"],
    keywords: ["docs", "documentation", "help", "changelog", "whats new", "update guides", "audience"],
    updated: "2026.11.21",
    related: ["using-help"],
    blocks: [
      {
        type: "p",
        text: "Every guide is TypeScript in `lib/help/content/`, with no database behind it. Each article and each block is tagged with who may read it: `standard`, `ba`, `arena-ops` or `arena-admin`. Filtering happens on the server, so a customer's browser never receives staff material.",
      },
      {
        type: "steps",
        items: [
          { title: "Change the guide with the feature", body: "Same commit. Set the article's `updated` to today's IST date." },
          { title: "Add a What's new entry", body: "In `lib/help/content/changelog.ts`, tagged for whoever it matters to." },
          { title: "Run npm run test:server", body: "It fails on a page with no guide, a broken link, an em dash, or a customer-visible vendor name." },
        ],
      },
      {
        type: "p",
        text: "Staff read every customer guide, with each customer variant labelled, so you can see exactly what a BA or a standard customer is told.",
      },
    ],
  },
];
