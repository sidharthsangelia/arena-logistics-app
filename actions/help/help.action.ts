"use server";

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";

import { resolveHelpAudience } from "@/lib/help/audience.server";
import { getArticleForPath, getRelatedFor, getSearchIndex } from "@/lib/help/registry";

// No type exports from this file: Turbopack treats every export of a
// "use server" module as an action. Result types live in lib/help/types.ts.

/**
 * The search index for the Cmd+K palette, filtered for the caller. Fetched on
 * first open rather than shipped with every page, so the layout bundle never
 * carries article text.
 */
export async function getHelpSearchIndexAction() {
  const { userId } = await auth();
  if (!userId) return [];
  try {
    const audience = await resolveHelpAudience();
    return getSearchIndex(audience);
  } catch (error) {
    console.error("getHelpSearchIndexAction failed", error);
    Sentry.captureException(error, { tags: { location: "getHelpSearchIndexAction" } });
    return [];
  }
}

/**
 * The guide for the page the user is on, for the "?" side sheet. The pathname
 * only chooses WHICH article; whether the caller may read it is decided from
 * the session, so a crafted path cannot surface anything extra.
 */
export async function getPageHelpAction(pathname: string) {
  const { userId } = await auth();
  if (!userId || typeof pathname !== "string" || pathname.length > 300) return null;
  try {
    const audience = await resolveHelpAudience();
    const article = getArticleForPath(pathname, audience);
    if (!article) return { audience, article: null, related: [] };
    return { audience, article, related: getRelatedFor(article, audience) };
  } catch (error) {
    console.error("getPageHelpAction failed", error);
    Sentry.captureException(error, {
      tags: { location: "getPageHelpAction" },
      extra: { pathname },
    });
    return null;
  }
}
