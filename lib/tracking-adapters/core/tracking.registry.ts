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
   * Register a tracking adapter. Called once at startup.
   * Throws on duplicate vendorId to catch typos early.
   */
  register(adapter: AnyTrackingAdapter): void {
    if (this.adapters.has(adapter.vendorId)) {
      throw new Error(
        `[TrackingAdapterRegistry] Duplicate vendorId "${adapter.vendorId}". ` +
          `Each vendor must have a unique ID.`
      );
    }
    this.adapters.set(adapter.vendorId, adapter);
    console.log(
      `[TrackingAdapterRegistry] Registered tracking vendor: ${adapter.vendorId}`
    );
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
 * Singleton instance shared across the app.
 */
export const trackingAdapterRegistry = new TrackingAdapterRegistry();