/**
 * lib/help/types.ts
 *
 * The shape of the in-app help centre. Pure types and constants, safe to import
 * from client components: nothing here carries article text.
 *
 * ── HOW THE CONTENT IS SPLIT ────────────────────────────────────────────────
 * One source, tagged by audience. A topic that reads the same for everybody
 * ("Track a shipment") is written once. Where one audience needs a different
 * paragraph, that block carries its own `audiences` and is dropped for everyone
 * else before the article leaves the server.
 *
 * Article text lives in `lib/help/content/**`, which is `server-only`. The
 * browser only ever receives articles already filtered for the viewer, so an
 * ops runbook that names a vendor can never ride along in a tenant's bundle.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Who is reading.
 *
 *  standard     a customer org shipping for itself
 *  ba           a Business Associate org, shipping for its own clients too
 *  arena-ops    Arena staff without the admin role (no money pages)
 *  arena-admin  Arena staff with the admin role (everything)
 */
export const HELP_AUDIENCES = [
  "standard",
  "ba",
  "arena-ops",
  "arena-admin",
] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

export const TENANT_AUDIENCES: readonly HelpAudience[] = ["standard", "ba"];
export const ALL_AUDIENCES: readonly HelpAudience[] = HELP_AUDIENCES;

export function isArenaAudience(a: HelpAudience): boolean {
  return a === "arena-ops" || a === "arena-admin";
}

/**
 * Release identifier, date based: "YYYY.MM.DD". Ships continuously to main, so
 * a date says everything a version number would without anyone having to judge
 * whether a change is minor or major. Sorts correctly as a plain string.
 */
export type HelpVersion = `${number}.${string}.${string}`;

export const HELP_CATEGORIES = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Set up your account and send your first shipment.",
  },
  {
    id: "rates",
    title: "Rates and pricing",
    description: "Check prices before you book and understand what you pay for.",
  },
  {
    id: "booking",
    title: "Booking a shipment",
    description: "Every step of the booking form, international and domestic.",
  },
  {
    id: "after-booking",
    title: "After you book",
    description: "Labels, tracking, statuses and what each one asks of you.",
  },
  {
    id: "clients",
    title: "Clients and quotes",
    description: "Shipping on behalf of the clients you bring in.",
  },
  {
    id: "money",
    title: "Wallet and invoices",
    description: "Paying for shipments, refunds and your tax invoices.",
  },
  {
    id: "account",
    title: "Your account",
    description: "Profile, documents, addresses, team and notifications.",
  },
  {
    id: "operations",
    title: "Arena operations",
    description: "Running bookings, accounts and integrations from the ops console.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and FAQ",
    description: "Straight answers when something is not going to plan.",
  },
] as const;
export type HelpCategoryId = (typeof HELP_CATEGORIES)[number]["id"];

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
//
// Text fields accept a tiny inline syntax, rendered by components/help/HelpText:
//   **bold**             emphasis
//   `code`               a value somebody types or reads, e.g. an ARN
//   [label](href)        a link. "help:slug" links to another article,
//                        "app:/path" links into the app (base path added),
//                        anything else is used as given
//   [[button:Label]]     a replica of an on-screen button
//   [[badge:Label]]      a replica of a status badge
//   [[key:Ctrl K]]       a keyboard key
//
// Every block may carry `audiences` to show it to only some readers.

interface BlockBase {
  /** Omit to show to every audience the article itself is visible to. */
  audiences?: readonly HelpAudience[];
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  text: string;
}
export interface ParagraphBlock extends BlockBase {
  type: "p";
  text: string;
}
export interface ListBlock extends BlockBase {
  type: "list";
  ordered?: boolean;
  items: string[];
}
export interface StepsBlock extends BlockBase {
  type: "steps";
  items: { title: string; body?: string }[];
}
export interface CalloutBlock extends BlockBase {
  type: "callout";
  tone: "info" | "tip" | "warning";
  title?: string;
  text: string;
}
export interface TableBlock extends BlockBase {
  type: "table";
  head: string[];
  rows: string[][];
}
/** A left-to-right sequence of stages, e.g. a shipment's lifecycle. */
export interface FlowBlock extends BlockBase {
  type: "flow";
  stages: { label: string; hint?: string; tone?: "default" | "warning" | "success" }[];
}
export interface FaqBlock extends BlockBase {
  type: "faq";
  items: { q: string; a: string }[];
}

export type HelpBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | StepsBlock
  | CalloutBlock
  | TableBlock
  | FlowBlock
  | FaqBlock;

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export interface HelpArticle {
  /** URL segment under /help. Never rename one: links and bookmarks hold it. */
  slug: string;
  title: string;
  /** One sentence, shown on cards and in search results. */
  summary: string;
  category: HelpCategoryId;
  /** Lower sorts first inside its category. */
  order: number;
  /**
   * Who may read it. Arena staff are added automatically for tenant articles
   * (they need to know what customers see), so list only the audiences the
   * article is *written for*. See `canRead` in lib/help/audience.ts.
   */
  audiences: readonly HelpAudience[];
  /**
   * App routes this article explains, as patterns relative to the dashboard
   * root: "/book", "/shipments/[id]". Drives the "?" button and the coverage
   * test. Tenant routes and arena routes are kept apart by `scope`.
   */
  routes?: readonly { scope: "tenant" | "arena"; path: string }[];
  /** Extra words people search with that are not in the text. */
  keywords?: readonly string[];
  /** Release in which this article last changed in substance. */
  updated: HelpVersion;
  related?: readonly string[];
  blocks: readonly HelpBlock[];
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  title: string;
  body: string;
  audiences: readonly HelpAudience[];
  /** Articles worth reading because of this change. */
  articles?: readonly string[];
  kind: "new" | "improved" | "fixed";
}

export interface HelpRelease {
  version: HelpVersion;
  entries: readonly ChangelogEntry[];
}

// ---------------------------------------------------------------------------
// What crosses to the browser
// ---------------------------------------------------------------------------

/** One row of the search index. Built server-side for one audience only. */
export interface HelpSearchDoc {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategoryId;
  headings: string[];
  keywords: string[];
  /** Plain text of the visible blocks, markup stripped. */
  body: string;
}

export const SUPPORT_EMAIL = "info@arenalogistics.co.in";
