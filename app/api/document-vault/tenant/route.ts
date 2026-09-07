/**
 * app/api/document-vault/tenant/route.ts
 *
 * GET /api/document-vault/tenant?page=&pageSize=&sort=&dir=&docType=&q=
 *
 * A tenant's own client-document vault. The Arena-wide counterpart lives at
 * ../admin/route.ts, and the reasoning for both being GETs rather than server
 * actions is written up there.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 * The org is resolved from the session through getDbOrgId() and is never read
 * from the query string, so no caller can widen its own scope by editing the
 * URL. That is the same guarantee the server action gave and it has to survive
 * the move: a GET is if anything easier to hand-edit than a POST body.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getDbOrgId } from "@/utils/tenant";
import { getTenantVaultPage } from "@/lib/documentVault/tenantQueries";
import {
  DEFAULT_VAULT_PAGE_SIZE,
  VAULT_PAGE_SIZE_OPTIONS,
  coerceVaultDocTypeFilter,
  coerceVaultSortField,
} from "@/lib/documentVault/config";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const pageRaw = Number(sp.get("page"));
  const pageSizeRaw = Number(sp.get("pageSize"));
  const search = sp.get("q")?.trim() ?? "";

  // Deliberately outside the try. getDbOrgId redirects an unonboarded session,
  // and redirect() signals that by throwing a control-flow error that Next.js is
  // meant to catch. Swallowing it here would turn "you need to finish onboarding"
  // into a 500.
  const orgId = await getDbOrgId();

  try {
    const result = await getTenantVaultPage(orgId, {
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
      pageSize: (VAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
        ? pageSizeRaw
        : DEFAULT_VAULT_PAGE_SIZE,
      sortField: coerceVaultSortField(sp.get("sort")),
      sortDir: sp.get("dir") === "asc" ? "asc" : "desc",
      docType: coerceVaultDocTypeFilter(sp.get("docType")),
      search: search || undefined,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "GET /api/document-vault/tenant" },
      extra: { url: req.nextUrl.toString() },
    });
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}
