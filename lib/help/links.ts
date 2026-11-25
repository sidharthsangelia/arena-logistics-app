/**
 * lib/help/links.ts
 *
 * Where help links point. Pure, used by both the server-rendered help pages and
 * the client-side "?" sheet.
 */

import { ARENA_BASE_PATH, type HelpRouteScope } from "./routes";
import { isArenaAudience, type HelpArticle, type HelpAudience } from "./types";

export function helpBase(scope: HelpRouteScope): string {
  return scope === "arena" ? ARENA_BASE_PATH : "";
}

/**
 * Link settings for rendering one article.
 *
 * A customer article's "app:" links point at customer screens. Arena staff
 * cannot open those (the proxy sends them back to the ops console), so for
 * staff they render as plain text instead of links that bounce.
 */
export function linkContextFor(
  article: Pick<HelpArticle, "audiences">,
  audience: HelpAudience,
  scope: HelpRouteScope,
): { base: string; appLinks: boolean } {
  const customerArticle = !article.audiences.some(isArenaAudience);
  return {
    base: helpBase(scope),
    appLinks: !(isArenaAudience(audience) && customerArticle),
  };
}
