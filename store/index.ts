/**
 * store/index.ts
 *
 * Composes all slices into a single Zustand store.
 *
 * MIDDLEWARE STACK (innermost → outermost)
 * ----------------------------------------
 * 1. immer       — lets slices mutate state directly in set() callbacks
 * 2. devtools    — Redux DevTools integration in development
 * 3. persist     — localStorage persistence for savedQuotes only
 *
 * The persist middleware is scoped to the `history` partition via
 * `partialize`. This means only savedQuotes survives a page reload.
 * Everything else (rates, UI, compare, sheet) is ephemeral — it would be
 * confusing to restore a stale rate result from a previous session.
 *
 * USAGE — in components
 * ----------------------
 * Always use the granular selectors, not the whole store:
 *
 *   // Good — only re-renders when quotes changes
 *   const quotes = useAppStore((s) => s.quotes);
 *
 *   // Bad — re-renders on every store update
 *   const store = useAppStore();
 *
 * USAGE — outside React (e.g. in a utility or test)
 * --------------------------------------------------
 *   import { appStore } from "@/store;
 *   appStore.getState().fetchRates(request);
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";

import { createRatesSlice } from "./slices/rates.slice";
import { createUiSlice } from "./slices/ui.slice";
import { createCompareSlice } from "./slices/compare.slice";

import { createHistorySlice } from "./slices/history.slice";
import type { AppStore } from "./types";
import { createQuoteSheetSlice } from "./slices/QuoteSheet.slice";

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      immer((...args) => ({
        ...createRatesSlice(...args),
        ...createUiSlice(...args),
        ...createCompareSlice(...args),
        ...createQuoteSheetSlice(...args),
        ...createHistorySlice(...args),
      })),
      {
        name: "arena-logistics-store",
        storage: createJSONStorage(() => localStorage),

        // Only persist the history slice. All other state is ephemeral.
        partialize: (state) => ({
          savedQuotes: state.savedQuotes,
        }),
      }
    ),
    {
      name: "ArenaLogistics",
      enabled: process.env.NODE_ENV === "development",
    }
  )
);

// ---------------------------------------------------------------------------
// Vanilla store access (useful for non-React contexts, tests, or Server Actions
// that need to read state synchronously)
// ---------------------------------------------------------------------------
export { useAppStore as appStore };

// ---------------------------------------------------------------------------
// Re-export store types for convenience
// ---------------------------------------------------------------------------
export type { AppStore } from "./types";
export type { SortOption, ViewMode } from "./types";