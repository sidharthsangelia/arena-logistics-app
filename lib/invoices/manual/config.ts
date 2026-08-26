/**
 * lib/invoices/manual/config.ts
 *
 * Pure, shared configuration for manual invoicing: series prefixes, payment
 * terms, currencies, statuses, the zod schemas every write validates against,
 * and the DTOs the UI renders.
 *
 * PURE MODULE. Imported by server actions and by client components, so no
 * "server-only", no prisma client, no env, no secrets. The DTOs live here
 * rather than beside the queries for exactly that reason: a client component
 * that needs the shape must never have to import the query module to get it.
 *
 * Tax policy is NOT here. Rates are per charge line and come from the catalog;
 * the issuer identity is shared with the booking invoices and read through
 * getInvoiceIssuer() in ../tax/config.ts. There is one Arena and one GSTIN, and
 * a second copy of those details would eventually disagree with the first.
 */

import { z } from "zod";

import {
  BillingPartyKind,
  ChargeApplicability,
  ManualInvoiceDocType,
  ManualInvoiceStatus,
  ShipmentMode,
  TaxMode,
} from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------
//
// There is no manual series. A manually raised invoice takes its number from
// the same counter as a booking invoice and prints the same ARN prefix, so the
// two are consecutive entries in one book.
//
// It was its own ARM series until 2026-08-24, on the reasoning that GST wants
// each series internally consecutive rather than one series per business. True,
// but it also meant ARN/26-27/00001 and ARM/26-27/00001 both existed and
// "invoice one" named two documents. One book is worth more than two auditable
// halves. See lib/invoices/tax/numbering.ts for the whole rule.
//
// ARM/26-27/00001 was issued before the change and keeps its number: an issued
// tax invoice is never renumbered. Its old MANUAL_TAX_INVOICE counter row is
// left in the table as the record of it.

// Nothing is exported from here for it. The issue path calls seriesFor() in
// lib/invoices/tax/numbering.ts directly, which is "server-only" and cannot be
// re-exported through this module: this one is imported by client components
// and pulling the numbering module in would drag the server bundle with it.

// ---------------------------------------------------------------------------
// Payment terms
// ---------------------------------------------------------------------------
//
// A closed list rather than a free number, because the due date is derived from
// it and a typo in "days" is a debt chased on the wrong day. CUSTOM exists for
// the deal that genuinely does not fit, and leaves the due date to be picked by
// hand.

// The labels are the words Arena's own paperwork uses for credit terms, so the
// printed line reads the way the customer's purchase order does. The VALUES are
// never renamed: they are stored on the row and on issued snapshots, and a
// renamed value is an invoice that suddenly prints no term at all.
export const PAYMENT_TERMS = [
  { value: "DUE_ON_RECEIPT", label: "Immediate due", days: 0 },
  { value: "NET_7", label: "7 days", days: 7 },
  { value: "NET_15", label: "15 days", days: 15 },
  { value: "NET_30", label: "30 days", days: 30 },
  { value: "NET_45", label: "45 days", days: 45 },
  { value: "NET_60", label: "60 days", days: 60 },
  { value: "CUSTOM", label: "Custom date", days: null },
] as const;

export type PaymentTerm = (typeof PAYMENT_TERMS)[number]["value"];

export const DEFAULT_PAYMENT_TERM: PaymentTerm = "NET_30";

export function paymentTermLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PAYMENT_TERMS.find((t) => t.value === value)?.label ?? null;
}

/**
 * Due date implied by a term. Returns null for CUSTOM and for anything
 * unrecognised, which the form reads as "the admin picks it".
 */
export function dueDateFor(
  term: string | null | undefined,
  issueDate: Date,
): Date | null {
  const match = PAYMENT_TERMS.find((t) => t.value === term);
  if (!match || match.days === null) return null;
  const due = new Date(issueDate);
  due.setDate(due.getDate() + match.days);
  return due;
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------
//
// The money engine is currency-agnostic and works in minor units, so adding one
// here is all it takes. What is NOT built is stating the GST in INR at the
// notified rate, which law wants on a foreign-currency invoice: there is no FX
// field and no conversion. See manualInvoicing.md §7 before selling this as
// filing-ready for anything but INR.

export const INVOICE_CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian rupee" },
  { code: "USD", symbol: "$", label: "US dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound sterling" },
  { code: "AED", symbol: "AED", label: "UAE dirham" },
  { code: "SGD", symbol: "S$", label: "Singapore dollar" },
] as const;

export const DEFAULT_CURRENCY = "INR";

export function currencySymbol(code: string | null | undefined): string {
  return (
    INVOICE_CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? "₹"
  );
}

