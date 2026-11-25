/**
 * Help content integrity and coverage.
 *
 * Runs under `npm run test:server` because the content modules are
 * server-only. Fails when:
 *   - an app page has no help article and is not listed in NOT_YET_DOCUMENTED
 *   - an entry in NOT_YET_DOCUMENTED is stale (route gone, or now documented)
 *   - a link, related slug or changelog reference points at nothing
 *   - copy uses an em dash, or a customer-visible block names a vendor
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ALL_ARTICLES, ALL_RELEASES, getArticle, getArticlesFor, getSearchIndex } from "@/lib/help/registry";
import { routeFromPageFile } from "@/lib/help/routes";
import { blockText } from "@/lib/help/search";
import { HELP_AUDIENCES, HELP_CATEGORIES, TENANT_AUDIENCES } from "@/lib/help/types";

// ---------------------------------------------------------------------------
// Routes nobody has written a guide for yet. Shrink this list; never grow it
// without a phase or a reason. Key is "scope:path".
// ---------------------------------------------------------------------------

const NOT_A_DASHBOARD_PAGE = "auth or onboarding, outside the dashboard";

const NOT_YET_DOCUMENTED: Record<string, string> = {
  "tenant:/onboarding": NOT_A_DASHBOARD_PAGE,
  "tenant:/sign-in/[[...sign-in]]": NOT_A_DASHBOARD_PAGE,
  "tenant:/sign-up/[[...sign-up]]": NOT_A_DASHBOARD_PAGE,
  "tenant:/activate-org": NOT_A_DASHBOARD_PAGE,

};

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageFiles(full);
    return /^page\.tsx?$/.test(name) ? [full] : [];
  });
}

const APP_DIR = join(process.cwd(), "app");
const ROUTES = pageFiles(APP_DIR).map((f) => routeFromPageFile(relative(process.cwd(), f)));

function isDocumented(scope: string, path: string): boolean {
  return ALL_ARTICLES.some((a) =>
    (a.routes ?? []).some((r) => r.scope === scope && r.path === path),
  );
}

test("every app page has a guide, or a reason it does not yet", () => {
  const missing = ROUTES.filter(
    (r) => !isDocumented(r.scope, r.path) && !(`${r.scope}:${r.path}` in NOT_YET_DOCUMENTED),
  ).map((r) => `${r.scope}:${r.path}`);
  assert.deepEqual(missing, [], "Add `routes` to an article, or list the route in NOT_YET_DOCUMENTED with a reason");
});

test("the not-yet-documented list holds no stale entries", () => {
  const live = new Set(ROUTES.map((r) => `${r.scope}:${r.path}`));
  const stale = Object.keys(NOT_YET_DOCUMENTED).filter((key) => {
    const [scope, path] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    return !live.has(key) || isDocumented(scope, path);
  });
  assert.deepEqual(stale, [], "Remove these: the route is gone or now has a guide");
});

test("article routes point at pages that exist", () => {
  const live = new Set(ROUTES.map((r) => `${r.scope}:${r.path}`));
  const dangling = ALL_ARTICLES.flatMap((a) =>
    (a.routes ?? []).map((r) => `${r.scope}:${r.path}`).filter((k) => !live.has(k)).map((k) => `${a.slug} → ${k}`),
  );
  assert.deepEqual(dangling, []);
});

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

const SLUGS = new Set(ALL_ARTICLES.map((a) => a.slug));

test("slugs are unique, URL safe and do not shadow fixed routes", () => {
  assert.equal(SLUGS.size, ALL_ARTICLES.length, "duplicate slug");
  for (const a of ALL_ARTICLES) {
    assert.match(a.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.slug);
    assert.notEqual(a.slug, "whats-new");
  }
});

test("categories, related guides and help: links all resolve", () => {
  const categories = new Set<string>(HELP_CATEGORIES.map((c) => c.id));
  for (const a of ALL_ARTICLES) {
    assert.ok(categories.has(a.category), `${a.slug}: unknown category`);
    for (const r of a.related ?? []) assert.ok(SLUGS.has(r), `${a.slug}: related "${r}" missing`);
    const text = [a.summary, ...a.blocks.map(blockText)].join(" ");
    for (const m of text.matchAll(/\]\(help:([^)]+)\)/g)) {
      assert.ok(SLUGS.has(m[1]), `${a.slug}: link to help:${m[1]} is broken`);
    }
  }
});

test("releases are newest first, valid dates, and reference real guides", () => {
  const versions = ALL_RELEASES.map((r) => r.version);
  assert.deepEqual([...versions].sort().reverse(), versions, "newest release must be first");
  assert.equal(new Set(versions).size, versions.length, "one release per date");
  for (const v of versions) {
    assert.match(v, /^\d{4}\.\d{2}\.\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(v.replaceAll(".", "-"))), v);
    for (const e of ALL_RELEASES.find((r) => r.version === v)!.entries) {
      for (const s of e.articles ?? []) assert.ok(SLUGS.has(s), `${v}: "${s}" missing`);
    }
  }
  for (const a of ALL_ARTICLES) {
    assert.ok(versions.includes(a.updated), `${a.slug}: updated ${a.updated} is not a release`);
  }
});

test("every audience has something to read and the index builds", () => {
  for (const aud of HELP_AUDIENCES) {
    assert.ok(getArticlesFor(aud).length > 0, aud);
    assert.ok(getSearchIndex(aud).every((d) => d.body.length > 0), aud);
  }
});

// ---------------------------------------------------------------------------
// Copy rules
// ---------------------------------------------------------------------------

function allCopy(): string[] {
  return [
    ...ALL_ARTICLES.flatMap((a) => [a.title, a.summary, ...a.blocks.map(blockText)]),
    ...ALL_RELEASES.flatMap((r) => r.entries.flatMap((e) => [e.title, e.body])),
  ];
}

test("no em dashes in help copy", () => {
  const offenders = allCopy().filter((t) => t.includes("—"));
  assert.deepEqual(offenders, []);
});

// Vendors sit behind Arena's carrier branding for customers (carrierBranding.md).
const VENDOR_NAMES =
  /\b(shipmozo|skart|aramex|speedo ?post|shipglobal|delipack|logibuddy|delhivery|fedex|dhl|shadowfax|blue ?dart|xpressbees|ekart|dtdc|inngest|uploadthing|resend|neon|razorpay)\b/i;
// "UPS" alone is case sensitive, or every "top-ups" would trip it.
const UPS = /\bUPS\b/;

test("customers never see a vendor or infrastructure name", () => {
  for (const aud of TENANT_AUDIENCES) {
    for (const doc of getSearchIndex(aud)) {
      const text = [doc.title, doc.summary, doc.body, ...doc.keywords].join(" ");
      assert.doesNotMatch(text, VENDOR_NAMES, `${aud} can read a vendor name in "${doc.slug}"`);
      assert.doesNotMatch(text, UPS, `${aud} can read a vendor name in "${doc.slug}"`);
    }
  }
});

test("BA guides stay with BAs, standard-only guides stay with standard orgs", () => {
  const slugsFor = (aud: (typeof HELP_AUDIENCES)[number]) =>
    new Set(getArticlesFor(aud).map((a) => a.slug));
  const standard = slugsFor("standard");
  const ba = slugsFor("ba");
  for (const s of ["business-associate-guide", "clients", "create-quote", "client-emails"]) {
    assert.ok(ba.has(s) && !standard.has(s), s);
  }
  for (const s of ["address-book", "become-business-associate"]) {
    assert.ok(standard.has(s) && !ba.has(s), s);
  }
  // Staff see both kinds.
  const ops = slugsFor("arena-ops");
  assert.ok(ops.has("client-emails") && ops.has("address-book"));
});

test("every in-text guide link is readable by everyone who can read the guide", () => {
  const problems: string[] = [];
  for (const aud of HELP_AUDIENCES) {
    const readable = new Set(getArticlesFor(aud).map((a) => a.slug));
    for (const slug of readable) {
      // getArticle returns only the blocks this audience is shown.
      const text = getArticle(slug, aud)!.blocks.map(blockText).join(" ");
      for (const m of text.matchAll(/\]\(help:([^)]+)\)/g)) {
        if (!readable.has(m[1])) problems.push(`${aud}: ${slug} links to ${m[1]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("customers never get ops guides, and ops members never get admin money guides", () => {
  const opsSlugs = ALL_ARTICLES.filter((a) => a.category === "operations").map((a) => a.slug);
  assert.ok(opsSlugs.length > 0);
  for (const aud of TENANT_AUDIENCES) {
    const readable = new Set(getArticlesFor(aud).map((a) => a.slug));
    assert.deepEqual(opsSlugs.filter((s) => readable.has(s)), [], aud);
  }
  const ops = new Set(getArticlesFor("arena-ops").map((a) => a.slug));
  for (const s of ["ops-wallets", "ops-invoices", "ops-manual-invoices", "ops-billing-customers", "ops-rate-cards", "ops-configuration", "ops-gst-incident"]) {
    assert.ok(!ops.has(s), `ops member can read ${s}`);
  }
  assert.ok(ops.has("ops-kyc-waivers") && ops.has("ops-start-here"));
  const admin = new Set(getArticlesFor("arena-admin").map((a) => a.slug));
  assert.equal(admin.size, ALL_ARTICLES.length, "admins read everything");
});
