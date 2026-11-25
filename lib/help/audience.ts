/**
 * lib/help/audience.ts
 *
 * Who may read what. Pure, so the rules are unit-tested and identical wherever
 * they run.
 *
 * The rules, in plain words:
 *
 *  1. Customers read only what is written for them. A Business Associate never
 *     sees a block tagged for standard orgs, and the other way round.
 *  2. Arena staff read every customer article in full, including the variants
 *     for each kind of customer, because they field the questions.
 *  3. Arena material is split by role the same way the sidebar is: anything
 *     tagged only `arena-admin` (money) is hidden from ops members.
 */

import {
  isArenaAudience,
  type HelpArticle,
  type HelpAudience,
  type HelpBlock,
} from "./types";

function listsArena(audiences: readonly HelpAudience[]): boolean {
  return audiences.some(isArenaAudience);
}

function visibleTo(
  audiences: readonly HelpAudience[] | undefined,
  viewer: HelpAudience,
): boolean {
  if (!audiences || audiences.length === 0) return true;
  if (audiences.includes(viewer)) return true;
  if (!isArenaAudience(viewer)) return false;

  // Arena viewer, not named. Customer-only material is open to all staff.
  if (!listsArena(audiences)) return true;

  // Arena material that names other staff roles. An admin may read anything
  // an ops member may; never the reverse.
  return viewer === "arena-admin" && audiences.includes("arena-ops");
}

export function canRead(article: HelpArticle, viewer: HelpAudience): boolean {
  return visibleTo(article.audiences, viewer);
}

export function blockVisible(block: HelpBlock, viewer: HelpAudience): boolean {
  return visibleTo(block.audiences, viewer);
}

/**
 * For Arena staff reading a customer article: a short label naming who a
 * block was written for, when that is not everybody. Returns null for
 * customers (they only ever see their own variant) and for untagged blocks.
 */
export function blockAudienceLabel(
  block: HelpBlock,
  viewer: HelpAudience,
): string | null {
  if (!isArenaAudience(viewer)) return null;
  const a = block.audiences;
  if (!a || a.length === 0) return null;
  if (a.includes(viewer)) return null;
  return a.map(audienceLabel).join(", ");
}

export function audienceLabel(a: HelpAudience): string {
  switch (a) {
    case "standard":
      return "Customers";
    case "ba":
      return "Business Associates";
    case "arena-ops":
      return "Arena ops";
    case "arena-admin":
      return "Arena admins";
  }
}

/** Returns the article with blocks the viewer may not see removed. */
export function filterArticle(
  article: HelpArticle,
  viewer: HelpAudience,
): HelpArticle {
  return {
    ...article,
    blocks: article.blocks.filter((b) => blockVisible(b, viewer)),
  };
}