/** Money for display. Grouping follows the currency, not the browser locale. */
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * A placeholder number for previewing a draft. Deliberately not a plausible
 * serial: a preview that looks like an issued invoice is a preview somebody
 * will eventually send to a customer.
 *
 * Lives here rather than beside the builder because build.ts is "server-only"
 * and the sample renderer, which is not a server, needs the same string.
 */
export const DRAFT_NUMBER_PLACEHOLDER = "DRAFT (not yet issued)";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * OVERDUE is not a stored status. It is derived here, so one function decides
 * it for the list, the badge and the summary and they can never disagree. Same
 * shape as deriveInvoiceStatusView in ../config.ts.
 */
export type ManualInvoiceViewStatus =
  | "DRAFT"
  | "ISSUED"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export function deriveManualInvoiceView(
  status: ManualInvoiceStatus,
  dueDate: Date | string | null | undefined,
): ManualInvoiceViewStatus {
  if (status === ManualInvoiceStatus.DRAFT) return "DRAFT";
  if (status === ManualInvoiceStatus.PAID) return "PAID";
  if (status === ManualInvoiceStatus.CANCELLED) return "CANCELLED";
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return "OVERDUE";
  return "ISSUED";
}

export const MANUAL_STATUS_FILTERS = [
  "ALL",
  "DRAFT",
  "ISSUED",
  "OVERDUE",
  "PAID",
  "CANCELLED",
] as const;
export type ManualStatusFilter = (typeof MANUAL_STATUS_FILTERS)[number];

export function coerceManualStatusFilter(value: unknown): ManualStatusFilter {
  return (MANUAL_STATUS_FILTERS as readonly string[]).includes(value as string)
    ? (value as ManualStatusFilter)
    : "ALL";
}

/**
 * Badge tone per status. Colour carries meaning here and nowhere else on the
 * row, so it stays a functional cue rather than decoration.
 */
