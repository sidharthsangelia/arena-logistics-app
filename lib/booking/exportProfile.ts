/**
 * WHO IS EXPORTING, AND UNDER WHAT PAPERS?
 * -----------------------------------------------------------------------------
 * Resolves the IEC, AD code, GSTIN and LUT that go on an international booking.
 *
 * THE PRECEDENCE, AND WHY IT IS THIS WAY ROUND
 *
 *     shipment override  →  client  →  org
 *
 * The CLIENT wins over the org because for a BA org booking on behalf of a
 * client, the client is the party legally exporting. Putting the BA's IEC on
 * their customer's consignment would file the export under the wrong entity,
 * which is a compliance problem long after it stops being a software one.
 *
 * The SHIPMENT OVERRIDE wins over both because a single consignment sometimes
 * needs different papers from the party's standing profile — a one-off moving
 * under bond when everything else goes under the LUT, say. Ops set it on the
 * booking page before a retry.
 *
 * Field-by-field, not object-by-object. A client that has an IEC but no AD code
 * should still inherit the org's AD code rather than losing it because the
 * client record "won". Merging whole objects is how a half-filled profile
 * silently blanks a complete one.
 *
 * NOTHING HERE THROWS. It reports what it found, including nothing. Deciding
 * whether a missing field is fatal belongs to the vendor adapter's preflight,
 * because only the vendor knows what it actually requires: Shipmozo needs an
 * AD code, sKart does not ask for one.
 */

import type { ExportType, Incoterms } from "@/generated/prisma";
import type { IntlExporterProfile } from "@/lib/booking-adapters/core/intl.types";

/** The columns this module reads off an Org or a Client. */
export interface ExportProfileSource {
  gstin?: string | null;
  iecNumber?: string | null;
  adCode?: string | null;
  lutNumber?: string | null;
  lutIssueDate?: Date | null;
  lutTillDate?: Date | null;
  iossNumber?: string | null;
  defaultIncoterms?: Incoterms | null;
  defaultExportType?: ExportType | null;
}

/**
 * The shape of Shipment.exportProfileOverride.
 *
 * Json rather than columns because it is set on a handful of rows in a hundred,
 * and thirteen mostly-null columns on the busiest table in the schema buys
 * nothing. Dates are strings here: it has been through JSON.
 */
export interface ExportProfileOverride {
  gstin?: string | null;
  iecNumber?: string | null;
  adCode?: string | null;
  lutNumber?: string | null;
  /** yyyy-mm-dd. */
  lutIssueDate?: string | null;
  /** yyyy-mm-dd. */
  lutTillDate?: string | null;
  iossNumber?: string | null;
  incoterms?: Incoterms | null;
  exportType?: ExportType | null;
}

export interface ResolvedExportProfile extends IntlExporterProfile {
  incoterms: "DDP" | "DDU";
  exportType: "BOND" | "UT" | "NA";
  /** Where each populated field came from. For the ops screen and for support. */
  sources: Record<string, "override" | "client" | "org">;
}

// ---------------------------------------------------------------------------

/** Trimmed, or null. An empty string is not a value, it is an unfilled form. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Date → yyyy-mm-dd, the format every vendor in this codebase asks for. */
function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Prisma's ExportType is LUT | BOND | NA; the vendors call the LUT case "UT".
 * Translated here, once, rather than in each mapper.
 */
function toVendorExportType(value: ExportType | null | undefined): "BOND" | "UT" | "NA" {
  if (value === "BOND") return "BOND";
  if (value === "LUT") return "UT";
  return "NA";
}

// ---------------------------------------------------------------------------

