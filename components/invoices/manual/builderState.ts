"use client";

/**
 * components/invoices/manual/builderState.ts
 *
 * The shape the invoice builder edits, and the pure functions that move it.
 *
 * Kept out of the component so the form stays readable and so the awkward part
 * (turning what a person typed into what the schema wants) is testable and in
 * one place.
 *
 * ── EVERY FIELD IS A STRING ─────────────────────────────────────────────────
 * Amounts, weights and counts are held as the raw text of the input, not as
 * numbers. A number-typed field cannot represent "1." or "" or "0012" while
 * somebody is halfway through typing, and every attempt to make it do so ends
 * with the cursor jumping or a leading zero being eaten. Text goes in, text is
 * edited, and the conversion happens once on the way out through `toPayload`.
 *
 * The live totals panel converts the same way, so what the admin sees while
 * typing is computed from exactly what will be saved.
 */

import { nanoid } from "nanoid";

import { ShipmentMode, TaxMode } from "@/generated/prisma";
import { OUTSIDE_INDIA } from "@/lib/invoices/tax/gst";
import {
  DEFAULT_CURRENCY,
  DEFAULT_PAYMENT_TERM,
  type BillingPartyDefaults,
  type BillingPartyOption,
  type ChargeTypeOption,
  type ManualInvoiceDetail,
  type PresetLine,
} from "@/lib/invoices/manual/config";
import type { ManualChargeInput } from "@/lib/invoices/manual/money";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface ChargeRow {
  /** Client-only. Rows are rewritten on save, so this never reaches the server. */
  key: string;
  chargeTypeId: string | null;
  label: string;
  sacCode: string;
  rate: string;
  quantity: string;
  amount: string;
  discount: string;
  ratePercent: string;
  reimbursement: boolean;
}

/**
 * One end of a lane.
 *
 * `label` is what prints and stays freely editable, because a lane end is
 * sometimes a port, a hub or the customer's own wording and forcing every one
 * through a pincode would block an invoice on a lookup that was never going to
 * succeed. The rest is the structured record the pincode lookup fills, and is
 * what any later lane report has to read.
 *
 * `port` is the airport or seaport code and lives here rather than in the
 * detail disclosure it used to sit in. DEL and DXB describe the two ends of the
 * lane, so asking for them anywhere other than next to the two ends of the lane
 * meant scrolling away from the thing being described to answer a question
 * about it.
 */
export interface RouteEnd {
  label: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  port: string;
}

/** Domestic lanes are India at both ends, and the form never asks otherwise. */
export const HOME_COUNTRY = "India";

export interface ConsignmentRow {
  key: string;
  awbNumber: string;
  mawbNumber: string;
  trackingNumber: string;
  bookingDate: string;
  pickupDate: string;
  origin: RouteEnd;
  destination: RouteEnd;
  serviceType: string;
  productType: string;
  parcelType: string;
  shipMode: string;
  flightNumber: string;
  airlineName: string;
  forwarderName: string;
  subAgent: string;
  pieces: string;
  grossWeightKg: string;
  chargeableWeightKg: string;
  boxCount: string;
  palletCount: string;
  cartonCount: string;
  goodsDescription: string;
  hsnCode: string;
  exportInvoiceNo: string;
  referenceNo: string;
  shipperName: string;
  consigneeName: string;
  containerNumber: string;
  jobNumber: string;
  charges: ChargeRow[];
}

export interface BuilderState {
  party: BillingPartyOption | null;
  mode: ShipmentMode;
  csbCategory: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  reference: string;
  currency: string;
  taxMode: TaxMode;
  reverseCharge: boolean;
  /** Presentation only: whether the SAC column prints on the document. */
  showSacCode: boolean;
  placeOfSupplyCode: string;
  irn: string;
  irnAckNo: string;
  irnAckDate: string;
  notes: string;
  consignments: ConsignmentRow[];
}

// ---------------------------------------------------------------------------
// Making rows
// ---------------------------------------------------------------------------

export function emptyCharge(over: Partial<ChargeRow> = {}): ChargeRow {
  return {
    key: nanoid(8),
    chargeTypeId: null,
    label: "",
    sacCode: "996812",
    rate: "",
    quantity: "1",
    amount: "",
    discount: "",
    ratePercent: "18",
    reimbursement: false,
    ...over,
  };
}

export function chargeFromCatalog(type: ChargeTypeOption): ChargeRow {
  return emptyCharge({
    chargeTypeId: type.id,
    label: type.label,
    sacCode: type.sacCode,
    // A reimbursement carries no GST by definition, so the rate field is
    // pre-emptied rather than showing 18% that the engine would ignore. A
    // number on screen that does not affect the total is a bug report waiting
    // to happen.
    ratePercent: type.defaultReimbursement
      ? "0"
      : String(type.defaultRatePercent),
    reimbursement: type.defaultReimbursement,
  });
}

