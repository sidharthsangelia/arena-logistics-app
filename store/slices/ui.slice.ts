/**
 * slices/ui.slice.ts
 *
 * Owns the presentation state of the results list: sort order, active carrier
 * filters, and grid/list view mode.
 *
 * This state lives in the store (rather than component-local useState) because:
 * 1. It needs to reset whenever a new query is issued (rates.slice does this).
 * 2. Future features (deep-linked filter state, persisted preferences) will
 *    need to read or write it from outside the component tree.
 */

import type { StateCreator } from "zustand";
import type { AppStore, UiSlice } from "../types";

export const createUiSlice: StateCreator<
  AppStore,
  [["zustand/devtools", never], ["zustand/immer", never]],
  [],
  UiSlice
> = (set) => ({
  // -- State -----------------------------------------------------------------
  sortBy: "price-asc",
  activeCarriers: [],
  viewMode: "grid",

  // -- Actions ---------------------------------------------------------------

  setSortBy: (sort) =>
    set((state) => { state.sortBy = sort; }, false, "ui/setSortBy"),

  toggleCarrierFilter: (vendorId) =>
    set(
      (state) => {
        const idx = state.activeCarriers.indexOf(vendorId);
        if (idx === -1) {
          state.activeCarriers.push(vendorId);
        } else {
          state.activeCarriers.splice(idx, 1);
        }
      },
      false,
      "ui/toggleCarrierFilter"
    ),

  clearCarrierFilters: () =>
    set((state) => { state.activeCarriers = []; }, false, "ui/clearCarrierFilters"),

  setViewMode: (mode) =>
    set((state) => { state.viewMode = mode; }, false, "ui/setViewMode"),

  resetUi: () =>
    set(
      (state) => {
        state.sortBy = "price-asc";
        state.activeCarriers = [];
        // Intentionally do NOT reset viewMode — users usually want to keep
        // their display preference across searches.
      },
      false,
      "ui/reset"
    ),
});