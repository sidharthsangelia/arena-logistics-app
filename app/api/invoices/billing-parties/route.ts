/**
 * app/api/invoices/billing-parties/route.ts
 *
 * GET /api/invoices/billing-parties?page=&pageSize=&sort=&dir=&filter=&kind=&q=
 *
 * Everyone Arena raises an invoice to. The reasoning for reading this as a GET
 * rather than a server action is written up in ../feed/route.ts.
 *
 * Admin-only: this is who owes money.
 */

import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getBillingPartiesPage } from "@/lib/invoices/manual/queries";
import { ArenaForbiddenError, requireArenaAdmin } from "@/utils/arena-auth";
import { BillingPartyKind } from "@/generated/prisma";
import {
  coerceBillingPartyFilter,
  coerceBillingPartyPageSize,
  coerceBillingPartySortField,
} from "@/lib/invoices/manual/config";

/** "" and anything unrecognised mean "every kind", matching the table's "ALL". */
function readKind(value: string | null): BillingPartyKind | null {
  return value && value in BillingPartyKind
    ? (value as BillingPartyKind)
    : null;
}

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
  const pageRaw = Number(sp.get("page"));
  const search = sp.get("q")?.trim() ?? "";

  try {
    const result = await getBillingPartiesPage({
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
      pageSize: coerceBillingPartyPageSize(Number(sp.get("pageSize"))),
      sortField: coerceBillingPartySortField(sp.get("sort")),
      sortDir: sp.get("dir") === "asc" ? "asc" : "desc",
      filter: coerceBillingPartyFilter(sp.get("filter")),
      kind: readKind(sp.get("kind")),
      search: search || undefined,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "GET /api/invoices/billing-parties" },
      extra: { url: req.nextUrl.toString() },
    });
    return NextResponse.json({ error: "Failed to load customers" }, { status: 500 });
  }
}