export const MANUAL_STATUS_TONE: Record<
  ManualInvoiceViewStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  ISSUED: {
    label: "Issued",
    className:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  OVERDUE: {
    label: "Overdue",
    className:
      "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  PAID: {
    label: "Paid",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
};

// ---------------------------------------------------------------------------
// CSB category
// ---------------------------------------------------------------------------
//
// A label for filtering and for printing in the shipment block. It changes
// nothing about the money. If the paperwork later needs shipping bill numbers,
// IEC or AD code on the face of the invoice, those live on Org and Client
// already and lib/booking/exportProfile.ts knows how to choose between them.

export const CSB_CATEGORIES = [
  { value: "CSB_5", label: "CSB-5" },
  { value: "CSB_4", label: "CSB-4" },
  { value: "COMMERCIAL", label: "Commercial" },
] as const;

export function csbLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CSB_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
//
// A suggestion list, NOT a closed set. The field still accepts anything typed,
// because a forwarding business invents a service description roughly monthly
// and a dropdown that cannot say what happened is a dropdown that gets worked
// around with "Other".
//
// It exists because the alternative is a free text box where the same service
// is spelled "Air freight", "air-freight" and "AIR FRT" across three invoices
// to the same customer, which reads as carelessness on the document and cannot
// be grouped anywhere afterwards.

export interface ServiceOption {
  label: string;
  /** Null means it fits either kind of invoice. */
  mode: ShipmentMode | null;
}

export const SERVICE_TYPES: readonly ServiceOption[] = [
  { label: "Air freight", mode: null },
  { label: "Air express", mode: null },
  { label: "Door to door", mode: null },
  { label: "Courier", mode: null },
  { label: "Sea freight LCL", mode: ShipmentMode.INTERNATIONAL },
  { label: "Sea freight FCL", mode: ShipmentMode.INTERNATIONAL },
  { label: "Customs clearance", mode: ShipmentMode.INTERNATIONAL },
  { label: "Export handling", mode: ShipmentMode.INTERNATIONAL },
  { label: "Import handling", mode: ShipmentMode.INTERNATIONAL },
  { label: "Surface, road", mode: null },
  { label: "Rail freight", mode: ShipmentMode.DOMESTIC },
  { label: "Part truckload", mode: ShipmentMode.DOMESTIC },
  { label: "Full truckload", mode: ShipmentMode.DOMESTIC },
  { label: "First mile pickup", mode: null },
  { label: "Last mile delivery", mode: null },
  { label: "Warehousing and storage", mode: null },
  { label: "Packing", mode: null },
  { label: "Documentation", mode: null },
];

export function servicesFor(mode: ShipmentMode): ServiceOption[] {
  return SERVICE_TYPES.filter((s) => !s.mode || s.mode === mode);
}

// ---------------------------------------------------------------------------
// Forwarder and product
// ---------------------------------------------------------------------------
//
// The two fields that between them say who carried it and under what service.
// They are the pair a customer recognises: "DHL, Express Worldwide" means
// something to them in a way "Air freight" does not.
//
// ── WHY THESE ARE NOT CLOSED LISTS ──────────────────────────────────────────
// Same rule as SERVICE_TYPES above. Arena moves cargo through whichever
// forwarder priced the lane that week, and every carrier renames its products
// on its own schedule. A dropdown that cannot say what happened is a dropdown
// people work around, and "Other" in a column is a column that has stopped
// meaning anything. So: the list is a suggestion, and anything typed is saved
// as written.
//
// ── AND WHY THE VENDOR NAMES ARE FINE HERE ──────────────────────────────────
// carrierBranding.md hides vendor names behind Arena's own branding, but that
// rule is about rates SOURCED THROUGH the platform, where the vendor is an
// implementation detail the customer did not choose. A manual invoice is
// Arena's record of an off-platform move the customer usually arranged the
// shape of themselves, and "who flew it" is a thing they asked for. Same
// reasoning as airlineName on the model.

export const FORWARDERS: readonly string[] = [
  "DHL",
  "FedEx",
  "UPS",
  "Aramex",
  "TNT",
  "DPD",
  "Blue Dart",
  "DTDC",
  "Delhivery",
  "Ecom Express",
  "India Post",
  "SkyNet",
];

/**
 * Products a given forwarder sells, keyed by the forwarder's name lowercased.
 *
 * A SEED, not a catalog. It is what a fresh install offers before anybody has
 * typed anything; the moment a product is typed against a forwarder it comes
 * back from the invoice history under that forwarder next time, without being
 * registered anywhere. See listForwarderProducts.
 *
 * Scoped by forwarder because the names are the carrier's own. "Saver" is a UPS
 * word and "Express Worldwide" is a DHL one, and a flat list would offer every
 * carrier's vocabulary under every carrier, which is how an invoice ends up
 * saying FedEx sold a DHL product.
 */
const FORWARDER_PRODUCTS: Record<string, readonly string[]> = {
  dhl: [
    "Express Worldwide",
    "Express 12:00",
    "Economy Select",
    "Medical Express",
  ],
  fedex: [
    "International Priority",
    "International Economy",
    "International First",
    "International Connect Plus",
  ],
  ups: [
    "UPS Saver",
    "UPS Express",
    "UPS Expedited",
    "UPS Worldwide Economy",
  ],
  aramex: ["Priority Express", "Priority Document", "Economy Express"],
  tnt: ["Express", "Economy Express"],
  dpd: ["Classic", "Express"],
  "blue dart": ["Domestic Priority", "Dart Apex", "Dart Surfaceline"],
  dtdc: ["Express", "Plus", "Surface"],
  delhivery: ["Express Parcel", "Surface", "Heavy"],
  "ecom express": ["Express", "Ground"],
  "india post": ["Speed Post", "Registered Post", "Express Parcel"],
  skynet: ["Worldwide Express", "Economy"],
};

/**
 * Generic product names, offered under any forwarder and under none.
 *
 * The fallback matters: a forwarder nobody has invoiced before has no seeded
 * products and no history, and an empty picker under a filled-in forwarder
 * reads as broken rather than as new.
 */
const GENERIC_PRODUCTS: readonly string[] = [
  "Express",
  "Economy",
  "Priority",
  "Standard",
  "Deferred",
  "Cargo",
];

/** Seeded products for a forwarder, then the generic ones, without repeats. */
export function productsFor(forwarder: string | null | undefined): string[] {
  const key = forwarder?.trim().toLowerCase() ?? "";
  const seeded = FORWARDER_PRODUCTS[key] ?? [];
  const seen = new Set(seeded.map((p) => p.toLowerCase()));
  return [
    ...seeded,
    ...GENERIC_PRODUCTS.filter((p) => !seen.has(p.toLowerCase())),
  ];
}

/**
 * The key a forwarder's products are grouped under, on both sides.
 *
 * One function rather than two `.toLowerCase()` calls, because the history read
 * out of the database and the seed list above have to agree on it. If they
 * drift, products typed against "UPS" stop coming back for "ups " and the
 * feature quietly does nothing.
 */
export function forwarderKey(forwarder: string | null | undefined): string {
  return forwarder?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

// ---------------------------------------------------------------------------
// Parcel and ship mode
// ---------------------------------------------------------------------------
//
// Suggestion lists on the same terms as everything above.
//
// SHIP_MODES is about how the goods travelled. It is NOT the invoice's own
// domestic/international mode: a domestic consignment can fly and an
// international one can sail, and one field cannot say both.

export const PARCEL_TYPES: readonly string[] = [
  "Documents",
  "Non-documents",
  "Sample",
  "Commercial",
  "Personal effects",
  "Dangerous goods",
];

export const SHIP_MODES: readonly string[] = [
  "Air",
  "Sea",
  "Surface",
  "Rail",
  "Multimodal",
];

// ---------------------------------------------------------------------------
// Tax mode
// ---------------------------------------------------------------------------

export const TAX_MODE_COPY: Record<TaxMode, { label: string; help: string }> = {
  [TaxMode.EXCLUSIVE]: {
    label: "Add GST on top",
    help: "Amounts you type are before tax. GST is added and the total grows.",
  },
  [TaxMode.INCLUSIVE]: {
    label: "GST already included",
    help: "Amounts you type already contain GST. The total is what you typed.",
  },
};

// ---------------------------------------------------------------------------
// Pagination and sorting
// ---------------------------------------------------------------------------

export const MANUAL_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;
export const DEFAULT_MANUAL_PAGE_SIZE = 20;

export function coerceManualPage(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : 1;
}

export function coerceManualPageSize(value: number | undefined): number {
  return (MANUAL_PAGE_SIZE_OPTIONS as readonly number[]).includes(
    value as number,
  )
    ? (value as number)
    : DEFAULT_MANUAL_PAGE_SIZE;
}

export type ManualSortField =
  | "issueDate"
  | "dueDate"
  | "total"
  | "invoiceNumber"
  | "createdAt";

export const MANUAL_SORT_FIELDS: readonly ManualSortField[] = [
  "issueDate",
  "dueDate",
  "total",
  "invoiceNumber",
  "createdAt",
];

export function coerceManualSortField(value: unknown): ManualSortField {
  return MANUAL_SORT_FIELDS.includes(value as ManualSortField)
    ? (value as ManualSortField)
    : "createdAt";
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface BillingPartyOption {
  id: string;
  kind: BillingPartyKind;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
}

/**
 * How a party is described in a picker row.
 *
 * A business is identified by its GSTIN, so its absence is worth saying:
 * "unregistered" is a real fact about a company and it changes what the invoice
 * prints. A person has no GSTIN to be missing, so saying so would be reporting
 * the absence of something that was never expected. They get the contact detail
 * that actually tells two people with the same name apart.
 */
export function partySubtitle(party: {
  kind?: BillingPartyKind;
  gstin: string | null;
  city: string | null;
  state: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const place = [party.city, party.state].filter(Boolean).join(", ");

  if (party.kind === BillingPartyKind.INDIVIDUAL) {
    return (
      [place, party.phone, party.email].filter(Boolean).join("  ·  ") ||
      "Individual"
    );
  }
  return (
    [party.gstin, place].filter(Boolean).join("  ·  ") || "No GSTIN on file"
  );
}

/**
 * Where a candidate customer came from.
 *
 * Most people Arena bills are already in the database: they signed up (an Org)
 * or a business associate booked for them (a Client). Retyping their name,
 * GSTIN and address into a fresh BillingParty would be slower AND would create
 * a second, drifting copy of a company already on file. So the picker searches
 * all three and only offers "create new" when none of them match.
 */
export type CustomerSource = "PARTY" | "ORG" | "CLIENT";

export interface CustomerSearchResult {
  source: CustomerSource;
  /** Id within the source table, NOT a BillingParty id unless source is PARTY. */
  id: string;
  /** Orgs and clients are always companies; only the billing list has people. */
  kind: BillingPartyKind;
  legalName: string;
  gstin: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  /** For a CLIENT: the business associate whose client it is. Context, not billing. */
  ownerName: string | null;
  /**
   * True when an ORG or CLIENT has already been adopted into a BillingParty, so
   * the picker can say "already on your customer list" instead of offering the
   * same company twice under two headings.
   */
  alreadyLinked: boolean;
}

export interface BillingPartyDetail extends BillingPartyOption {
  customerCode: string | null;
  pan: string | null;
  cin: string | null;
  contactName: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  clientId: string | null;
  defaults: BillingPartyDefaults | null;
}

/**
 * What a party remembers from the last invoice raised to it. Every field is a
 * convenience default the form may override, and nothing here is ever printed
 * straight: a default seeds a field, and the field is what gets snapshotted.
 */
export interface BillingPartyDefaults {
  currency?: string;
  taxMode?: TaxMode;
  paymentTerms?: string;
  mode?: ShipmentMode;
  csbCategory?: string | null;
  /** Charge type codes last used, most recent first. Seeds the picker. */
  chargeTypeCodes?: string[];
}

// ---------------------------------------------------------------------------
// The customer list
// ---------------------------------------------------------------------------
//
// Until the customers page existed, a BillingParty could only be reached
// through the invoice form's picker: created in a dialog, never edited again,
// and never listed anywhere. That made a wrong GSTIN unfixable without raising
// an invoice to get at the form, and made a company entered twice under two
// spellings impossible to notice.
//
// These are the shapes that page renders. Money and counts are computed per
// page rather than stored, because a party has no balance of its own: what it
// owes is the sum of the invoices raised to it, and a cached copy of that would
// be wrong the first time one was marked paid.

/**
 * How a party's own record compares with the org or client it was adopted from.
 *
 * A party is a COPY, taken once (see adoptCustomerAction), and that is
 * deliberate: a tax invoice states what was true when it was issued, and a
 * customer correcting their address next month must not silently rewrite it.
 * The cost of that choice is drift, and drift you cannot see is drift that ends
 * up on a document. So the difference is surfaced and left for a person to
 * accept, rather than either hidden or applied behind their back.
 */
export interface BillingPartyDriftField {
  /** Field on the party, so the refresh writes back to the right column. */
  field: "legalName" | "gstin" | "email" | "phone" | "contactName" | "addressLine1" | "city" | "state" | "postalCode";
  label: string;
  /** What the party record says today. This is what an invoice would print. */
  ours: string | null;
  /**
   * What the linked org or client says today. Never null: a value the source
   * has never had is not drift, it is an answer nobody has given yet, and
   * reporting it would fill the notice with rows offering to erase good data.
   */
  theirs: string;
}

/**
 * Two values differ in a way worth reporting.
 *
 * Case and inner whitespace are noise: "PVT LTD" and "Pvt  Ltd" are the same
 * company, and offering to rewrite one into the other would train people to
 * ignore the notice. A blank on THEIR side is never drift — a value the source
 * has not been given is not a correction, and treating it as one would offer to
 * erase a good address because the org record has none.
 */
export function partyValueDiffers(
  ours: string | null,
  theirs: string | null,
): boolean {
  const norm = (v: string | null) => (v ?? "").trim().replace(/\s+/g, " ");
  const b = norm(theirs);
  if (b === "") return false;
  return norm(ours).toLowerCase() !== b.toLowerCase();
}

/**
 * The fields compared between a party and the account it was adopted from, in
 * the order the notice lists them: identity first, then how to reach them, then
 * where they are.
 */
export const BILLING_PARTY_DRIFT_FIELDS: ReadonlyArray<
  readonly [BillingPartyDriftField["field"], string]
> = [
  ["legalName", "Name"],
  ["gstin", "GSTIN"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["contactName", "Contact"],
  ["addressLine1", "Address"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal code"],
];

export function driftBetween(
  ours: Partial<Record<BillingPartyDriftField["field"], string | null>>,
  theirs: Partial<Record<BillingPartyDriftField["field"], string | null>>,
): BillingPartyDriftField[] {
  return BILLING_PARTY_DRIFT_FIELDS.flatMap(([field, label]) => {
    const mine = ours[field] ?? null;
    const yours = theirs[field] ?? null;
    // The null check is redundant with partyValueDiffers, which already treats
    // a blank source value as "not drift". It is here so the narrowing is
    // visible to the type rather than only true in practice.
    if (yours === null || !partyValueDiffers(mine, yours)) return [];
    return [{ field, label, ours: mine, theirs: yours }];
  });
}

export interface BillingPartyLink {
  source: Exclude<CustomerSource, "PARTY">;
  id: string;
  name: string;
  /** For a CLIENT: the business associate whose client it is. */
  ownerName: string | null;
  /** Whether the source record still exists. A deleted one keeps the history. */
  present: boolean;
  drift: BillingPartyDriftField[];
}

export interface BillingPartyRow {
  id: string;
  kind: BillingPartyKind;
  legalName: string;
  tradeName: string | null;
  customerCode: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;

  /** Linked account, if this party was adopted from one. Context on the row. */
  linkKind: CustomerSource | null;
  linkName: string | null;

  invoiceCount: number;
  draftCount: number;
  /** Issued plus paid plus cancelled: everything that took a serial. */
  issuedCount: number;

  /**
   * Totals within this party's own dominant currency. A customer billed in both
   * INR and USD reports the larger set and says so, rather than adding them.
   */
  currency: string;
  mixedCurrency: boolean;
  billedAmount: number;
  outstandingAmount: number;
  overdueCount: number;

  lastInvoicedAt: string | null;
  createdAt: string;
}

export interface BillingPartyListSummary {
  /** Every party on file, ignoring the filters below the tiles. */
  total: number;
  billed: number;
  neverBilled: number;
  linked: number;
}

export interface BillingPartyPage {
  rows: BillingPartyRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
  summary: BillingPartyListSummary;
}

/**
 * Sortable columns.
 *
 * Deliberately no "amount billed" and no "last invoiced". Both are summed or
 * maxed from a customer's invoices at request time rather than held in a
 * column, so the database cannot order by either. Offering them as sorts would
 * mean ranking one page of results against itself and calling it an order.
 */
export type BillingPartySortField = "legalName" | "createdAt" | "invoiceCount";

export const BILLING_PARTY_SORT_FIELDS: readonly BillingPartySortField[] = [
  "legalName",
  "createdAt",
  "invoiceCount",
];

export function coerceBillingPartySortField(
  value: unknown,
): BillingPartySortField {
  return BILLING_PARTY_SORT_FIELDS.includes(value as BillingPartySortField)
    ? (value as BillingPartySortField)
    : "legalName";
}

export const BILLING_PARTY_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;
export const DEFAULT_BILLING_PARTY_PAGE_SIZE = 20;

export function coerceBillingPartyPageSize(value: number | undefined): number {
  return (BILLING_PARTY_PAGE_SIZE_OPTIONS as readonly number[]).includes(
    value as number,
  )
    ? (value as number)
    : DEFAULT_BILLING_PARTY_PAGE_SIZE;
}

/**
 * The one filter the list needs that a search box cannot express.
 *
 * BILLED and NEVER_BILLED are the pair that matters: a party with no invoice is
 * either a customer who has not been billed yet or a duplicate somebody created
 * by mistake, and both are only findable by asking for them.
 */
export const BILLING_PARTY_FILTERS = [
  "ALL",
  "BILLED",
  "NEVER_BILLED",
  "OWES",
  "LINKED",
  "UNLINKED",
] as const;
export type BillingPartyFilter = (typeof BILLING_PARTY_FILTERS)[number];

export function coerceBillingPartyFilter(value: unknown): BillingPartyFilter {
  return (BILLING_PARTY_FILTERS as readonly string[]).includes(value as string)
    ? (value as BillingPartyFilter)
    : "ALL";
}

export const BILLING_PARTY_FILTER_LABEL: Record<BillingPartyFilter, string> = {
  ALL: "All",
  BILLED: "Invoiced",
  NEVER_BILLED: "Never invoiced",
  OWES: "Owes money",
  LINKED: "Has an account",
  UNLINKED: "Off platform",
};

export interface BillingPartyListParams {
  page?: number;
  pageSize?: number;
  sortField?: BillingPartySortField;
  sortDir?: "asc" | "desc";
  search?: string;
  kind?: BillingPartyKind | null;
  filter?: BillingPartyFilter;
}

/**
 * One party's billing history, in totals.
 *
 * Manual invoices only. Booking invoices belong to an Org and are raised by the
 * platform against a shipment; a party linked to that org can point at them
 * (see `bookingInvoiceCount`) but must not add them into a figure headed "what
 * this customer owes us", because those are settled from a wallet on a
 * different schedule and by a different mechanism.
 */
export interface BillingPartyStats {
  invoiceCount: number;
  draftCount: number;
  issuedCount: number;
  cancelledCount: number;

  currency: string;
  mixedCurrency: boolean;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;

  firstInvoicedAt: string | null;
  lastInvoicedAt: string | null;

  /** Booking invoices raised to the linked org, if there is one. Null when not. */
  bookingInvoiceCount: number | null;
}

export interface ChargeTypeOption {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sacCode: string;
  defaultRatePercent: number;
  defaultReimbursement: boolean;
  applicability: ChargeApplicability;
  sortOrder: number;
}

export interface ChargePresetOption {
  id: string;
  name: string;
  description: string | null;
  mode: ShipmentMode | null;
  lines: PresetLine[];
}

export interface PresetLine {
  chargeTypeCode: string | null;
  label: string;
  sacCode: string;
  ratePercent: number;
  reimbursement: boolean;
}

export interface ManualInvoiceRow {
  id: string;
  invoiceNumber: string | null;
  docType: ManualInvoiceDocType;
  status: ManualInvoiceStatus;
  /** Already derived, so OVERDUE is decided once, on the server. */
  view: ManualInvoiceViewStatus;

  partyId: string;
  partyName: string;
  orgId: string | null;
  orgName: string | null;

  mode: ShipmentMode;
  csbCategory: string | null;

  currency: string;
  total: number;
  taxableValue: number;
  totalTax: number;

  issueDate: string;
  dueDate: string | null;
  paidAt: string | null;
  lastSentAt: string | null;

  /** First AWB on the invoice plus a count, for the list's reference column. */
  primaryAwb: string | null;
  consignmentCount: number;

  fileUrl: string | null;
  fileName: string | null;

  createdByName: string | null;
  createdAt: string;
}

export interface ManualInvoiceSummary {
  draftCount: number;
  outstandingCount: number;
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  paidAmount: number;
  /** Totals are only meaningful within one currency; this is the dominant one. */
  currency: string;
  /** True when rows span more than one currency, so the UI can say so. */
  mixedCurrency: boolean;
}

export interface ManualInvoicePage {
  rows: ManualInvoiceRow[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
  summary: ManualInvoiceSummary;
}

/**
 * One invoice, in the shape the builder form edits.
 *
 * Deliberately the same field names as `manualInvoiceSchema` parses, so loading
 * a draft into the form and saving it back is a round trip rather than two
 * mappings that have to be kept in step. Dates are ISO strings because that is
 * what crosses the server boundary intact.
 */
export interface ManualInvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: ManualInvoiceStatus;
  view: ManualInvoiceViewStatus;
  docType: ManualInvoiceDocType;
  relatedInvoiceId: string | null;
  relatedInvoiceNumber: string | null;

  billingPartyId: string;
  party: BillingPartyDetail | null;

  mode: ShipmentMode;
  csbCategory: string | null;

  issueDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  reference: string | null;

  currency: string;
  taxMode: TaxMode;
  reverseCharge: boolean;
  placeOfSupplyCode: string | null;
  placeOfSupplyName: string | null;

  irn: string | null;
  irnAckNo: string | null;
  irnAckDate: string | null;
  irnQrData: string | null;

  notes: string | null;
  termsOverride: string | null;

  consignments: ManualConsignmentDetail[];

  fileUrl: string | null;
  fileName: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  lastSentAt: string | null;
  lastSentTo: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ManualConsignmentDetail {
  id: string;
  awbNumber: string | null;
  mawbNumber: string | null;
  trackingNumber: string | null;
  bookingDate: string | null;
  pickupDate: string | null;
  origin: string | null;
  originPostalCode: string | null;
  originCity: string | null;
  originState: string | null;
  originCountry: string | null;
  destination: string | null;
  destinationPostalCode: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  destinationCountry: string | null;
  serviceType: string | null;
  productType: string | null;
  parcelType: string | null;
  shipMode: string | null;
  originPort: string | null;
  destinationPort: string | null;
  flightNumber: string | null;
  airlineName: string | null;
  forwarderName: string | null;
  subAgent: string | null;
  pieces: number | null;
  grossWeightKg: number | null;
  chargeableWeightKg: number | null;
  boxCount: number | null;
  palletCount: number | null;
  cartonCount: number | null;
  goodsDescription: string | null;
  particulars: string | null;
  exportInvoiceNo: string | null;
  referenceNo: string | null;
  shipperName: string | null;
  consigneeName: string | null;
  containerNumber: string | null;
  jobNumber: string | null;
  notes: string | null;
  charges: ManualChargeDetail[];
}

export interface ManualChargeDetail {
  id: string;
  chargeTypeId: string | null;
  label: string;
  sacCode: string;
  rate: number;
  quantity: number;
  amount: number;
  discount: number;
  ratePercent: number;
  reimbursement: boolean;
  notes: string | null;
}

export interface ManualInvoiceListParams {
  page?: number;
  pageSize?: number;
  sortField?: ManualSortField;
  sortDir?: "asc" | "desc";
  statusFilter?: ManualStatusFilter;
  search?: string;
  partyId?: string | null;
  mode?: ShipmentMode | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.");

const money = z
  .number()
  .min(0, "Amount cannot be negative.")
  .max(1_000_000_000, "Amount is too large.");

/**
 * GSTIN is validated by shape only here. The checksum lives in ../tax/gst.ts and
 * is applied where it can be acted on: the form warns, and the place-of-supply
 * resolver refuses to trust a number that fails it. A hard rejection at this
 * layer would block a genuine invoice over a customer's typo in a field that is
 * optional to begin with.
 */
const gstin = optionalText(15);

export const billingPartySchema = z.object({
  kind: z.enum(BillingPartyKind).default(BillingPartyKind.BUSINESS),

  legalName: trimmed(200).min(1, "Enter the customer's name."),
  tradeName: optionalText(200),
  customerCode: optionalText(60),

  gstin,
  pan: optionalText(10),
  cin: optionalText(30),

  contactName: optionalText(120),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address.")])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  phone: optionalText(30),

  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  stateCode: optionalText(2),
  postalCode: optionalText(20),
  country: optionalText(80),

  notes: optionalText(2000),

  orgId: z.string().min(1).nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
});

export const chargeLineSchema = z.object({
  id: z.string().min(1).nullable().optional(),
  chargeTypeId: z.string().min(1).nullable().optional(),
  label: trimmed(160).min(1, "Every charge needs a description."),
  sacCode: trimmed(20).default("996812"),
  rate: money.default(0),
  quantity: z.number().min(0).max(1_000_000).default(1),
  amount: money.default(0),
  discount: money.default(0),
  ratePercent: z
    .number()
    .min(0, "GST rate cannot be negative.")
    .max(100, "GST rate cannot exceed 100%."),
  reimbursement: z.boolean().default(false),
  notes: optionalText(500),
});

export const consignmentSchema = z.object({
  id: z.string().min(1).nullable().optional(),

  awbNumber: optionalText(60),
  mawbNumber: optionalText(60),
  trackingNumber: optionalText(60),
  bookingDate: isoDate.nullable().optional(),
  pickupDate: isoDate.nullable().optional(),

  origin: optionalText(120),
  originPostalCode: optionalText(20),
  originCity: optionalText(100),
  originState: optionalText(100),
  originCountry: optionalText(80),

  destination: optionalText(120),
  destinationPostalCode: optionalText(20),
  destinationCity: optionalText(100),
  destinationState: optionalText(100),
  destinationCountry: optionalText(80),

  serviceType: optionalText(120),
  productType: optionalText(80),
  parcelType: optionalText(60),
  shipMode: optionalText(40),
  originPort: optionalText(60),
  destinationPort: optionalText(60),
  flightNumber: optionalText(40),

  airlineName: optionalText(120),
  forwarderName: optionalText(200),
  subAgent: optionalText(200),

  pieces: z.number().int().min(0).max(100_000).nullable().optional(),
  grossWeightKg: z.number().min(0).max(1_000_000).nullable().optional(),
  chargeableWeightKg: z.number().min(0).max(1_000_000).nullable().optional(),

  boxCount: z.number().int().min(0).max(100_000).nullable().optional(),
  palletCount: z.number().int().min(0).max(100_000).nullable().optional(),
  cartonCount: z.number().int().min(0).max(100_000).nullable().optional(),

  goodsDescription: optionalText(500),
  particulars: optionalText(500),
  exportInvoiceNo: optionalText(60),
  referenceNo: optionalText(60),
  shipperName: optionalText(200),
  consigneeName: optionalText(200),
  containerNumber: optionalText(60),
  jobNumber: optionalText(60),

  notes: optionalText(500),

  charges: z.array(chargeLineSchema).max(80, "Too many charges on one consignment."),
});

export const manualInvoiceSchema = z
  .object({
    billingPartyId: z.string().min(1, "Choose who this invoice is for."),

    docType: z.enum(ManualInvoiceDocType).default(ManualInvoiceDocType.TAX_INVOICE),
    relatedInvoiceId: z.string().min(1).nullable().optional(),

    mode: z.enum(ShipmentMode).default(ShipmentMode.INTERNATIONAL),
    csbCategory: optionalText(30),

    issueDate: isoDate,
    dueDate: isoDate.nullable().optional(),
    paymentTerms: optionalText(30),

    reference: optionalText(120),

    currency: trimmed(3).min(3).default(DEFAULT_CURRENCY),
    taxMode: z.enum(TaxMode).default(TaxMode.EXCLUSIVE),
    reverseCharge: z.boolean().default(false),

    placeOfSupplyCode: optionalText(2),

    irn: optionalText(80),
    irnAckNo: optionalText(40),
    irnAckDate: isoDate.nullable().optional(),
    irnQrData: optionalText(4000),

    notes: optionalText(2000),
    termsOverride: optionalText(4000),

    consignments: z
      .array(consignmentSchema)
      .min(1, "Add at least one consignment.")
      .max(50, "Too many consignments on one invoice."),
  })
  .refine(
    (v) => !v.dueDate || new Date(v.dueDate) >= new Date(v.issueDate),
    { path: ["dueDate"], message: "Due date cannot be before the issue date." },
  )
  .refine(
    (v) =>
      v.docType !== ManualInvoiceDocType.CREDIT_NOTE || !!v.relatedInvoiceId,
    {
      path: ["relatedInvoiceId"],
      message: "A credit note must name the invoice it reverses.",
    },
  );

/**
 * Issuing is stricter than saving a draft. A draft may be half-finished on
 * purpose; an issued invoice takes a serial and reaches a customer, so it has
 * to actually bill something.
 */
export const issueChecks = {
  hasCharges(consignments: { charges: unknown[] }[]): boolean {
    return consignments.some((c) => c.charges.length > 0);
  },
};

export const chargePresetSchema = z.object({
  name: trimmed(120).min(1, "Give the preset a name."),
  description: optionalText(500),
  mode: z.enum(ShipmentMode).nullable().optional(),
  lines: z
    .array(
      z.object({
        chargeTypeCode: z.string().min(1).nullable().optional(),
        label: trimmed(160).min(1),
        sacCode: trimmed(20),
        ratePercent: z.number().min(0).max(100),
        reimbursement: z.boolean(),
      }),
    )
    .min(1, "A preset needs at least one charge."),
});

export const chargeTypeSchema = z.object({
  code: trimmed(80)
    .min(1, "Give the charge a code.")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens."),
  label: trimmed(160).min(1, "Give the charge a name."),
  description: optionalText(500),
  sacCode: trimmed(20).min(1),
  defaultRatePercent: z.number().min(0).max(100),
  defaultReimbursement: z.boolean().default(false),
  applicability: z.enum(ChargeApplicability).default(ChargeApplicability.ANY),
  sortOrder: z.number().int().min(0).max(100_000).default(500),
});
