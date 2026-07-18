/**
 * TRACKING ADAPTER REGISTRY
 * -----------------------------------------------------------------------------
 * A simple Map-based registry for tracking adapters. The service layer looks
 * up adapters here instead of importing them directly — the key to extensibility.
 *
 * Mirrors the rate AdapterRegistry exactly. Kept separate so tracking and
 * rate registries can evolve independently (e.g. a vendor might support
 * rate-calc but not tracking, or vice versa).
 */

import type { BaseTrackingAdapter } from "./base.tracking.adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTrackingAdapter = BaseTrackingAdapter<any, any>;

class TrackingAdapterRegistry {
  private readonly adapters = new Map<string, AnyTrackingAdapter>();

  /**
   * Register a tracking adapter (called from the vendor index at import time).
   *
   * IDEMPOTENT ON PURPOSE, mirroring the rate AdapterRegistry: the registration
   * module can be re-evaluated (dev HMR, multiple module graphs), so a repeat
   * vendorId must replace rather than throw and 500 a live request.
   */
  register(adapter: AnyTrackingAdapter): void {
    const isReRegister = this.adapters.has(adapter.vendorId);
    this.adapters.set(adapter.vendorId, adapter);
    if (!isReRegister) {
      console.log(
        `[TrackingAdapterRegistry] Registered tracking vendor: ${adapter.vendorId}`
      );
    }
  }

  /** Get one specific adapter by id, or undefined if not registered. */
  get(vendorId: string): AnyTrackingAdapter | undefined {
    return this.adapters.get(vendorId);
  }

  /** Return all registered adapters */
  getAll(): AnyTrackingAdapter[] {
    return Array.from(this.adapters.values());
  }

  listVendorIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * Singleton instance shared across the app. Pinned to globalThis so there is
 * exactly one registry per process even across module re-evaluation / HMR.
 */
const globalForTrackingRegistry = globalThis as unknown as {
  __arenaTrackingRegistry?: TrackingAdapterRegistry;
};

export const trackingAdapterRegistry =
  globalForTrackingRegistry.__arenaTrackingRegistry ??
  new TrackingAdapterRegistry();

globalForTrackingRegistry.__arenaTrackingRegistry = trackingAdapterRegistry;