export function chargeFromPreset(line: PresetLine): ChargeRow {
  return emptyCharge({
    label: line.label,
    sacCode: line.sacCode,
    ratePercent: String(line.ratePercent),
    reimbursement: line.reimbursement,
  });
}

export function emptyRouteEnd(country = HOME_COUNTRY): RouteEnd {
  return { label: "", postalCode: "", city: "", state: "", country, port: "" };
}

/**
 * The printed label for a lane end, composed from whatever the lookup found.
 * "Gurugram, Haryana" domestically; "Dubai, United Arab Emirates" abroad, since
 * a foreign state means nothing to a reader here and repeating India on both
 * ends of a domestic lane locates nothing.
 */
export function composeRouteLabel(end: RouteEnd): string {
  const city = end.city.trim();
  const state = end.state.trim();
  const country = end.country.trim();

  if (!city) return [state, country].filter(Boolean).join(", ");
  if (country && country !== HOME_COUNTRY) return `${city}, ${country}`;

  // "Delhi, Delhi" reads as a data entry error rather than as a place.
  if (state && !city.toLowerCase().includes(state.toLowerCase())) {
    return `${city}, ${state}`;
  }
  return city;
}

/**
 * A fresh consignment for the invoice type being raised.
 *
 * The destination country starts EMPTY on an international invoice, and that
 * is the point rather than an omission: a ZIP means nothing until the country
 * is known, so the picker asks for the country first and has nothing to
 * pre-fill it with. Origin defaults to India because Arena is in India and an
 * import is the rarer of the two.
 */
export function emptyConsignment(
  over: Partial<ConsignmentRow> = {},
  mode: ShipmentMode = ShipmentMode.INTERNATIONAL,
): ConsignmentRow {
  const domestic = mode === ShipmentMode.DOMESTIC;
  return {
    key: nanoid(8),
    awbNumber: "",
    mawbNumber: "",
    trackingNumber: "",
    bookingDate: "",
    pickupDate: "",
    origin: emptyRouteEnd(HOME_COUNTRY),
    destination: emptyRouteEnd(domestic ? HOME_COUNTRY : ""),
    serviceType: "",
    productType: "",
    parcelType: "",
    // Air unless told otherwise on an export, which is what Arena moves;
    // a domestic job is as likely to go by road, so it is left to be chosen.
    shipMode: domestic ? "" : "Air",
    flightNumber: "",
    airlineName: "",
    forwarderName: "",
    subAgent: "",
    pieces: "",
    grossWeightKg: "",
    chargeableWeightKg: "",
    boxCount: "",
    palletCount: "",
    cartonCount: "",
    goodsDescription: "",
    hsnCode: "",
    exportInvoiceNo: "",
    referenceNo: "",
    shipperName: "",
    consigneeName: "",
    containerNumber: "",
    jobNumber: "",
    charges: [emptyCharge()],
    ...over,
  };
}

/**
 * Copy a consignment into a fresh one below it.
 *
 * Keeps the lane, the service and the charges, and drops the identifiers, which
 * are the fields certainly different on the next consignment.
 *
 * Every key is regenerated, including the charge rows'. Reusing them was a real
 * bug: React saw two children with the same key and rendered the copy as a
 * duplicate of the original rather than as its own row.
 */
export function duplicateConsignment(source: ConsignmentRow): ConsignmentRow {
  return {
    ...source,
    key: nanoid(8),
    awbNumber: "",
    mawbNumber: "",
    trackingNumber: "",
    jobNumber: "",
    referenceNo: "",
    origin: { ...source.origin },
    destination: { ...source.destination },
    charges: source.charges.map((charge) => ({ ...charge, key: nanoid(8) })),
  };
}

/**
 * Change the invoice type, and bring the lanes with it.
 *
 * Switching to Domestic pins both ends to India, because a domestic invoice by
 * definition has no other option and leaving "United Arab Emirates" sitting in
 * a field the form no longer shows would print a lane nobody could see to
 * correct. Anything the old country resolved to is cleared with it: a ZIP and a
 * city from Dubai describe nowhere in India.
 *
 * Switching to International leaves both ends exactly as they are. India to
 * India is wrong on most international invoices but right on a domestic leg of
 * an international job, and guessing here would throw away a lane somebody just
 * typed.
 */
