import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { loadQuotationData } from "@/lib/rateSweep/excel/data";
import { quotationFilename, quotationSpecSchema } from "@/lib/rateSweep/excel/spec";
import { uploadQuotation } from "@/lib/rateSweep/excel/storage";
import { buildQuotationWorkbook } from "@/lib/rateSweep/excel/workbook";
import { recordRateQuotation } from "@/lib/rateQuotations/queries";
import { getActorName, getArenaAuth } from "@/utils/arena-auth";

// ExcelJS and Prisma both need Node. Never edge.
export const runtime = "nodejs";

/**
 * QUOTATION WORKBOOK
 * -----------------------------------------------------------------------------
 * POST /api/rate-sweeps/quotation  { ...QuotationSpec }  ->  .xlsx
 *
 * ── WHY POST FOR A DOWNLOAD ─────────────────────────────────────────────────
 * The spec carries a markup percentage and a list of countries and weights,
 * which is more than belongs in a URL, and an internal-audience file is the
 * whole cost book. A GET would end up in browser history, in server logs, and
 * in anything a user pastes into a chat. POST keeps it in the body.
 *
 * ── ARENA ADMINS ONLY, CHECKED HERE ─────────────────────────────────────────
 * proxy.ts does not cover /api, so the gate is in this handler and cannot be
 * skipped by hitting the URL directly. Admin rather than member because every
 * workbook this builds is a commercial position: a customer file states our
 * markup, and an INTERNAL file is raw carrier cost, which is Arena's buying
 * price and therefore its margin. Same level as wallets and invoices.
 *
 * 404 rather than 403, so an endpoint that only admins may use does not confirm
 * its own existence to a member poking at it.
 *
 * ── THE SPEC IS RE-PARSED SERVER SIDE ───────────────────────────────────────
 * The builder form validates the same schema, but nothing arriving over the
 * wire is trusted to say whether a file is a customer file. A hand-rolled
 * request setting audience to something unexpected, or a customer file at 0%
 * markup, is rejected here rather than rendered.
 *
 * ── EVERY GENERATION IS RECORDED, NOT EVERY FILE IS KEPT ────────────────────
 * A history row is written whichever audience was asked for, because "who
 * produced a cost file, when, with what markup" is worth knowing either way.
 * The FILE is only uploaded for a customer card: an internal workbook is raw
 * vendor cost, and an UploadThing URL is public rather than access-controlled,
 * so storing one trades a permanent leak risk for a convenience. See
 * lib/rateSweep/excel/storage.ts.
 *
 * ── THE DOWNLOAD IS NEVER BLOCKED BY THE BOOKKEEPING ────────────────────────
 * Upload and history failures are reported to Sentry and swallowed. The person
 * clicked a button to get a file; failing to file the paperwork is our problem,
 * and handing them a 500 instead of the workbook they can see was built would
 * be the wrong trade.
 */
export async function POST(req: Request) {
  try {
    const { userId, isArenaAdmin } = await getArenaAuth();
    if (!isArenaAdmin) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = quotationSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "That combination cannot be built.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 422 },
      );
    }

    const spec = parsed.data;
    const data = await loadQuotationData(spec);

    // A workbook of empty grids is worse than an error: it looks like we have
    // no rates rather than like the filters excluded everything.
    if (data.carriers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No rates match those filters. Try more countries, more weights, or allow restricted services.",
        },
        { status: 422 },
      );
    }

    const buffer = await buildQuotationWorkbook(spec, data);
    const filename = quotationFilename(spec);

    const cardNumber = await recordGeneration({
      spec,
      data,
      buffer,
      filename,
      userId,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        // So the builder can tell the person which card number they just made
        // and link them to it, without a second round trip.
        ...(cardNumber ? { "X-Rate-Card-Number": cardNumber } : {}),
        "Access-Control-Expose-Headers": "X-Rate-Card-Number",
        // Priced from our cost book. Never let a proxy or a CDN hold a copy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "rateSweepQuotationRoute" },
    });

    return NextResponse.json(
      { error: "Could not build the workbook." },
      { status: 500 },
    );
  }
}

/**
 * File the paperwork for one generated workbook, and never let it break the
 * download.
 *
 * Returns the card number, or null if the record could not be written. Every
 * failure in here is reported and swallowed: the workbook is already built and
 * the person is waiting for it, so a storage outage should cost us a history
 * row rather than cost them the file.
 *
 * The upload is attempted first and its result is passed into the row, so a
 * customer card never ends up recorded as having no file when it does. If the
 * upload fails the row is still written with a null URL, which reads the same
 * as an internal card in the table — hence the separate Sentry tag, so the
 * difference is visible where it matters.
 */
async function recordGeneration(input: {
  spec: Awaited<ReturnType<typeof quotationSpecSchema.parseAsync>>;
  data: Awaited<ReturnType<typeof loadQuotationData>>;
  buffer: Buffer;
  filename: string;
  userId: string;
}): Promise<string | null> {
  const { spec, data, buffer, filename, userId } = input;

  let stored: { fileUrl: string; fileKey: string; fileSize: number } | null = null;

  if (spec.audience === "CUSTOMER") {
    try {
      stored = await uploadQuotation({
        bytes: buffer,
        fileName: filename,
        audience: spec.audience,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { location: "rateQuotationUpload" },
        extra: { filename, bytes: buffer.byteLength },
      });
      // Also to the server log. Sentry is a no-op in development, and a
      // swallowed failure with nowhere to read it is a failure nobody finds.
      console.error("[rate-card] upload failed", filename, error);
    }
  }

  try {
    const validUntil = new Date(data.capturedAt);
    validUntil.setDate(validUntil.getDate() + spec.validityDays);

    // Cover + summary + terms, plus one per carrier on a by-service file.
    const sheetCount =
      3 + (spec.layout === "BY_SERVICE" ? data.carriers.length : 0);

    const row = await recordRateQuotation({
      runId: data.runId,
      audience: spec.audience,
      layout: spec.layout,
      countryCodes: data.countries.map((country) => country.code),
      weightsKg: data.weights,
      carriers: data.carriers,
      markupPercent: spec.markupPercent,
      validityDays: spec.validityDays,
      validUntil,
      includeDutyUnpaid: spec.includeDutyUnpaid,
      includeRestricted: spec.includeRestricted,
      preparedFor: spec.preparedFor,
      clientId: spec.clientId ?? null,
      generatedByUserId: userId,
      generatedByName: await getActorName(userId),
      fileName: filename,
      fileUrl: stored?.fileUrl ?? null,
      fileKey: stored?.fileKey ?? null,
      fileSize: stored?.fileSize ?? buffer.byteLength,
      carrierCount: data.carriers.length,
      sheetCount,
    });

    return row.cardNumber;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "rateQuotationRecord" },
      extra: { filename, audience: spec.audience },
    });
    console.error("[rate-card] history row not written", filename, error);
    return null;
  }
}
