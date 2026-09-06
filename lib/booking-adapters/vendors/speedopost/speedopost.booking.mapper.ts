/**
 * SPEEDOPOST BOOKING MAPPER
 * -----------------------------------------------------------------------------
 * Canonical booking request → SpeedoPost payloads. Pure functions, no fetch, no
 * `server-only`, so every decision that ends up on a real consignment can be
 * unit tested (utils/speedopostBookingPayload.test.ts) instead of discovered
 * from a parcel that went to the wrong place.
 *
 * Four things here carry the risk, and each is stated once, where it happens:
 *
 *   • THE PROVIDER CODE IS NOT OPTIONAL. SpeedoPost treats a missing
 *     `serviceProviderCode` as permission to pick a courier at random, and
 *     reports success. Dropping that field ships the parcel on a carrier nobody
 *     chose at a price nobody quoted. `buildCreateOrderPayload` refuses to
 *     build a payload without it.
 *
 *   • TWO DATE FORMATS IN ONE BOOKING. `CreateOrder.pickupDate` is DD-MM-YYYY
 *     and `CreatePickupRequest.pickupDate` is YYYY-MM-DD. There is deliberately
 *     no shared date helper: one formatter used in both places is a bug waiting
 *     for whichever endpoint is called second.
 *
 *   • THEIR CLOCK IS IST, OURS IS UTC. CreatePickupRequest validates against
 *     the past. A slot computed in UTC is in the past at their end for most of
 *     the Indian working day, so the slot is computed in IST. See
 *     speedoPostPickupSlot.
 *
 *   • THE WAREHOUSE IS KEYED BY NAME. `CreateWarehouse` returns an id that
 *     nothing accepts; orders and pickups both address a warehouse by
 *     `warehouseName`. So the name has to be unique across our whole SpeedoPost
 *     account, forever, and derived from something we already own rather than
 *     from anything a customer types. See speedoPostWarehouseName.
 */

import type {
  SpeedoPostCreateOrderPayload,
  SpeedoPostCreatePickupPayload,
  SpeedoPostCreateWarehousePayload,
  SpeedoPostOrderDimension,
  SpeedoPostOrderType,
} from "@/lib/speedopost/types";
import type { CanonicalBookingRequest } from "../../core/types";

/**
 * Goods value above which SpeedoPost requires an e-way bill number on the order.
 *
 * Deliberately the same figure as `EWAY_BILL_THRESHOLD` in
 * lib/booking/domesticDocs.ts, which is where the wizard asks for the number,
 * and deliberately NOT imported from it: that constant is the GST rule and this
 * one is SpeedoPost's, they happen to agree today, and importing would hide the
 * day they stop. If SpeedoPost moves theirs, this is the only line that changes.
 *
 * Because the wizard collects at the same threshold, the refusal below should
 * never fire on a booking made through it. It catches a row written before the
 * field existed, or by another path.
 */
export const EWAYBILL_THRESHOLD_INR = 50_000;

/** Bad booking data, not a bad connection. Never worth a retry. */
export class SpeedoPostBookingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeedoPostBookingDataError";
  }
}

// --- WAREHOUSE ----------------------------------------------------------------

/**
 * The pickup location's name at SpeedoPost, which is also its primary key.
 *
 * DERIVED FROM THE SHIPMENT NUMBER, NOT THE ADDRESS. SpeedoPost publishes no
 * way to list or fetch warehouses, so we can never ask what a name currently
 * points at; the only safe naming scheme is one that cannot collide in the
 * first place. Shipment numbers are a single global series (ARN + month + a
 * counter), so one warehouse per booking is collision-proof by construction,
 * and a bare "Head Office" from two different tenants can never end up
 * shipping one customer's parcel from another customer's dock.
 *
 * It also makes the name meaningful in their panel: an ops person looking at a
 * warehouse there can read which booking created it without opening anything.
 *
 * The same input always gives the same name, which is what lets a retry after a
 * lost CreateWarehouse response address the warehouse that already exists
 * instead of registering a second one.
 */
export function speedoPostWarehouseName(request: CanonicalBookingRequest): string {
  const base = request.displayReference.trim() || request.reference.trim();
  const safe = base.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  // Truncated because their maximum length is undocumented. 40 characters is
  // comfortably longer than any shipment number we issue and short enough that
  // no plausible limit rejects it.
  return (safe || "ARENA").slice(0, 40);
}

