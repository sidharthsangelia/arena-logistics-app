"use server";

/**
 * actions/quote/quotesList.action.ts
 *
 * Reads and single-row writes for a tenant's own quotes.
 *
 * Every function here resolves the caller's org itself through getDbOrgId(); the
 * org is never a parameter, so no caller can widen its own scope. The row shape
 * and the sort/filter vocabulary live in lib/quotes/config.ts, because this file
 * is "use server" and may export functions only.
 */

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import type { QuoteStatus } from "@/generated/prisma";
import { getDbOrgId } from "@/utils/tenant";
import { getTenantQuotesPage } from "@/lib/quotes/tenantQueries";
import type { QuoteListParams, QuotePage } from "@/lib/quotes/config";

export async function listQuotesAction(
  params: QuoteListParams,
): Promise<QuotePage> {
  const orgId = await getDbOrgId();

  try {
    return await getTenantQuotesPage(orgId, params);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "listQuotesAction" },
      extra: { params },
    });
    throw error;
  }
}

type ActionResult =
  | { success: true }
  | { success: false; message: string };
 
export async function updateQuoteStatusAction(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();
 
    await prisma.quote.update({
      where: { id, orgId },   // ← org-scoped
      data: { status },
    });
 
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("updateQuoteStatusAction", error);
    return { success: false, message: "Failed to update status." };
  }
}
 
export async function deleteQuoteAction(id: string): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();
 
    await prisma.quote.delete({
      where: { id, orgId },   // ← org-scoped
    });
 
    revalidatePath("/quotes");
    return { success: true };
  } catch (error) {
    console.error("deleteQuoteAction", error);
    return { success: false, message: "Failed to delete quote." };
  }
}