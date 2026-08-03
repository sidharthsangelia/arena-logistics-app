/**
 * WHICH SKART COURIER DID THE CUSTOMER PAY FOR?
 * -----------------------------------------------------------------------------
 * sKart's /booking-api takes a numeric `courier_id` and its rate calculator
 * returns only a `product_name`. Bridging those two is the single most
 * consequential lookup in the international booking path: get it wrong and the
 * parcel ships on a carrier the customer did not buy, at a price we did not
 * quote, with no error anywhere.
 *
 * The lookup also answers the OTHER question the booking needs: `parent_vendor`,
 * which decides the payload variant. Both come out of the same entry, so they
 * are returned together rather than resolved twice.
 *
 * TWO SOURCES, IN THIS ORDER
 *
 *   1. The live catalogue, GET /courier, cached for an hour. Authoritative,
 *      because sKart can add or renumber channels without telling us, and it is
 *      the only source that covers all 94 products they sell.
 *   2. The curated ids in skart.booking.strategies.ts, taken from their worked
 *      examples. Used only when the live lookup returns nothing usable, and it
 *      covers eight products.
 *
 * If neither can answer, this returns null. Null is NOT a soft failure to be
 * papered over with a default — the adapter turns it into a permanent refusal,
 * and ops decide. Shipping on "whichever id looked closest" is the one outcome
 * worse than not shipping today.
 *
 * ── THE FIELD NAMES ARE THE WHOLE STORY ─────────────────────────────────────
 * This module used to read `entry.id ?? entry.courier_id`. The live endpoint
 * emits neither: the id is `product_id`. Every lookup therefore returned null,
 * fell through to the curated table, and failed there too — because the table is
 * keyed on eight exact names and the rate calculator sells things like
 * "DHL DEL DDU ( Gifts Only )". The result was that no sKart export could be
 * booked at all. The names below are confirmed against the live response.
 *
 * THE PAIR, NOT THE NAME
 * A courier id belongs to a (product, shipment_type) PAIR. FedEx DEL is 122 on a
 * CSB4 export and 192 on a commercial one, and the catalogue says which types a
 * product serves in `service_type`. Everything here is keyed on both.
 */

import "server-only";

import { listCouriers } from "./skart.booking.client";
import type { SkartCourierEntry } from "./skart.booking.types";
import {
  type SkartCarrierFamily,
  curatedSkartCourierId,
  resolveSkartFamily,
} from "./skart.booking.strategies";

/** One hour. The catalogue is near-static; a booking must not wait on it. */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CatalogueCache {
  entries: SkartCourierEntry[];
  fetchedAt: number;
}

// Pinned to globalThis for the same reason the adapter registries are: dev HMR
// and multiple module graphs would otherwise each keep their own copy and each
// pay for the fetch.
const globalForCatalogue = globalThis as unknown as {
  __arenaSkartCourierCatalogue?: CatalogueCache | null;
};

function cached(): SkartCourierEntry[] | null {
  const entry = globalForCatalogue.__arenaSkartCourierCatalogue;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
  return entry.entries;
}

async function loadCatalogue(): Promise<SkartCourierEntry[]> {
  const hit = cached();
  if (hit) return hit;

  const entries = await listCouriers();

  // An empty result is NOT cached: it means the lookup failed, and caching a
  // failure for an hour would push every booking in that hour onto the curated
  // fallback, which covers eight of ninety-four products. A successful list is
  // cached, which is the case that matters for latency.
  if (entries.length > 0) {
    globalForCatalogue.__arenaSkartCourierCatalogue = {
      entries,
      fetchedAt: Date.now(),
    };
  }

  return entries;
}

/** The booking API's `courier_id`. `product_id` on the live response. */
function readId(entry: SkartCourierEntry): number | null {
  const raw = entry.product_id ?? entry.id ?? entry.courier_id;
  if (raw == null) return null;
  const parsed = Number(String(raw).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readName(entry: SkartCourierEntry): string | null {
  const raw = entry.product_name ?? entry.courier_name ?? entry.name;
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return trimmed || null;
}

/**
 * Does this product serve the shipment type we are booking?
 *
 * `service_type` is an array of numeric strings, e.g. ["4","2","1","5","7"].
 * A product that does not list the type is the wrong product, not a near miss.
 * An entry that says nothing at all is treated as "serves it": some older
 * entries carry a scalar `shipment_type` and some carry neither, and refusing
 * on silence would reject products that are perfectly bookable.
 */
function servesShipmentType(
  entry: SkartCourierEntry,
  shipmentType: number,
): boolean {
  const wanted = String(shipmentType);

  if (Array.isArray(entry.service_type)) {
    if (entry.service_type.length === 0) return true;
    return entry.service_type.some((t) => String(t).trim() === wanted);
  }

  if (entry.shipment_type != null) {
    return String(entry.shipment_type).trim() === wanted;
  }

  return true;
}

// ---------------------------------------------------------------------------

/** What the booking needs to know about the service the customer bought. */
export interface ResolvedSkartCourier {
  courierId: number;
  /** The carrier family, which decides the payload variant. */
  family: SkartCarrierFamily;
  /** sKart's own name for the product, for logs and ops messages. */
  productName: string | null;
  /** Where the id came from, so a failure can be described honestly. */
  source: "catalogue" | "curated";
}

/**
 * The courier id and carrier family for a product name on a given shipment
 * type, or null when neither source can answer.
 *
 * `shipmentType` is sKart's own encoding (1 = CSB4/non-doc, 4 = commercial),
 * which the caller has already derived from the shipment.
 */
export async function resolveSkartCourier(input: {
  productName: string | null | undefined;
  shipmentType: number;
}): Promise<ResolvedSkartCourier | null> {
  const wanted = input.productName?.trim().toLowerCase();
  if (!wanted) return null;

  // 1. The live catalogue.
  const entries = await loadCatalogue();
  const named = entries.filter((entry) => readName(entry) === wanted);

  if (named.length > 0) {
    // Prefer a product that actually serves this shipment type. When only one
    // product carries the name, it is taken regardless: a single unambiguous
    // match is what the customer bought.
    const match =
      named.find((entry) => servesShipmentType(entry, input.shipmentType)) ??
      (named.length === 1 ? named[0] : null);

    const id = match ? readId(match) : null;
    if (match && id) {
      return {
        courierId: id,
        family: resolveSkartFamily({
          parentVendor: match.parent_vendor,
          productName: input.productName,
        }),
        productName: match.product_name ?? input.productName ?? null,
        source: "catalogue",
      };
    }
  }

  // 2. The curated fallback, for when the catalogue could not be reached.
  const curated = curatedSkartCourierId({
    productName: wanted,
    shipmentType: input.shipmentType,
  });

  if (curated != null) {
    return {
      courierId: curated,
      // No parent_vendor offline, so the family comes from the name.
      family: resolveSkartFamily({ productName: input.productName }),
      productName: input.productName ?? null,
      source: "curated",
    };
  }

  return null;
}

/**
 * Just the id, for the base adapter's `resolveServiceId` contract.
 *
 * Kept as a thin wrapper rather than the primary entry point, because a caller
 * that only takes the id throws away the parent_vendor it needs a moment later.
 */
export async function resolveSkartCourierId(input: {
  productName: string | null | undefined;
  shipmentType: number;
}): Promise<number | null> {
  const resolved = await resolveSkartCourier(input);
  return resolved?.courierId ?? null;
}

/** Drops the cache. For tests and for an ops "sKart changed something" button. */
export function clearSkartCourierCache(): void {
  globalForCatalogue.__arenaSkartCourierCatalogue = null;
}
