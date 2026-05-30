/**
 * slices/quoteSheet.slice.ts
 *
 * Owns the open/closed state of the QuoteSheet and which RateQuote is
 * currently selected for PDF generation.
 *
 * WHY IN THE STORE
 * ----------------
 * With the quote history roadmap item coming, saved quotes will need to
 * know which quote was generated and when. By putting the selected quote in
 * the store, the HistorySlice's saveQuote action can read it directly
 * instead of requiring the component to pass it as a prop.
 *
 * It also makes it trivial to open a quote sheet programmatically (e.g.
 * from a "re-open" button in the history panel) without prop drilling.
 */

import type { StateCreator } from "zustand";
import type { AppStore, QuoteSheetSlice } from "../types";

export const createQuoteSheetSlice: StateCreator<
  AppStore,
  [["zustand/devtools", never], ["zustand/immer", never]],
  [],
  QuoteSheetSlice
> = (set) => ({
  // -- State -----------------------------------------------------------------
  sheetOpen: false,
  selectedQuote: null,

  // -- Actions ---------------------------------------------------------------

  openSheet: (quote) =>
    set(
      (state) => {
        state.selectedQuote = quote;
        state.sheetOpen = true;
      },
      false,
      "quoteSheet/open"
    ),

  closeSheet: () =>
    set(
      (state) => {
        state.sheetOpen = false;
        // Delay clearing selectedQuote so the closing animation doesn't
        // cause a content flash. The component handles this with a setTimeout.
        // We only null it here so the store stays clean if someone
        // programmatically closes without a re-open.
        state.selectedQuote = null;
      },
      false,
      "quoteSheet/close"
    ),
});