export function resolveExportProfile(input: {
  org: ExportProfileSource | null;
  client: ExportProfileSource | null;
  override: ExportProfileOverride | null;
}): ResolvedExportProfile {
  const sources: ResolvedExportProfile["sources"] = {};

  /** First non-null of override → client → org, remembering which one it was. */
  function pick(
    field: string,
    fromOverride: string | null,
    fromClient: string | null,
    fromOrg: string | null,
  ): string | null {
    if (fromOverride) {
      sources[field] = "override";
      return fromOverride;
    }
    if (fromClient) {
      sources[field] = "client";
      return fromClient;
    }
    if (fromOrg) {
      sources[field] = "org";
      return fromOrg;
    }
    return null;
  }

  const { org, client, override } = input;

  const iecNumber = pick(
    "iecNumber",
    clean(override?.iecNumber),
    clean(client?.iecNumber),
    clean(org?.iecNumber),
  );
  const adCode = pick(
    "adCode",
    clean(override?.adCode),
    clean(client?.adCode),
    clean(org?.adCode),
  );
  const gstin = pick(
    "gstin",
    clean(override?.gstin),
    clean(client?.gstin),
    clean(org?.gstin),
  );
  const iossNumber = pick(
    "iossNumber",
    clean(override?.iossNumber),
    clean(client?.iossNumber),
    clean(org?.iossNumber),
  );

  // The LUT's number and its two dates move together. A number from the client
  // paired with dates from the org would describe a document that does not
  // exist, and an expired LUT is refused at the border, so whichever party
  // supplies the NUMBER supplies its dates too.
  let lutNumber: string | null = null;
  let lutIssueDate: string | null = null;
  let lutTillDate: string | null = null;

  if (clean(override?.lutNumber)) {
    sources.lutNumber = "override";
    lutNumber = clean(override?.lutNumber);
    lutIssueDate = isoDate(override?.lutIssueDate);
    lutTillDate = isoDate(override?.lutTillDate);
  } else if (clean(client?.lutNumber)) {
    sources.lutNumber = "client";
    lutNumber = clean(client?.lutNumber);
    lutIssueDate = isoDate(client?.lutIssueDate);
    lutTillDate = isoDate(client?.lutTillDate);
  } else if (clean(org?.lutNumber)) {
    sources.lutNumber = "org";
    lutNumber = clean(org?.lutNumber);
    lutIssueDate = isoDate(org?.lutIssueDate);
    lutTillDate = isoDate(org?.lutTillDate);
  }

  const incotermsValue =
    override?.incoterms ?? client?.defaultIncoterms ?? org?.defaultIncoterms ?? "DDP";
  sources.incoterms = override?.incoterms
    ? "override"
    : client?.defaultIncoterms
      ? "client"
      : "org";

  const exportTypeValue =
    override?.exportType ?? client?.defaultExportType ?? org?.defaultExportType ?? null;
  sources.exportType = override?.exportType
    ? "override"
    : client?.defaultExportType
      ? "client"
      : "org";

  return {
    iecNumber,
    adCode,
    gstin,
    lutNumber,
    lutIssueDate,
    lutTillDate,
    iossNumber,
    incoterms: incotermsValue === "DDU" ? "DDU" : "DDP",
    exportType: toVendorExportType(exportTypeValue),
    sources,
  };
}

// ---------------------------------------------------------------------------

/** The export-profile columns as the settings form wants them: all strings. */
export interface ExportProfileFormShape {
  iecNumber: string;
  adCode: string;
  lutNumber: string;
  lutIssueDate: string;
  lutTillDate: string;
  iossNumber: string;
  incoterms: "DDP" | "DDU";
  exportType: "LUT" | "BOND" | "NA";
}

/**
 * One party's stored columns → the shape the form edits.
 *
 * NOT the same mapping as resolveExportProfile, and deliberately so. That one
 * answers "what papers does this BOOKING go out under", merging three parties;
 * this one answers "what has THIS party told us", with no inheritance at all.
 * Showing an org's IEC in a client's form would invite someone to save it onto
 * the client and file every future export under the wrong entity.
 *
 * `exportType` stays in Prisma's vocabulary (LUT) rather than the vendors' (UT),
 * because this round-trips through a form back into the same column.
 */
export function toExportProfileForm(
  source: ExportProfileSource | null,
): ExportProfileFormShape {
  return {
    iecNumber: source?.iecNumber ?? "",
    adCode: source?.adCode ?? "",
    lutNumber: source?.lutNumber ?? "",
    lutIssueDate: isoDate(source?.lutIssueDate) ?? "",
    lutTillDate: isoDate(source?.lutTillDate) ?? "",
    iossNumber: source?.iossNumber ?? "",
    incoterms: source?.defaultIncoterms === "DDU" ? "DDU" : "DDP",
    exportType:
      source?.defaultExportType === "LUT"
        ? "LUT"
        : source?.defaultExportType === "BOND"
          ? "BOND"
          : "NA",
  };
}

/**
 * Has this party given us anything at all?
 *
 * Drives the "not added yet" state on the settings row. The two declaration
 * fields are ignored on purpose: they always hold a value, so counting them
 * would make an untouched profile look filled in.
 */
export function hasAnyExportDetail(source: ExportProfileSource | null): boolean {
  return Boolean(
    source?.iecNumber ||
      source?.adCode ||
      source?.lutNumber ||
      source?.iossNumber,
  );
}

// ---------------------------------------------------------------------------

