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

export class AdapterRegistry {
  private readonly adapters = new Map<string, AnyAdapter>();

  /**
   * Register a vendor adapter (called from vendors/index.ts at import time).
   *
   * IDEMPOTENT ON PURPOSE. The registration module runs its side effects
   * whenever it is (re-)evaluated, which happens more than once in practice:
   *   - dev HMR re-runs the module when any adapter file changes
   *   - the App Router can evaluate the same module in separate server/SSR
   *     module graphs
   * An earlier version threw on a repeat vendorId, which turned those benign
   * re-evaluations into a 500 on /rates. We now replace instead: the latest
   * adapter instance wins (so HMR picks up code changes) and registration
   * never throws while users are mid-request.
   */
  register(adapter: AnyAdapter): void {
    const isReRegister = this.adapters.has(adapter.vendorId);
    this.adapters.set(adapter.vendorId, adapter);
    if (!isReRegister && process.env.NODE_ENV !== "production") {
      console.log(`[AdapterRegistry] Registered vendor: ${adapter.vendorId}`);
    }
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
 *
 * Pinned to globalThis (same pattern as the Prisma client in utils/db.ts) so
 * there is exactly ONE registry per server process even if this module gets
 * evaluated in more than one module graph or reloaded by dev HMR. Combined
 * with the idempotent `register` above, adapter setup can never crash a
 * request.
 */
const globalForRegistry = globalThis as unknown as {
  __arenaAdapterRegistry?: AdapterRegistry;
};

export const adapterRegistry =
  globalForRegistry.__arenaAdapterRegistry ?? new AdapterRegistry();

globalForRegistry.__arenaAdapterRegistry = adapterRegistry;