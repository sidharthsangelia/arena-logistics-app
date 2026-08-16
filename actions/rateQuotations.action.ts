"use server";

/**
 * actions/rateQuotations.action.ts
 *
 * Reads for the generated rate-card history.
 *
 * Gated on Arena ADMIN, not membership, and the gate is not decoration: these
 * rows name the carriers we buy from, state the markup on every customer card,
 * and link straight to the files. That is Arena's commercial position, which is
 * the same line wallets and invoices sit behind. Route gating in proxy.ts does
 * not cover a server action, which is reachable by a direct POST from any
 * signed-in session, so the real check is here.
 *
 * This file is "use server", so it exports async functions only. The row shape
 * and sort vocabulary live in lib/rateQuotations/config.ts.
 */

import * as Sentry from "@sentry/nextjs";

import { getRateQuotationsPage } from "@/lib/rateQuotations/queries";
import { requireArenaAdmin } from "@/utils/arena-auth";
import type {
  RateQuotationListParams,
  RateQuotationPage,
} from "@/lib/rateQuotations/config";

export async function listRateQuotationsAction(
  params: RateQuotationListParams,
): Promise<RateQuotationPage> {
  await requireArenaAdmin();

  try {
    return await getRateQuotationsPage(params);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "listRateQuotationsAction" },
      extra: { params },
    });
    throw error;
  }
}
