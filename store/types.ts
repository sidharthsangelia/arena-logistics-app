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

  // -- Actions ---------------------------------------------------------------

  /** Called by the form on submit. Invokes the Server Action. */
  fetchRates: (request: RateRequest, vendorIds?: VendorId[]) => Promise<void>;

  /** Resets all rate state (useful before a new search) */
  clearRates: () => void;
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
  viewMode: ViewMode;

  setSortBy: (sort: SortOption) => void;
  toggleCarrierFilter: (vendorId: string) => void;
  clearCarrierFilters: () => void;
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

