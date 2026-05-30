import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GitCompare, LayoutGrid, List, X, ArrowUpDown } from "lucide-react";

import { useAppStore } from "@/store";
import type { SortOption } from "@/store";

export default function Toolbar({
  carriers,
}: {
  carriers: { id: string; name: string }[];
}) {
  // -- Store reads -----------------------------------------------------------

  const sortBy = useAppStore((s) => s.sortBy);
  const activeCarriers = useAppStore((s) => s.activeCarriers);
  const viewMode = useAppStore((s) => s.viewMode);

  const compareMode = useAppStore((s) => s.compareMode);

  // -- Store actions ---------------------------------------------------------
  const setSortBy = useAppStore((s) => s.setSortBy);
  const toggleCarrierFilter = useAppStore((s) => s.toggleCarrierFilter);
  const clearCarrierFilters = useAppStore((s) => s.clearCarrierFilters);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const enableCompareMode = useAppStore((s) => s.enableCompareMode);
  const disableCompareMode = useAppStore((s) => s.disableCompareMode);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Carrier filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {carriers.map((c) => {
          const active = activeCarriers.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggleCarrierFilter(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {active && <X className="h-2.5 w-2.5" />}
              {c.name}
            </button>
          );
        })}
        {activeCarriers.length > 0 && (
          <button
            onClick={clearCarrierFilters}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Sort */}
      <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
        <SelectTrigger className="h-8 w-44 text-xs gap-1.5">
          <ArrowUpDown className="h-3 w-3 text-slate-400 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="price-asc">Price: Low → High</SelectItem>
          <SelectItem value="price-desc">Price: High → Low</SelectItem>
          <SelectItem value="tat-asc">Delivery: Fastest first</SelectItem>
          <SelectItem value="tat-desc">Delivery: Slowest first</SelectItem>
        </SelectContent>
      </Select>

      {/* View toggle */}
      <div className="flex items-center rounded-md border border-slate-200 overflow-hidden h-8">
        <button
          onClick={() => setViewMode("grid")}
          className={`flex items-center justify-center w-8 h-full transition-colors ${
            viewMode === "grid"
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
          aria-label="Grid view"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`flex items-center justify-center w-8 h-full transition-colors border-l border-slate-200 ${
            viewMode === "list"
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
          aria-label="List view"
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Compare toggle */}
      <Button
        variant={compareMode ? "default" : "outline"}
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={() =>
          compareMode ? disableCompareMode() : enableCompareMode()
        }
      >
        <GitCompare className="h-3.5 w-3.5" />
        {compareMode ? "Exit compare" : "Compare"}
      </Button>
    </div>
  );
}
