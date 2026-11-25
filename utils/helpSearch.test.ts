import { test } from "node:test";
import assert from "node:assert/strict";

import { canRead, filterArticle, blockAudienceLabel } from "@/lib/help/audience";
import { prepareIndex, searchHelp, stripInline } from "@/lib/help/search";
import { matchRoute, routeFromPageFile, scopeOfPath } from "@/lib/help/routes";
import { linkContextFor } from "@/lib/help/links";
import type { HelpArticle, HelpSearchDoc } from "@/lib/help/types";

function article(partial: Partial<HelpArticle>): HelpArticle {
  return {
    slug: "x",
    title: "X",
    summary: "",
    category: "booking",
    order: 1,
    audiences: ["standard"],
    updated: "2026.11.21",
    blocks: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

test("customers read only what is written for them", () => {
  const baOnly = article({ audiences: ["ba"] });
  assert.equal(canRead(baOnly, "ba"), true);
  assert.equal(canRead(baOnly, "standard"), false);
});

test("Arena staff read every customer article", () => {
  const std = article({ audiences: ["standard"] });
  assert.equal(canRead(std, "arena-ops"), true);
  assert.equal(canRead(std, "arena-admin"), true);
});

test("admin-only material is hidden from ops, ops material is open to admins", () => {
  assert.equal(canRead(article({ audiences: ["arena-admin"] }), "arena-ops"), false);
  assert.equal(canRead(article({ audiences: ["arena-admin"] }), "arena-admin"), true);
  assert.equal(canRead(article({ audiences: ["arena-ops"] }), "arena-admin"), true);
  assert.equal(canRead(article({ audiences: ["arena-ops"] }), "standard"), false);
});

test("blocks for one customer kind never reach the other", () => {
  const a = article({
    audiences: ["standard", "ba"],
    blocks: [
      { type: "p", text: "everyone" },
      { type: "p", text: "ba only", audiences: ["ba"] },
      { type: "p", text: "admin only", audiences: ["arena-admin"] },
    ],
  });
  const texts = (aud: Parameters<typeof filterArticle>[1]) =>
    filterArticle(a, aud).blocks.map((b) => (b.type === "p" ? b.text : ""));
  assert.deepEqual(texts("standard"), ["everyone"]);
  assert.deepEqual(texts("ba"), ["everyone", "ba only"]);
  assert.deepEqual(texts("arena-ops"), ["everyone", "ba only"]);
  assert.deepEqual(texts("arena-admin"), ["everyone", "ba only", "admin only"]);
});

test("variant labels are only shown to staff", () => {
  const block = { type: "p" as const, text: "", audiences: ["ba" as const] };
  assert.equal(blockAudienceLabel(block, "ba"), null);
  assert.equal(blockAudienceLabel(block, "arena-ops"), "Business Associates");
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const DOCS: HelpSearchDoc[] = [
  {
    slug: "shipping-labels",
    title: "Shipping labels",
    summary: "Print the label",
    category: "after-booking",
    headings: [],
    keywords: ["awb", "print"],
    body: "The label carries the waybill and barcode.",
  },
  {
    slug: "wallet",
    title: "Your wallet",
    summary: "Top up and refunds",
    category: "money",
    headings: ["Top up"],
    keywords: ["recharge"],
    body: "Shipments are paid from a prepaid wallet. Print a statement.",
  },
];
const INDEX = prepareIndex(DOCS);

test("title matches outrank body matches", () => {
  const r = searchHelp(INDEX, "print");
  assert.equal(r[0].doc.slug, "shipping-labels");
  assert.equal(r.length, 2);
});

test("every query word must match", () => {
  assert.deepEqual(searchHelp(INDEX, "wallet barcode"), []);
});

test("prefixes, keywords and single typos match", () => {
  assert.equal(searchHelp(INDEX, "walle")[0]?.doc.slug, "wallet");
  assert.equal(searchHelp(INDEX, "recharge")[0]?.doc.slug, "wallet");
  assert.equal(searchHelp(INDEX, "labesl")[0]?.doc.slug, "shipping-labels");
});

test("stop words alone still search, and empty queries return nothing", () => {
  assert.deepEqual(searchHelp(INDEX, "   "), []);
  assert.ok(searchHelp(INDEX, "how do I top up").some((r) => r.doc.slug === "wallet"));
});

test("inline markup is stripped for indexing", () => {
  assert.equal(
    stripInline("Click [[button:Recharge]] then [Wallet](app:/wallet), **now** with `ARN1`"),
    "Click Recharge then Wallet, now with ARN1",
  );
});

// ---------------------------------------------------------------------------
// Routes and links
// ---------------------------------------------------------------------------

test("route matching prefers exact segments", () => {
  assert.equal(matchRoute("/shipments/[id]", "/shipments/abc"), 3);
  assert.equal(matchRoute("/invoices/new", "/invoices/new"), 4);
  assert.ok(matchRoute("/invoices/new", "/invoices/new") > matchRoute("/invoices/[id]", "/invoices/new"));
  assert.equal(matchRoute("/shipments", "/shipments/abc"), -1);
  assert.equal(matchRoute("/", "/"), 0);
});

test("paths split into tenant and arena scope", () => {
  assert.deepEqual(scopeOfPath("/arena-dashboard"), { scope: "arena", path: "/" });
  assert.deepEqual(scopeOfPath("/arena-dashboard/bookings/1?x=2"), { scope: "arena", path: "/bookings/1" });
  assert.deepEqual(scopeOfPath("/book/"), { scope: "tenant", path: "/book" });
  assert.deepEqual(scopeOfPath("/arena-dashboardx"), { scope: "tenant", path: "/arena-dashboardx" });
});

test("page files map to routes with groups dropped", () => {
  assert.deepEqual(routeFromPageFile("app/(tenant)/shipments/[id]/page.tsx"), { scope: "tenant", path: "/shipments/[id]" });
  assert.deepEqual(routeFromPageFile("app/(tenant)/page.tsx"), { scope: "tenant", path: "/" });
  assert.deepEqual(routeFromPageFile("app/(arena)/arena-dashboard/page.tsx"), { scope: "arena", path: "/" });
});

test("staff reading a customer article get no links into customer screens", () => {
  const customer = { audiences: ["standard", "ba"] as const };
  assert.equal(linkContextFor(customer, "arena-admin", "arena").appLinks, false);
  assert.equal(linkContextFor(customer, "standard", "tenant").appLinks, true);
  assert.equal(linkContextFor({ audiences: ["arena-ops"] }, "arena-ops", "arena").appLinks, true);
});
