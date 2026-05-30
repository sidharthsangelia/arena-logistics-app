/**
 * slices/history.slice.ts
 *
 * Scaffold for the "saved quotes" and "quote history" roadmap items.
 *
 * CURRENT STATE
 * -------------
 * This slice exists now so that:
 * 1. The store type is complete — no breaking changes when the feature lands.
 * 2. QuoteSheet can call `saveQuote` when a PDF is downloaded, building up
 *    history automatically even before the UI surfaces it.
 * 3. The persistence middleware can be configured for this slice from day one.
 *
 * PERSISTENCE
 * -----------
 * The `savedQuotes` array should be persisted to localStorage via
 * zustand/middleware `persist`. That is wired in store/index.ts rather
 * than here so the persistence config is co-located with store creation.
 *
 * All values in SavedQuote are plain JSON-serialisable strings/numbers/objects
 * (dates are stored as ISO strings). This is intentional: localStorage and
 * the RSC serialiser both require it.
 */

import { nanoid } from "nanoid";
import type { StateCreator } from "zustand";
import type { AppStore, HistorySlice, SavedQuote } from "../types";

export const createHistorySlice: StateCreator<
  AppStore,
  [["zustand/devtools", never], ["zustand/immer", never]],
  [],
  HistorySlice
> = (set) => ({
  // -- State -----------------------------------------------------------------
  savedQuotes: [],

  // -- Actions ---------------------------------------------------------------

  saveQuote: (entry) =>
    set(
      (state) => {
        const newEntry: SavedQuote = {
          ...entry,
          id: nanoid(),
          savedAt: new Date().toISOString(),
        };
        // Most-recent first
        state.savedQuotes.unshift(newEntry);
      },
      false,
      "history/saveQuote"
    ),

  removeQuote: (id) =>
    set(
      (state) => {
        state.savedQuotes = state.savedQuotes.filter((q) => q.id !== id);
      },
      false,
      "history/removeQuote"
    ),

  clearHistory: () =>
    set((state) => { state.savedQuotes = []; }, false, "history/clear"),
});