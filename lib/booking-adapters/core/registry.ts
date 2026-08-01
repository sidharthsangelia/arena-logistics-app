/**
 * BOOKING ADAPTER REGISTRY
 * -----------------------------------------------------------------------------
 * Mirrors the rate and tracking registries exactly: a Map keyed on vendorId,
 * pinned to globalThis, idempotent registration so dev HMR and multiple module
 * graphs cannot throw inside a live request.
 *
 * Kept separate from the other two rather than merged into one because a vendor
 * can perfectly well be quotable but not bookable through the API (or the
 * reverse), and a single registry would force every vendor to pretend it does
 * all three.
 */

import type { BaseBookingAdapter } from "./base.booking.adapter";

class BookingAdapterRegistry {
  private readonly adapters = new Map<string, BaseBookingAdapter>();

  register(adapter: BaseBookingAdapter): void {
    const isReRegister = this.adapters.has(adapter.vendorId);
    this.adapters.set(adapter.vendorId, adapter);
    if (!isReRegister && process.env.NODE_ENV !== "production") {
      console.log(
        `[BookingAdapterRegistry] Registered booking vendor: ${adapter.vendorId}`,
      );
    }
  }

  get(vendorId: string): BaseBookingAdapter | undefined {
    return this.adapters.get(vendorId);
  }

  getAll(): BaseBookingAdapter[] {
    return Array.from(this.adapters.values());
  }

  listVendorIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

const globalForBookingRegistry = globalThis as unknown as {
  __arenaBookingRegistry?: BookingAdapterRegistry;
};

export const bookingAdapterRegistry =
  globalForBookingRegistry.__arenaBookingRegistry ?? new BookingAdapterRegistry();

globalForBookingRegistry.__arenaBookingRegistry = bookingAdapterRegistry;
