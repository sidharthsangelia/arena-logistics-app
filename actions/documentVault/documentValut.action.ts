"use server";

/**
 * actions/documentVault/documentValut.action.ts
 *
 * The read behind a tenant's own client-document vault.
 *
 * The org is resolved here through getDbOrgId() and is never a parameter, so no
 * caller can widen its own scope. The row shape and the sort/filter vocabulary
 * live in lib/documentVault/config.ts, because this file is "use server" and may
 * export functions only.
 */

import * as Sentry from "@sentry/nextjs";

import { getDbOrgId } from "@/utils/tenant";
import { getTenantVaultPage } from "@/lib/documentVault/tenantQueries";
import type { VaultListParams, VaultPage } from "@/lib/documentVault/config";

export async function listVaultDocumentsAction(
  params: VaultListParams,
): Promise<VaultPage> {
  const orgId = await getDbOrgId();

  try {
    return await getTenantVaultPage(orgId, params);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "listVaultDocumentsAction" },
      extra: { params },
    });
    throw error;
  }
}
