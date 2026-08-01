import type { TrackingEventType } from "@/lib/tracking-adapters/core/tracking.types";
import type { ShipmozoScanEntry, ShipmozoTrackData } from "./types";

/**
 * lib/shipmozo/trackShape.ts
 *
 * Reading Shipmozo's tracking body, whichever of its shapes arrived.
 *
 * The webhook and GET /track-order carry the same information under different
 * keys — `status_feed.scan[]` from one, `scan_detail[]` from the other — and
 * their scan lines do not agree on field names either. Their documentation for
 * the endpoint is the words "Successful operation" and nothing more, so the
 * shape is only ever known from live traffic.
 *
 * Every reader of that body goes through here so the knowledge lives in one
 * place: the tracking adapter behind /track and the webhook that advances a
 * shipment. Reading only the webhook's shape is what made a live lookup return
 * a successful track with an empty timeline.
 *
 * No `server-only` — the webhook route and the adapter both import it.
 */

/** The scan history, from whichever field carried it. */
export function readShipmozoScans(data: ShipmozoTrackData): ShipmozoScanEntry[] {
  const feed = data.status_feed?.scan;
  if (feed?.length) return feed;
  return data.scan_detail ?? [];
}

/**
 * Who is actually carrying the parcel, e.g. "Delhivery", "XpressBees 2KG".
 *
 * The webhook calls this `carrier`; the tracking endpoint calls it `courier`.
 * Reading only one leaves the tracking page showing no carrier at all on
 * exactly the surface where a customer is looking for it.
 */
export function readShipmozoCarrier(data: ShipmozoTrackData): string | undefined {
  return data.carrier?.trim() || data.courier?.trim() || undefined;
}

/** One scan line's timestamp, e.g. "2025-07-14 09:12:16" (IST, no zone). */
export function readScanDate(scan: ShipmozoScanEntry): string | undefined {
  return scan.date ?? scan.status_date ?? scan.scan_date;
}

/** One scan line's status text, e.g. "Delivered to consignee". */
export function readScanStatus(scan: ShipmozoScanEntry): string {
  return (scan.status ?? scan.status_name ?? scan.remark ?? "").trim();
}

/** One scan line's place, e.g. "Mumbai_KurlaWest_R (Maharashtra)". */
export function readScanLocation(scan: ShipmozoScanEntry): string {
  return (scan.location ?? scan.scan_location ?? scan.city ?? "").trim();
}

/**
 * Has the ORDER been cancelled with the courier?
 *
 * Order state and parcel movement are separate fields and can disagree: a
 * cancelled order keeps reporting whatever its last movement status was, so
 * "Pickup Pending" on a cancelled order is not a parcel awaiting collection.
 */
export function isShipmozoOrderCancelled(
  orderStatus: string | null | undefined,
): boolean {
  return (orderStatus ?? "").toUpperCase().includes("CANCEL");
}

/**
 * Shipmozo status text → canonical event category, for icons and the progress
 * bar on the tracking page.
 *
 * THE UNHAPPY CASES ARE TESTED FIRST, and that order is the whole correctness
 * of this function. "Undelivered - consignee not available" and "RTO Delivered"
 * both contain the substring "delivered"; matched in the obvious order, either
 * one paints the timeline green on the very day the parcel was refused or sent
 * back. Same trap, same ordering, as the two status maps beside this file.
 */
export function mapShipmozoEventType(
  status: string | null | undefined,
): TrackingEventType {
  const s = (status ?? "").toLowerCase();
  if (!s) return "unknown";

  if (s.includes("rto") || s.includes("return")) return "returned";
  if (
    s.includes("undelivered") ||
    s.includes("not delivered") ||
    s.includes("failed") ||
    s.includes("attempt")
  )
    return "attempted";
  if (s.includes("cancel") || s.includes("exception") || s.includes("hold"))
    return "exception";

  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (
    s.includes("out for pickup") ||
    s.includes("pickup scheduled") ||
    s.includes("pickup assigned")
  )
    return "booked";
  if (s.includes("picked up") || s.includes("pickup done")) return "picked_up";
  if (
    s.includes("in transit") ||
    s.includes("in-transit") ||
    s.includes("received at facility") ||
    s.includes("reached") ||
    s.includes("dispatched") ||
    s.includes("bag")
  )
    return "in_transit";
  if (s.includes("manifest") || s.includes("booked") || s.includes("pending"))
    return "booked";
  return "unknown";
}