export function applyMode(state: BuilderState, mode: ShipmentMode): BuilderState {
  if (mode !== ShipmentMode.DOMESTIC) return { ...state, mode };

  const pin = (end: RouteEnd): RouteEnd =>
    end.country === HOME_COUNTRY
      ? end
      : { ...emptyRouteEnd(HOME_COUNTRY), port: end.port };

  return {
    ...state,
    mode,
    // CSB is an export category. It cannot survive the trip home.
    csbCategory: "",
    // Nor can "Outside India" as a place of supply.
    placeOfSupplyCode:
      state.placeOfSupplyCode === OUTSIDE_INDIA.code
        ? ""
        : state.placeOfSupplyCode,
    consignments: state.consignments.map((c) => ({
      ...c,
      origin: pin(c.origin),
      destination: pin(c.destination),
    })),
  };
}

/** Today, as the yyyy-mm-dd a date input wants, in IST. */
export function todayInput(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  return ist.toISOString().slice(0, 10);
}

function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function emptyState(): BuilderState {
  return {
    party: null,
    mode: ShipmentMode.INTERNATIONAL,
    csbCategory: "",
    issueDate: todayInput(),
    dueDate: "",
    paymentTerms: DEFAULT_PAYMENT_TERM,
    reference: "",
    currency: DEFAULT_CURRENCY,
    taxMode: TaxMode.EXCLUSIVE,
    reverseCharge: false,
    // On unless somebody turns it off. A tax invoice is expected to carry the
    // SAC, so leaving it out is the choice that has to be made deliberately.
    showSacCode: true,
    placeOfSupplyCode: "",
    irn: "",
    irnAckNo: "",
    irnAckDate: "",
    notes: "",
    consignments: [emptyConsignment()],
  };
}

// ---------------------------------------------------------------------------
// Party defaults
// ---------------------------------------------------------------------------

/**
 * Apply what a party was last billed with.
 *
 * Only touches fields the admin has not already set. Picking the customer after
 * choosing USD must not silently put the currency back to rupees: a default is
 * a starting point, and the moment a person has made a decision it stops being
 * one.
 */
