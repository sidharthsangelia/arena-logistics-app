"use server";

/**
 * actions/documentVault/documentVaultAdmin.action.ts
 *
 * The company-side document vault read, across every tenant org. Unlike
 * getVaultDocumentsAction (tenant-scoped) this deliberately does not filter by
 * org, so ops can search every business associate's KYC paperwork from one place.
 *
 * Because of that, it is gated on Arena membership. Route gating in proxy.ts is
 * not enough: a server action is reachable by a direct POST from any signed-in
 * session, which would otherwise hand a tenant user every other tenant's KYC
 * documents.
 *
 * This file is "use server", so it exports functions only. The row shape and the
 * sort/filter vocabulary live in lib/documentVault/config.ts.
 */

import * as Sentry from "@sentry/nextjs";

import { getAdminVaultPage } from "@/lib/documentVault/adminQueries";
import { requireArenaMember } from "@/utils/arena-auth";
import type {
  AdminVaultListParams,
  AdminVaultPage,
} from "@/lib/documentVault/config";

export async function listAllVaultDocumentsAction(
  params: AdminVaultListParams,
): Promise<AdminVaultPage> {
  await requireArenaMember();

  try {
    return await getAdminVaultPage(params);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "listAllVaultDocumentsAction" },
      extra: { params },
    });
    throw error;
  }
}
