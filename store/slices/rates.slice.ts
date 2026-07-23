/**
 * slices/rates.slice.ts
 *
 * Owns all state related to the current rate query result.
 *
 * IMPORTANT: This slice calls the Server Action directly. It does NOT call
 * fetch("/api/rates"). That HTTP route exists for external consumers only.
 */

import type { StateCreator } from "zustand";
 
import type { AppStore, RatesSlice } from "../types";
import type { VendorId, RateScope } from "@/lib/types";
import { getRatesAction } from "@/actions/rates.action";
import { getDomesticRatesAction } from "@/actions/domesticRateCalculator.action";

export const createRatesSlice: StateCreator<
  AppStore,
  [["zustand/devtools", never], ["zustand/immer", never]],
  [],
  RatesSlice
> = (set) => ({
  // -- State -----------------------------------------------------------------
  request: null,
  quotes: [],
  vendorErrors: [],
  loading: false,
  error: null,
  activeScope: null,

  // -- Actions ---------------------------------------------------------------

  fetchRates: async (
    request,
    vendorIds?: VendorId[],
    scope: RateScope = "international",
  ) => {
    set(
      (state) => {
        state.request = request;
        state.quotes = [];
        state.vendorErrors = [];
        state.loading = true;
        state.error = null;
        // Reset UI state whenever a new search is initiated so stale
        // filters/sort from the previous query don't confuse the user.
        state.sortBy = "price-asc";
        state.activeCarriers = [];
        state.activeBrands = [];
        // Exit compare mode on a new search
        state.compareMode = false;
        state.compareIds = [];
        // Close the quote sheet
        state.sheetOpen = false;
        state.selectedQuote = null;
      },
      false,
      "rates/fetchRates/pending"
    );

    const result =
      scope === "domestic"
        ? await getDomesticRatesAction(request, vendorIds)
        : await getRatesAction(request, vendorIds);

    if (result.success) {
      set(
        (state) => {
          state.quotes = result.quotes;
          state.vendorErrors = result.vendorErrors;
          state.loading = false;
          // Tag the result with the scope that produced it so each calculator
          // only renders its own results (see RatesClient's scope gate).
          state.activeScope = scope;
        },
        false,
        "rates/fetchRates/fulfilled"
      );
    } else {
      set(
        (state) => {
          state.quotes = [];
          state.vendorErrors = result.vendorErrors;
          state.error = result.error;
          state.loading = false;
          state.activeScope = scope;
        },
        false,
        "rates/fetchRates/rejected"
      );
    }
  },

  clearRates: () =>
    set(
      (state) => {
        state.request = null;
        state.quotes = [];
        state.vendorErrors = [];
        state.loading = false;
        state.error = null;
        state.activeScope = null;
      },
      false,
      "rates/clear"
    ),

  // Full ephemeral reset. One store instance is shared across the international
  // and domestic calculator routes, so a mounting calculator calls this to wipe
  // the other one's leftover sort/filter/compare/sheet state and start clean.
  // viewMode is deliberately left untouched (display preference).
  resetCalculator: () =>
    set(
      (state) => {
        // rates
        state.request = null;
        state.quotes = [];
        state.vendorErrors = [];
        state.loading = false;
        state.error = null;
        state.activeScope = null;
        // ui (sort + carrier/brand filters)
        state.sortBy = "price-asc";
        state.activeCarriers = [];
        state.activeBrands = [];
        // compare
        state.compareMode = false;
        state.compareIds = [];
        // quote sheet
        state.sheetOpen = false;
        state.selectedQuote = null;
      },
      false,
      "rates/resetCalculator"
    ),
});