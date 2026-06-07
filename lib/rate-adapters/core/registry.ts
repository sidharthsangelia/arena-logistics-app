/**
 * ADAPTER REGISTRY
 * -----------------------------------------------------------------------------
 * A simple Map-based registry. The service layer looks up adapters here
 * instead of importing them directly — this is the key to extensibility.
 *
 * Adapters register themselves (see vendors/index.ts). The registry
 * itself never needs to change when a new vendor is added.
 */

import type { BaseVendorAdapter } from "./base.adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapter = BaseVendorAdapter<any, any>;

class AdapterRegistry {
  private readonly adapters = new Map<string, AnyAdapter>();

  /**
   * Register a vendor adapter. Called once at startup from vendors/index.ts.
   * Throws if the same vendorId is registered twice (catches typos early).
   */
  register(adapter: AnyAdapter): void {
    if (this.adapters.has(adapter.vendorId)) {
      throw new Error(
        `[AdapterRegistry] Duplicate vendorId "${adapter.vendorId}". ` +
          `Each vendor must have a unique ID.`
      );
    }
    this.adapters.set(adapter.vendorId, adapter);
    console.log(`[AdapterRegistry] Registered vendor: ${adapter.vendorId}`);
  }

  /** Get one specific adapter by id, or undefined if not registered. */
  get(vendorId: string): AnyAdapter | undefined {
    return this.adapters.get(vendorId);
  }

  /** Return all registered adapters (used by the service to fan out). */
  getAll(): AnyAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Useful for health-check endpoints and logging. */
  listVendorIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * Singleton instance shared across the app.
 * In Next.js 16 with the App Router, module-level singletons are safe
 * because modules are only evaluated once per server process.
 */
export const adapterRegistry = new AdapterRegistry();