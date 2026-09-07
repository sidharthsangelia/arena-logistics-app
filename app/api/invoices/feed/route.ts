/**
 * app/api/invoices/feed/route.ts
 *
 * GET /api/invoices/feed?page=&pageSize=&sort=&dir=&status=&kind=&orgId=&q=
 *
 * The Arena admin invoice list: booking invoices, invoices raised by hand and
 * bills uploaded from outside, merged into one page. lib/invoices/admin/feed.ts
 * explains how three tables become one ordered result.
 *
 * ── WHY A GET ───────────────────────────────────────────────────────────────
 * This table has a search box, a status filter, a kind switch, an organisation
 * picker and a pager, and any of them can be moved while another request is
 * still in flight. Read through a server action, those requests queued: Next.js
 * runs actions one at a time per client, so the last thing typed was the last
 * thing sent. As a GET they overlap, and react-query's signal aborts the ones
 * whose answer is already stale.
 *
 * Writes — marking paid, cancelling, editing — stay as server actions.
 *
 * ── AUTHORISATION ───────────────────────────────────────────────────────────
 * This spans every organisation and states what each of them owes, so it is
 * admin-only without exception. requireArenaAdmin throws rather than returning,
 * so the 403 below is produced by catching that specific error; anything else is
 * a genuine failure and is reported.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getAdminInvoiceFeed } from "@/lib/invoices/admin/feed";
import { ArenaForbiddenError, requireArenaAdmin } from "@/utils/arena-auth";
import {
  coerceAdminInvoiceKindFilter,
  coerceAdminInvoiceSortField,
  coerceAdminInvoiceStatusFilter,
} from "@/lib/invoices/admin/config";
import {
  coerceInvoicePage,
  coerceInvoicePageSize,
} from "@/lib/invoices/config";

export async function GET(req: NextRequest) {
  try {
    await requireArenaAdmin();
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("q")?.trim() ?? "";
  const orgId = sp.get("orgId")?.trim() ?? "";

  try {
    const result = await getAdminInvoiceFeed({
      page: coerceInvoicePage(Number(sp.get("page"))),
      pageSize: coerceInvoicePageSize(Number(sp.get("pageSize"))),
      sortField: coerceAdminInvoiceSortField(sp.get("sort")),
      sortDir: sp.get("dir") === "asc" ? "asc" : "desc",
      statusFilter: coerceAdminInvoiceStatusFilter(sp.get("status")),
      kindFilter: coerceAdminInvoiceKindFilter(sp.get("kind")),
      orgId: orgId || null,
      search: search || undefined,
    });

    // Private and unstored: these rows say what every customer owes.
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "GET /api/invoices/feed" },
      extra: { url: req.nextUrl.toString() },
    });
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}
