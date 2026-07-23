/**
 * store/types.ts
 *
 * The canonical type for the entire Zustand store.
 *
 * WHY ONE FILE FOR TYPES
 * ----------------------
 * Keeping the full store shape here prevents circular imports between slices
 * and makes it trivial to see the whole state tree at a glance. Slices import
 * from here rather than from each other.
 */

import type {
  RateRequest,
  RateQuote,
  VendorError,
  VendorId,
  RateScope,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Rates slice
// ---------------------------------------------------------------------------

export interface RatesSlice {
  /** The request that produced the current result set */
  request: RateRequest | null;

  /** Flat list of all quotes from the last successful fetch */
  quotes: RateQuote[];

  /** Per-vendor errors from the last fetch (partial failures) */
  vendorErrors: VendorError[];

  /** True while the Server Action is in flight */
  loading: boolean;

  /**
   * Top-level error string. Set when the entire action fails (e.g. network
   * outage). Distinct from vendorErrors which represent partial failures.
   */
  error: string | null;

  /**
   * The scope ("international" | "domestic") that produced the current result
   * set, or null when there is none. The store is a single shared singleton
   * across both calculator routes; consumers gate their result rendering on
   * `activeScope === theirScope` so one calculator never shows the other's
   * stale results after a client-side navigation.
   */
  activeScope: RateScope | null;

  // -- Actions ---------------------------------------------------------------

  /**
   * Called by the form on submit. Invokes the matching Server Action.
   * `scope` selects the calculator: "international" (default) or "domestic".
   */
  fetchRates: (
    request: RateRequest,
    vendorIds?: VendorId[],
    scope?: RateScope,
  ) => Promise<void>;

  /** Resets the rate result fields (useful before a new search). */
  clearRates: () => void;

  /**
   * Full reset of every ephemeral calculator slice (rates + sort/filter +
   * compare + quote sheet), so a calculator mounts with a clean slate and
   * never inherits the other calculator's state. viewMode is intentionally
   * preserved as a display preference.
   */
  resetCalculator: () => void;
}

// ---------------------------------------------------------------------------
// UI slice — sort, filter, view mode for the results list
// ---------------------------------------------------------------------------

export type SortOption =
  | "price-asc"
  | "price-desc"
  | "tat-asc"
  | "tat-desc";

export type ViewMode = "grid" | "list";

export interface UiSlice {
  sortBy: SortOption;
  activeCarriers: string[];
  /**
   * Active big-4 brand filters (DHL/FedEx/UPS/Aramex/OTHER) for the
   * international results. Customer-facing and derived from the product name,
   * distinct from `activeCarriers` which is the Arena-only sourcing-vendor axis.
   * Empty = show all brands.
   */
  activeBrands: string[];
  viewMode: ViewMode;

  setSortBy: (sort: SortOption) => void;
  toggleCarrierFilter: (vendorId: string) => void;
  clearCarrierFilters: () => void;
  toggleBrandFilter: (brand: string) => void;
  clearBrandFilters: () => void;
  setViewMode: (mode: ViewMode) => void;

  /** Resets all UI state to defaults (call after a new search) */
  resetUi: () => void;
}

// ---------------------------------------------------------------------------
// Compare slice
// ---------------------------------------------------------------------------

export interface CompareSlice {
  compareMode: boolean;

  /** Up to 3 quote keys (`${vendorId}::${productName}`) */
  compareIds: string[];

  enableCompareMode: () => void;
  disableCompareMode: () => void;
  toggleCompareId: (id: string) => void;
  clearCompareIds: () => void;
}

// ---------------------------------------------------------------------------
// Quote sheet slice — controls which quote the sheet is open for
// ---------------------------------------------------------------------------

export interface QuoteSheetSlice {
  sheetOpen: boolean;
  selectedQuote: RateQuote | null;

  openSheet: (quote: RateQuote) => void;
  closeSheet: () => void;
}

// ---------------------------------------------------------------------------
// History slice — scaffold; will grow when quote history lands
// ---------------------------------------------------------------------------

export interface SavedQuote {
  id: string;
  savedAt: string; // ISO string — serialisable
  request: RateRequest;
  quote: RateQuote;
  markupPercent: number;
  quoteNumber: string;
}

export interface HistorySlice {
  savedQuotes: SavedQuote[];

  saveQuote: (entry: Omit<SavedQuote, "id" | "savedAt">) => void;
  removeQuote: (id: string) => void;
  clearHistory: () => void;
}

// ---------------------------------------------------------------------------
// Root store
// ---------------------------------------------------------------------------

export type AppStore = RatesSlice &
  UiSlice &
  CompareSlice &
  QuoteSheetSlice &
  HistorySlice;