export function applyPartyDefaults(
  state: BuilderState,
  party: BillingPartyOption,
  defaults: BillingPartyDefaults | null,
  touched: Set<keyof BuilderState>,
): BuilderState {
  let next: BuilderState = { ...state, party };

  if (party.stateCode && !touched.has("placeOfSupplyCode")) {
    next.placeOfSupplyCode = party.stateCode;
  }
  if (!defaults) return next;

  if (defaults.currency && !touched.has("currency")) {
    next.currency = defaults.currency;
  }
  if (defaults.taxMode && !touched.has("taxMode")) {
    next.taxMode = defaults.taxMode;
  }
  if (defaults.paymentTerms && !touched.has("paymentTerms")) {
    next.paymentTerms = defaults.paymentTerms;
  }
  // Through applyMode, not a plain assignment. A customer last billed for a
  // domestic job pulls the invoice home, and the lanes have to come with it or
  // the form ends up domestic with a Dubai destination it no longer shows.
  if (defaults.mode && !touched.has("mode")) {
    next = applyMode(next, defaults.mode);
  }
  // After the mode, and only if the mode kept it. CSB is an export category, so
  // restoring one onto an invoice applyMode just brought home would undo it.
  if (
    defaults.csbCategory &&
    next.mode === ShipmentMode.INTERNATIONAL &&
    !touched.has("csbCategory")
  ) {
    next.csbCategory = defaults.csbCategory;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Loading an existing draft
// ---------------------------------------------------------------------------

function str(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Zero reads as empty in an optional numeric field, not as "0". */
function optionalNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function stateFromDetail(detail: ManualInvoiceDetail): BuilderState {
  return {
    party: detail.party,
    mode: detail.mode,
    csbCategory: detail.csbCategory ?? "",
    issueDate: dateInput(detail.issueDate),
    dueDate: dateInput(detail.dueDate),
    paymentTerms: detail.paymentTerms ?? DEFAULT_PAYMENT_TERM,
    reference: detail.reference ?? "",
    currency: detail.currency,
    taxMode: detail.taxMode,
    reverseCharge: detail.reverseCharge,
    showSacCode: detail.showSacCode,
    placeOfSupplyCode: detail.placeOfSupplyCode ?? "",
    irn: detail.irn ?? "",
    irnAckNo: detail.irnAckNo ?? "",
    irnAckDate: dateInput(detail.irnAckDate),
    notes: detail.notes ?? "",
    consignments: detail.consignments.map((c) => ({
      key: c.id,
      awbNumber: str(c.awbNumber),
      mawbNumber: str(c.mawbNumber),
      trackingNumber: str(c.trackingNumber),
      bookingDate: dateInput(c.bookingDate),
      pickupDate: dateInput(c.pickupDate),
      origin: {
        label: str(c.origin),
        postalCode: str(c.originPostalCode),
        city: str(c.originCity),
        state: str(c.originState),
        // An older draft saved before the country was captured is India: that
        // is what the single free-text box meant when it was written.
        country: str(c.originCountry) || HOME_COUNTRY,
        port: str(c.originPort),
      },
      destination: {
        label: str(c.destination),
        postalCode: str(c.destinationPostalCode),
        city: str(c.destinationCity),
        state: str(c.destinationState),
        country: str(c.destinationCountry) || HOME_COUNTRY,
        port: str(c.destinationPort),
      },
      serviceType: str(c.serviceType),
      productType: str(c.productType),
      parcelType: str(c.parcelType),
      shipMode: str(c.shipMode),
      flightNumber: str(c.flightNumber),
      airlineName: str(c.airlineName),
      forwarderName: str(c.forwarderName),
      subAgent: str(c.subAgent),
      pieces: optionalNumber(c.pieces),
      grossWeightKg: optionalNumber(c.grossWeightKg),
      chargeableWeightKg: optionalNumber(c.chargeableWeightKg),
      boxCount: optionalNumber(c.boxCount),
      palletCount: optionalNumber(c.palletCount),
      cartonCount: optionalNumber(c.cartonCount),
      // Goods and particulars used to be two fields and are now one. A draft
      // saved under the old shape carries both, so they are joined here rather
      // than the second one quietly disappearing the first time somebody opens
      // and re-saves an old draft. Saving writes the joined text back to
      // goodsDescription and clears particulars; see toPayload.
      goodsDescription: [str(c.goodsDescription), str(c.particulars)]
        .map((v) => v.trim())
        .filter(Boolean)
        .join(". "),
      hsnCode: str(c.hsnCode),
      exportInvoiceNo: str(c.exportInvoiceNo),
      referenceNo: str(c.referenceNo),
      shipperName: str(c.shipperName),
      consigneeName: str(c.consigneeName),
      containerNumber: str(c.containerNumber),
      jobNumber: str(c.jobNumber),
      charges: c.charges.map((charge) => ({
        key: charge.id,
        chargeTypeId: charge.chargeTypeId,
        label: charge.label,
        sacCode: charge.sacCode,
        rate: charge.rate ? String(charge.rate) : "",
        quantity: String(charge.quantity),
        amount: charge.amount ? String(charge.amount) : "",
        discount: charge.discount ? String(charge.discount) : "",
        ratePercent: String(charge.ratePercent),
        reimbursement: charge.reimbursement,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// On the way out
// ---------------------------------------------------------------------------

/** Text to number. Anything unparseable is zero, which the schema then judges. */
export function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInt(value: string): number | null {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A charge row is worth saving once it has a description. An amount of zero is
 * legitimate (a waived line an admin wants shown at nil), an empty row is the
 * one the form always leaves at the bottom for the next entry.
 */
export function isChargeFilled(row: ChargeRow): boolean {
  return row.label.trim().length > 0;
}

/**
 * A consignment survives if it has a charge worth saving or any identifying
 * detail. This is what stops the trailing empty card from being persisted, and
 * what keeps a consignment that is genuinely just an AWB and no charges yet.
 */
export function isConsignmentFilled(row: ConsignmentRow): boolean {
  if (row.charges.some(isChargeFilled)) return true;
  return [
    row.awbNumber,
    row.mawbNumber,
    row.origin.label,
    row.origin.city,
    row.origin.postalCode,
    row.destination.label,
    row.destination.city,
    row.destination.postalCode,
    row.serviceType,
    row.trackingNumber,
    row.jobNumber,
    row.goodsDescription,
    row.hsnCode,
  ].some((v) => v.trim().length > 0);
}

/** The object `manualInvoiceSchema` parses. */
export function toPayload(state: BuilderState) {
  return {
    billingPartyId: state.party?.id ?? "",
    docType: "TAX_INVOICE" as const,
    mode: state.mode,
    csbCategory: blankToNull(state.csbCategory),
    issueDate: state.issueDate,
    dueDate: blankToNull(state.dueDate),
    paymentTerms: blankToNull(state.paymentTerms),
    reference: blankToNull(state.reference),
    currency: state.currency,
    taxMode: state.taxMode,
    reverseCharge: state.reverseCharge,
    showSacCode: state.showSacCode,
    placeOfSupplyCode: blankToNull(state.placeOfSupplyCode),
    irn: blankToNull(state.irn),
    irnAckNo: blankToNull(state.irnAckNo),
    irnAckDate: blankToNull(state.irnAckDate),
    irnQrData: null,
    notes: blankToNull(state.notes),
    termsOverride: null,
    consignments: state.consignments.filter(isConsignmentFilled).map((c) => ({
      awbNumber: blankToNull(c.awbNumber),
      mawbNumber: blankToNull(c.mawbNumber),
      trackingNumber: blankToNull(c.trackingNumber),
      bookingDate: blankToNull(c.bookingDate),
      pickupDate: blankToNull(c.pickupDate),
      // The label falls back to the composed one, so an admin who typed only a
      // pincode still gets a readable lane on the document rather than a blank.
      origin: blankToNull(c.origin.label) ?? blankToNull(composeRouteLabel(c.origin)),
      originPostalCode: blankToNull(c.origin.postalCode),
      originCity: blankToNull(c.origin.city),
      originState: blankToNull(c.origin.state),
      originCountry: blankToNull(c.origin.country),
      destination:
        blankToNull(c.destination.label) ??
        blankToNull(composeRouteLabel(c.destination)),
      destinationPostalCode: blankToNull(c.destination.postalCode),
      destinationCity: blankToNull(c.destination.city),
      destinationState: blankToNull(c.destination.state),
      destinationCountry: blankToNull(c.destination.country),
      serviceType: blankToNull(c.serviceType),
      productType: blankToNull(c.productType),
      parcelType: blankToNull(c.parcelType),
      shipMode: blankToNull(c.shipMode),
      originPort: blankToNull(c.origin.port),
      destinationPort: blankToNull(c.destination.port),
      flightNumber: blankToNull(c.flightNumber),
      airlineName: blankToNull(c.airlineName),
      forwarderName: blankToNull(c.forwarderName),
      subAgent: blankToNull(c.subAgent),
      pieces: toOptionalInt(c.pieces),
      grossWeightKg: toOptionalNumber(c.grossWeightKg),
      chargeableWeightKg: toOptionalNumber(c.chargeableWeightKg),
      boxCount: toOptionalInt(c.boxCount),
      palletCount: toOptionalInt(c.palletCount),
      cartonCount: toOptionalInt(c.cartonCount),
      goodsDescription: blankToNull(c.goodsDescription),
      hsnCode: blankToNull(c.hsnCode),
      // Always null now. The column stays on the model so an invoice ISSUED
      // under the old two-field shape still renders the text it was issued
      // with, but nothing writes to it again.
      particulars: null,
      exportInvoiceNo: blankToNull(c.exportInvoiceNo),
      referenceNo: blankToNull(c.referenceNo),
      shipperName: blankToNull(c.shipperName),
      consigneeName: blankToNull(c.consigneeName),
      containerNumber: blankToNull(c.containerNumber),
      jobNumber: blankToNull(c.jobNumber),
      notes: null,
      charges: c.charges.filter(isChargeFilled).map((charge) => ({
        chargeTypeId: charge.chargeTypeId,
        label: charge.label.trim(),
        sacCode: charge.sacCode.trim() || "996812",
        rate: toNumber(charge.rate),
        quantity: charge.quantity.trim() === "" ? 1 : toNumber(charge.quantity),
        amount: toNumber(charge.amount),
        discount: toNumber(charge.discount),
        ratePercent: toNumber(charge.ratePercent),
        reimbursement: charge.reimbursement,
        notes: null,
      })),
    })),
  };
}

/**
 * The same rows the money engine will see, for the live totals panel. Computed
 * from the builder state rather than from a server response so the figures move
 * as the admin types, with no round trip.
 */
export function toMoneyLines(state: BuilderState): ManualChargeInput[] {
  return state.consignments.flatMap((c, index) =>
    c.charges.filter(isChargeFilled).map((charge) => ({
      label: charge.label.trim(),
      sacCode: charge.sacCode.trim() || "996812",
      rate: toNumber(charge.rate),
      quantity: charge.quantity.trim() === "" ? 1 : toNumber(charge.quantity),
      amount: toNumber(charge.amount),
      discount: toNumber(charge.discount),
      ratePercent: toNumber(charge.ratePercent),
      reimbursement: charge.reimbursement,
      consignmentIndex: index,
    })),
  );
}

/** Net of one consignment, for the subtotal shown on its card. */
export function consignmentNet(row: ConsignmentRow): number {
  return row.charges
    .filter(isChargeFilled)
    .reduce(
      (sum, c) => sum + Math.max(0, toNumber(c.amount) - toNumber(c.discount)),
      0,
    );
}
