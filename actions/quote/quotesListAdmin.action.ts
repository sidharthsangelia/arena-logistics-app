"use server";

/**
 * actions/quote/quotesListAdmin.action.ts
 *
 * The company-side quotes read, across every tenant org. Unlike
 * getQuotesAction (tenant-scoped) this deliberately does not filter by org, so
 * ops can search the whole platform from one place.
 *
 * Because of that, it is gated on Arena membership. Route gating in proxy.ts is
 * not enough: a server action is reachable by a direct POST from any signed-in
 * session, which would otherwise hand a tenant user every other tenant's quotes.
 *
 * This file is "use server", so it exports functions only. The row shape and the
 * sort/filter vocabulary live in lib/quotes/config.ts.
 */

import * as Sentry from "@sentry/nextjs";

import { getAdminQuotesPage } from "@/lib/quotes/adminQueries";
import { requireArenaMember } from "@/utils/arena-auth";
import type {
  AdminQuoteListParams,
  AdminQuotePage,
} from "@/lib/quotes/config";

export async function listAllQuotesAction(
  params: AdminQuoteListParams,
): Promise<AdminQuotePage> {
  await requireArenaMember();

  try {
    return await getAdminQuotesPage(params);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "listAllQuotesAction" },
      extra: { params },
    });
    throw error;
  }
}