/**
 * Is the LUT still valid on the day we are booking?
 *
 * An expired LUT is worse than an absent one: the shipment goes out declaring
 * zero-rated relief the exporter no longer holds, and the correction lands
 * months later as a tax demand. Checked at preflight by adapters whose vendor
 * takes LUT details.
 *
 * `today` is injected so this is testable without freezing the clock.
 */
export function isLutExpired(
  profile: Pick<ResolvedExportProfile, "lutNumber" | "lutTillDate">,
  today: Date = new Date(),
): boolean {
  if (!profile.lutNumber || !profile.lutTillDate) return false;
  const till = new Date(`${profile.lutTillDate}T23:59:59.999Z`);
  if (Number.isNaN(till.getTime())) return false;
  return till.getTime() < today.getTime();
}

/**
 * Which of the named fields the profile is missing, as human-readable labels.
 *
 * Adapters call this from preflight with their own required set, so the failure
 * the customer's booking records is "Your IEC number is missing" rather than a
 * vendor's 422. That difference is the whole reason preflight exists.
 */
const FIELD_LABELS: Record<string, string> = {
  iecNumber: "IEC number",
  adCode: "AD code",
  gstin: "GSTIN",
  lutNumber: "LUT number",
  iossNumber: "IOSS number",
};

export function missingExportFields(
  profile: ResolvedExportProfile,
  required: (keyof IntlExporterProfile)[],
): string[] {
  return required
    .filter((field) => !profile[field])
    .map((field) => FIELD_LABELS[field] ?? String(field));
}

// ---------------------------------------------------------------------------

/**
 * WHICH PAPERS THIS PARTICULAR CONSIGNMENT CANNOT GO WITHOUT
 * -----------------------------------------------------------------------------
 * The rule adapters enforce at preflight. Pure, and here rather than inside an
 * adapter, for two reasons: it is INDIAN CUSTOMS PRACTICE rather than any one
 * vendor's contract, so every vendor wants the same answer; and a rule this
 * consequential should sit where a test can reach it.
 *
 * ── THE RULE, AND WHAT IT REPLACED ──────────────────────────────────────────
 * An earlier version demanded an IEC and an AD code on EVERY export, on the
 * belief that Shipmozo rejected consignments without them. It does not:
 * vendor-api-docs/shipmozo.json marks none of the 42 fields on
 * international-push-order as required, and iec_number, ad_code and lut_number
 * all default to empty. That mistaken rule blocked every international booking
 * Arena had, which is what this function exists to correct.
 *
 * What genuinely applies:
 *
 *   CSB-IV — the courier shipping bill for low-value exports, and the route
 *            most consignments take. It exists so that small exports can go
 *            WITHOUT an IEC, so nothing is required. Values on file are still
 *            sent: an exporter who has an IEC belongs on their own paperwork.
 *
 *   CSB-V / COMMERCIAL — a full shipping bill. Customs needs the IEC to
 *            identify the exporter and the AD code to tie the consignment to
 *            the bank the proceeds return to. Filed without them, it is stopped
 *            at the port, which is far worse than being stopped before booking.
 *
 *   LUT    — tax rather than customs, so it applies on every route. Claiming
 *            zero-rated relief requires actually holding the Letter of
 *            Undertaking being claimed under, so it is required exactly when the
 *            export is declared as moving under one.
 *
 * Returns human-readable labels, in the order a person would fix them.
 */
export function missingExportPapers(input: {
  /** The customs route. Defaults to the low-value courier one. */
  shipmentType: "CSB4" | "CSB5" | "COMMERCIAL" | null | undefined;
  /** Vendor vocabulary: UT is the LUT case. */
  exportType: "BOND" | "UT" | "NA";
  exporter: Pick<IntlExporterProfile, "iecNumber" | "adCode" | "lutNumber">;
}): string[] {
  const missing: string[] = [];

  if (requiresFullExportIdentity(input.shipmentType)) {
    if (!input.exporter.iecNumber) missing.push(FIELD_LABELS.iecNumber);
    if (!input.exporter.adCode) missing.push(FIELD_LABELS.adCode);
  }

  if (input.exportType === "UT" && !input.exporter.lutNumber) {
    missing.push(FIELD_LABELS.lutNumber);
  }

  return missing;
}

/**
 * Does this route file a full shipping bill?
 *
 * CSB-IV does not, and that is the whole point of it. Anything else does, and an
 * unrecognised value is treated as CSB-IV because that is the schema default and
 * the conservative reading is the one that does not invent a compliance claim.
 */
export function requiresFullExportIdentity(
  shipmentType: "CSB4" | "CSB5" | "COMMERCIAL" | null | undefined,
): boolean {
  return shipmentType === "CSB5" || shipmentType === "COMMERCIAL";
}
