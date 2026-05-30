/**
 * slices/compare.slice.ts
 *
 * Owns compare mode state: whether it is active and which quote keys
 * are selected for side-by-side comparison (maximum 3).
 *
 * Quote keys are stable strings: `${vendorId}::${productName}`.
 * Using a string key (rather than a full RateQuote object) prevents stale
 * reference issues when the quotes array is replaced after a new fetch.
 */

import type { StateCreator } from "zustand";
import { AppStore, CompareSlice } from "../types";


const MAX_COMPARE = 3;

export const createCompareSlice: StateCreator<
  AppStore,
  [["zustand/devtools", never], ["zustand/immer", never]],
  [],
  CompareSlice
> = (set) => ({
  // -- State -----------------------------------------------------------------
  compareMode: false,
  compareIds: [],

  // -- Actions ---------------------------------------------------------------

  enableCompareMode: () =>
    set((state) => { state.compareMode = true; }, false, "compare/enable"),

  disableCompareMode: () =>
    set(
      (state) => {
        state.compareMode = false;
        state.compareIds = [];
      },
      false,
      "compare/disable"
    ),

  toggleCompareId: (id) =>
    set(
      (state) => {
        const idx = state.compareIds.indexOf(id);
        if (idx !== -1) {
          // Deselect
          state.compareIds.splice(idx, 1);
        } else if (state.compareIds.length < MAX_COMPARE) {
          // Select (only if under the limit)
          state.compareIds.push(id);
        }
        // If already at MAX_COMPARE and the id is not selected, silently
        // ignore — the card will render as disabled so this shouldn't fire,
        // but defensive programming prevents silent state corruption.
      },
      false,
      "compare/toggleId"
    ),

  clearCompareIds: () =>
    set((state) => { state.compareIds = []; }, false, "compare/clearIds"),
});