export function buildWarehousePayload(
  request: CanonicalBookingRequest,
): SpeedoPostCreateWarehousePayload {
  const { pickup } = request;

  return {
    warehouseName: speedoPostWarehouseName(request),
    contactPersonName:
      pickup.contactName.trim() || pickup.companyName?.trim() || "Consignor",
    contactNo: pickup.phone.trim(),
    email: pickup.email?.trim() || "",
    // One line, because they take one field. Line 2 is part of the address a
    // driver needs, so it is joined in rather than dropped.
    address: [pickup.line1.trim(), pickup.line2?.trim()]
      .filter(Boolean)
      .join(", "),
    pinCode: pickup.postalCode.trim(),
    city: pickup.city.trim(),
  };
}

// --- ORDER --------------------------------------------------------------------

export function buildCreateOrderPayload(input: {
  request: CanonicalBookingRequest;
  warehouseName: string;
  courierId: string;
  orderType: SpeedoPostOrderType;
  clientCode: string;
  /** IST. Passed in rather than read from the clock so the payload stays pure. */
  pickupDate: Date;
}): SpeedoPostCreateOrderPayload {
  const { request, warehouseName, courierId, orderType, clientCode } = input;
  const { delivery } = request;

  if (!courierId.trim()) {
    // Unreachable through the adapter, which checks first, and kept anyway:
    // this is the field whose absence is silently expensive rather than loud.
    throw new SpeedoPostBookingDataError(
      "SpeedoPost needs the exact service provider code. Without it they assign a courier at random and report success.",
    );
  }
  if (!clientCode.trim()) {
    throw new SpeedoPostBookingDataError(
      "SPEEDOPOST_CLIENT_CODE is not set. SpeedoPost requires it on every order.",
    );
  }
  // Their rule, enforced at their end above Rs 50,000. The wizard collects the
  // number on any domestic booking over the GST threshold, which is the same
  // figure, so this should never fire on a booking made through the wizard.
  // It fires on a row that predates the field, or one written by another path,
  // and it is refused here so the message names the rule instead of arriving as
  // whatever SpeedoPost calls it.
  const ewaybill = (request.eWayBillNumber ?? "").replace(/\D/g, "");
  if (request.declaredValue > EWAYBILL_THRESHOLD_INR && !ewaybill) {
    throw new SpeedoPostBookingDataError(
      `SpeedoPost requires an e-way bill number above Rs ${EWAYBILL_THRESHOLD_INR.toLocaleString("en-IN")}, ` +
        `and this shipment declares Rs ${Math.round(request.declaredValue).toLocaleString("en-IN")} with no number recorded. ` +
        `Add the e-way bill number to the shipment, or place this booking by hand.`,
    );
  }

  const isCod = request.payment.type === "COD";
  const firstItem = request.items.find((item) => item.name.trim().length > 0);

  return {
    serviceProviderCode: courierId.trim(),
    serviceProviderAwbNumber: null,
    clientCode: clientCode.trim(),
    warehouseName,
    pickupDate: formatOrderDate(input.pickupDate),
    orderType,

    receiverName: delivery.contactName.trim() || "Consignee",
    receiverNumber: delivery.phone.trim(),
    receiverEmail: delivery.email?.trim() || undefined,
    receiverCity: delivery.city.trim(),
    receiverState: delivery.state.trim(),
    receiverAddress: [delivery.line1.trim(), delivery.line2?.trim()]
      .filter(Boolean)
      .join(", "),
    receiverPinCode: delivery.postalCode.trim(),

    // Our shipment id. The only handle that could ever let SpeedoPost recognise
    // a repeat of this order, if they enforce uniqueness on it at all.
    clientOrderId: request.reference,
    invoiceNumber: request.displayReference,
    invoiceAmount: round2(Math.max(0, request.declaredValue)),
    skuName: firstItem?.name.trim() || "General Cargo",
    skuCode: undefined,
    hsnCode: firstItem?.hsCode?.trim() || undefined,
    // Sent whenever we hold one, not only above the threshold: a consignment
    // that has an e-way bill should travel declaring it.
    ewaybill: ewaybill || undefined,

    paymentType: isCod ? "COD" : "PP",
    codAmount: isCod
      ? Math.max(0, Math.round(request.payment.codAmount ?? request.declaredValue))
      : undefined,

    // Not insured through SpeedoPost. Arena's cover is arranged separately, and
    // declaring it here would be buying it twice.
    insurance: false,

    weight: ceilKg(request.totalActualWeightKg),
    totalQuantity: totalBoxes(request),
    dimensions: buildOrderDimensions(request),

    // Left null on purpose. These are OUR invoice's tax figures, and this
    // booking is created before that invoice exists. Sending a computed
    // stand-in would put a number on the carrier's manifest that reconciles
    // against nothing.
    sgstAmount: null,
    cgstAmount: null,
    igstAmount: null,
    totalTaxValue: null,
  };
}

