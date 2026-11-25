import "server-only";

/**
 * lib/help/registry.ts
 *
 * The one door into help content. Every read is for a named audience and
 * returns only what that audience may see, so nothing downstream has to
 * remember to filter. Server only: the raw content never reaches a browser.
 */

import { canRead, filterArticle, blockVisible } from "./audience";
import { blockText, stripInline } from "./search";
import { matchRoute, scopeOfPath } from "./routes";
import {
  HELP_CATEGORIES,
  isArenaAudience,
  type ChangelogEntry,
  type HelpArticle,
  type HelpAudience,
  type HelpCategoryId,
  type HelpRelease,
  type HelpSearchDoc,
  type HelpVersion,
} from "./types";

import { gettingStartedArticles } from "./content/getting-started";
import { accountArticles } from "./content/account";
import { ratesArticles } from "./content/rates";
import { bookingArticles } from "./content/booking";
import { afterBookingArticles } from "./content/after-booking";
import { moneyArticles } from "./content/money";
import { clientArticles } from "./content/clients";
import { opsArticles } from "./content/ops";
import { opsAdminArticles } from "./content/ops-admin";
import { troubleshootingArticles } from "./content/troubleshooting";
import { releases } from "./content/changelog";

export const ALL_ARTICLES: readonly HelpArticle[] = [
  ...gettingStartedArticles,
  ...ratesArticles,
  ...bookingArticles,
  ...afterBookingArticles,
  ...clientArticles,
  ...moneyArticles,
  ...accountArticles,
  ...troubleshootingArticles,
  ...opsArticles,
  ...opsAdminArticles,
];

export const ALL_RELEASES: readonly HelpRelease[] = releases;

const BY_SLUG = new Map(ALL_ARTICLES.map((a) => [a.slug, a]));

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export function getArticlesFor(audience: HelpAudience): HelpArticle[] {
  return ALL_ARTICLES.filter((a) => canRead(a, audience));
}

export function getArticle(
  slug: string,
  audience: HelpAudience,
): HelpArticle | null {
  const a = BY_SLUG.get(slug);
  if (!a || !canRead(a, audience)) return null;
  return filterArticle(a, audience);
}

export interface HelpArticleCard {
  slug: string;
  title: string;
  summary: string;
  updated: HelpVersion;
}

export interface HelpCategoryGroup {
  id: HelpCategoryId;
  title: string;
  description: string;
  articles: HelpArticleCard[];
}

export function toCard(a: HelpArticle): HelpArticleCard {
  return { slug: a.slug, title: a.title, summary: a.summary, updated: a.updated };
}

/** Categories in their fixed order, each with the audience's articles. Empty ones dropped. */
export function getCategoriesFor(audience: HelpAudience): HelpCategoryGroup[] {
  const visible = getArticlesFor(audience);
  // Staff come here for the ops guides; the customer guides follow as reference.
  const order = isArenaAudience(audience)
    ? [
        ...HELP_CATEGORIES.filter((c) => c.id === "operations"),
        ...HELP_CATEGORIES.filter((c) => c.id !== "operations"),
      ]
    : HELP_CATEGORIES;
  return order.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    articles: visible
      .filter((a) => a.category === c.id)
      .sort((x, y) => x.order - y.order)
      .map(toCard),
  })).filter((c) => c.articles.length > 0);
}

/** Related articles the audience can open, in the order the author listed them. */
export function getRelatedFor(
  article: HelpArticle,
  audience: HelpAudience,
): HelpArticleCard[] {
  return (article.related ?? [])
    .map((s) => BY_SLUG.get(s))
    .filter((a): a is HelpArticle => !!a && canRead(a, audience))
    .map(toCard);
}

// ---------------------------------------------------------------------------
// Page help ("?" button)
// ---------------------------------------------------------------------------

/**
 * The article that best explains `pathname` for this audience, or null.
 * Most specific route pattern wins; ties go to the article that claims fewer
 * routes, since a focused article beats a general one.
 */
export function getArticleForPath(
  pathname: string,
  audience: HelpAudience,
): HelpArticle | null {
  const { scope, path } = scopeOfPath(pathname);
  let best: { a: HelpArticle; score: number } | null = null;

  for (const a of ALL_ARTICLES) {
    if (!canRead(a, audience)) continue;
    for (const r of a.routes ?? []) {
      if (r.scope !== scope) continue;
      const score = matchRoute(r.path, path);
      if (score < 0) continue;
      if (
        !best ||
        score > best.score ||
        (score === best.score && (a.routes?.length ?? 0) < (best.a.routes?.length ?? 0))
      ) {
        best = { a, score };
      }
    }
  }
  return best ? filterArticle(best.a, audience) : null;
}

// ---------------------------------------------------------------------------
// Search index
// ---------------------------------------------------------------------------

const indexCache = new Map<HelpAudience, HelpSearchDoc[]>();

/** Plain-text index of everything this audience may read. Memoised per audience. */
export function getSearchIndex(audience: HelpAudience): HelpSearchDoc[] {
  const hit = indexCache.get(audience);
  if (hit) return hit;

  const docs = getArticlesFor(audience).map((a): HelpSearchDoc => {
    const blocks = a.blocks.filter((b) => blockVisible(b, audience));
    return {
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      category: a.category,
      headings: blocks.flatMap((b) => (b.type === "heading" ? [stripInline(b.text)] : [])),
      keywords: [...(a.keywords ?? [])],
      body: stripInline(blocks.map(blockText).join(" ")).replace(/\s+/g, " ").trim(),
    };
  });

  indexCache.set(audience, docs);
  return docs;
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

function entryVisible(e: ChangelogEntry, audience: HelpAudience): boolean {
  // Same rules as articles: reuse them through a stand-in.
  return blockVisible({ type: "p", text: "", audiences: e.audiences }, audience);
}

/** Releases with only the entries this audience should see; empty releases dropped. */
export function getReleasesFor(audience: HelpAudience): HelpRelease[] {
  return ALL_RELEASES.map((r) => ({
    version: r.version,
    entries: r.entries.filter((e) => entryVisible(e, audience)),
  })).filter((r) => r.entries.length > 0);
}

/** Newest release with something for this audience. Drives the unread dot. */
export function getLatestVersionFor(audience: HelpAudience): HelpVersion | null {
  return getReleasesFor(audience)[0]?.version ?? null;
}

/** The newest release overall, for "Updated" chips on articles. */
export const CURRENT_VERSION: HelpVersion | null = ALL_RELEASES[0]?.version ?? null;

/** Every article was written in this release, so it is not "updated" news. */
const HELP_LAUNCH_VERSION: HelpVersion = "2026.11.21";

/** True when the article changed in the newest release (and that is not launch day). */
export function isRecentlyUpdated(updated: HelpVersion): boolean {
  return (
    CURRENT_VERSION !== null &&
    CURRENT_VERSION !== HELP_LAUNCH_VERSION &&
    updated === CURRENT_VERSION
  );
}

/** "2026.11.21" → "21 Nov 2026". Pure string work, so no time-zone drift. */
export function formatHelpVersion(v: HelpVersion): string {
  const [y, m, d] = v.split(".").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1] ?? ""} ${y}`;
}
