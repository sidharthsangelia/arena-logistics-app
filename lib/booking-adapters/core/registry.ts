/**
 * BOOKING ADAPTER REGISTRIES
 * -----------------------------------------------------------------------------
 * Mirrors the rate and tracking registries exactly: a Map keyed on vendorId,
 * pinned to globalThis, idempotent registration so dev HMR and multiple module
 * graphs cannot throw inside a live request.
 *
 * Kept separate from the other two rather than merged into one because a vendor
 * can perfectly well be quotable but not bookable through the API (or the
 * reverse), and a single registry would force every vendor to pretend it does
 * all three.
 *
 * WHY DOMESTIC AND INTERNATIONAL GET SEPARATE INSTANCES
 * The Map is keyed on vendorId, and Shipmozo books BOTH domestic door → door
 * orders and international exports under the single id "shipmozo". One registry
 * would mean its two adapters overwrite each other, and whichever module
 * happened to import last would decide how every parcel ships. Two registries,
 * one lookup each, no collision.
 */

/** The minimum a registry needs to file an adapter. */
interface RegisterableAdapter {
  readonly vendorId: string;
}

class BookingAdapterRegistry<T extends RegisterableAdapter> {
  private readonly adapters = new Map<string, T>();

  constructor(private readonly label: string) {}

  register(adapter: T): void {
    const isReRegister = this.adapters.has(adapter.vendorId);
    this.adapters.set(adapter.vendorId, adapter);
    if (!isReRegister && process.env.NODE_ENV !== "production") {
      console.log(`[${this.label}] Registered booking vendor: ${adapter.vendorId}`);
    }
  }

  get(vendorId: string): T | undefined {
    return this.adapters.get(vendorId);
  }

  getAll(): T[] {
    return Array.from(this.adapters.values());
  }

  listVendorIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

import type { BaseBookingAdapter } from "./base.booking.adapter";
import type { BaseInternationalBookingAdapter } from "./base.international.adapter";

const globalForBookingRegistry = globalThis as unknown as {
  __arenaBookingRegistry?: BookingAdapterRegistry<BaseBookingAdapter>;
  __arenaIntlBookingRegistry?: BookingAdapterRegistry<BaseInternationalBookingAdapter>;
};

/** Domestic door → door couriers. */
export const bookingAdapterRegistry =
  globalForBookingRegistry.__arenaBookingRegistry ??
  new BookingAdapterRegistry<BaseBookingAdapter>("BookingAdapterRegistry");

globalForBookingRegistry.__arenaBookingRegistry = bookingAdapterRegistry;

/** International export carriers. */
export const internationalBookingAdapterRegistry =
  globalForBookingRegistry.__arenaIntlBookingRegistry ??
  new BookingAdapterRegistry<BaseInternationalBookingAdapter>(
    "IntlBookingAdapterRegistry",
  );

globalForBookingRegistry.__arenaIntlBookingRegistry =
  internationalBookingAdapterRegistry;