/**
 * One entry per box group, each carrying its own weight.
 *
 * SpeedoPost's example sets the per-box weight equal to the top-level total,
 * which cannot be right for the 2-box consignment it describes, so the reading
 * taken here is the only one that is internally consistent: `weight` at the top
 * is the consignment, `weight` inside a dimension is one box of that size.
 *
 * Every figure rounds UP. A box declared smaller or lighter than it is gets
 * re-measured at the hub and the customer is surcharged weeks later.
 */
export function buildOrderDimensions(
  request: CanonicalBookingRequest,
): SpeedoPostOrderDimension[] {
  const dimensions = request.parcels.map((parcel) => ({
    length: ceilPositive(parcel.lengthCm),
    width: ceilPositive(parcel.widthCm),
    height: ceilPositive(parcel.heightCm),
    weight: ceilKg(parcel.weightKg),
    count: Math.max(1, Math.trunc(parcel.quantity) || 1),
  }));

  if (dimensions.length === 0) {
    throw new SpeedoPostBookingDataError(
      "The shipment has no boxes, so there is nothing for SpeedoPost to carry.",
    );
  }

  return dimensions;
}

// --- PICKUP -------------------------------------------------------------------

export function buildPickupPayload(input: {
  request: CanonicalBookingRequest;
  warehouseName: string;
  courierId: string;
  /** IST wall-clock date and time. See speedoPostPickupSlot. */
  slot: { date: string; time: string };
}): SpeedoPostCreatePickupPayload {
  return {
    serviceProviderCode: input.courierId.trim(),
    warehouseName: input.warehouseName,
    expectedPacketCount: totalBoxes(input.request),
    expectedWeight: ceilKg(input.request.totalActualWeightKg),
    pickupDate: input.slot.date,
    pickupTime: input.slot.time,
  };
}

/** Minutes east of UTC. India has no daylight saving, so this is a constant. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * When to ask the carrier to collect, in IST wall-clock terms.
 *
 * `CreatePickupRequest` validates the slot against the past, and the only
 * captured example in SpeedoPost's own documentation is that failure. Their
 * clock is IST and ours is UTC, so "today at 17:00" computed in UTC is already
 * in the past at their end for most of the Indian working day. Everything below
 * is therefore computed against IST wall-clock time, never the server's.
 *
 * The rule: a booking that lands before the afternoon gets a collection the
 * same day; anything later gets the next morning. Both times sit inside normal
 * carrier collection hours, and the cutoff leaves enough of a margin that a slow
 * booking job cannot push a same-day slot into the past between deciding it and
 * sending it.
 *
 * Returned as strings rather than a Date because the two are not the same thing:
 * this is a wall-clock instant in another timezone, and handing a Date to a
 * caller invites it to be re-formatted in the server's own zone.
 */
export function speedoPostPickupSlot(now: Date): {
  date: string;
  time: string;
  /** Same day in IST, or the next one. Exposed for the tests and the logs. */
  sameDay: boolean;
} {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const sameDay = ist.getUTCHours() < 15;

  if (!sameDay) ist.setUTCDate(ist.getUTCDate() + 1);

  return {
    date: ist.toISOString().slice(0, 10),
    time: sameDay ? "17:00:00" : "11:00:00",
    sameDay,
  };
}

/**
 * The pickup date on the ORDER, which wants DD-MM-YYYY.
 *
 * Deliberately not shared with the pickup request's YYYY-MM-DD formatter above.
 * Two endpoints in one booking take two formats, and a single helper applied to
 * both is a bug that only shows up on whichever call runs second.
 */
export function formatOrderDate(istDate: Date): string {
  const iso = istDate.toISOString().slice(0, 10);
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
}

/** The same IST day the pickup slot lands on, as a Date to format from. */
export function pickupDateForOrder(slot: { date: string }): Date {
  return new Date(`${slot.date}T00:00:00.000Z`);
}

// --- HELPERS ------------------------------------------------------------------

function totalBoxes(request: CanonicalBookingRequest): number {
  const total = request.parcels.reduce(
    (sum, parcel) => sum + Math.max(1, Math.trunc(parcel.quantity) || 1),
    0,
  );
  return Math.max(1, total);
}

/**
 * Kilograms, rounded UP to the gram, never zero.
 *
 * Their weight fields are KG, unlike Shipmozo's grams, so nothing is converted.
 * Rounding to the gram rather than the kilogram is what keeps the booking
 * declaring the SAME consignment the rate call priced: whole-kilogram rounding
 * would send a 0.4kg parcel as 1kg and invite a bill that does not match the
 * quote the customer paid. Up rather than down, because under-declaring is what
 * gets a shipment re-weighed and surcharged at the hub.
 */
function ceilKg(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0.001;
  return Math.ceil(weightKg * 1000) / 1000;
}

function ceilPositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.ceil(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
