/**
 * app/api/document-vault/admin/route.ts
 *
 * GET /api/document-vault/admin?page=&pageSize=&sort=&dir=&docType=&q=
 *
 * The company-side document vault list, across every tenant org.
 *
 * ── WHY A ROUTE HANDLER AND NOT A SERVER ACTION ─────────────────────────────
 * This list was read through a server action called from react-query. That works,
 * but server actions are POSTs and Next.js runs them one at a time per client:
 * a second action waits for the first to finish. On a table where typing in the
 * search box, changing a filter and paging can all be in flight at once, each
 * keystroke queued behind the request before it, so the last one — the only one
 * whose result is wanted — started last.
 *
 * A GET does none of that. Requests run concurrently, the browser cancels one
 * that react-query aborts when its query key changes, and the response can carry
 * cache headers. That matters more here than anywhere else in the app, because
 * every control on this table is server-driven.
 *
 * Writes stay as server actions. They are mutations, they benefit from being
 * serialised, and they get revalidation for free.
 *
 * ── AUTHORISATION ───────────────────────────────────────────────────────────
 * There is deliberately no org filter on this query: it spans every business
 * associate's KYC paperwork, which is the entire point of the screen and also
 * exactly why it cannot be left open. Route matching in proxy.ts is an optimistic
 * check, not authorisation, and a GET to this path is reachable by any signed-in
 * session. So it gates on Arena membership itself, the same as the action it
 * replaced.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getAdminVaultPage } from "@/lib/documentVault/adminQueries";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  VAULT_PAGE_SIZE_OPTIONS,
  coerceAdminVaultSortField,
  coerceVaultDocTypeFilter,
  DEFAULT_VAULT_PAGE_SIZE,
} from "@/lib/documentVault/config";

export async function GET(req: NextRequest) {
  const { isArenaMember } = await getArenaAuth();
  if (!isArenaMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;

  // Everything below arrives from a URL anyone can edit, so nothing is trusted.
  // Malformed values fall back to the same defaults the query itself would pick
  // rather than throwing, which keeps a hand-edited link from 500ing.
  const pageRaw = Number(sp.get("page"));
  const pageSizeRaw = Number(sp.get("pageSize"));
  const search = sp.get("q")?.trim() ?? "";

  try {
    const result = await getAdminVaultPage({
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
      pageSize: (VAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
        ? pageSizeRaw
        : DEFAULT_VAULT_PAGE_SIZE,
      sortField: coerceAdminVaultSortField(sp.get("sort")),
      sortDir: sp.get("dir") === "asc" ? "asc" : "desc",
      docType: coerceVaultDocTypeFilter(sp.get("docType")),
      search: search || undefined,
    });

    // Private, because the response is scoped to who is asking. no-store rather
    // than a short max-age: the rows are KYC paperwork and a shared or proxy
    // cache holding them is not a trade worth making for a query that costs one
    // round trip. react-query's own staleTime already absorbs the repeat views.
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "GET /api/document-vault/admin" },
      extra: { url: req.nextUrl.toString() },
    });
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}
