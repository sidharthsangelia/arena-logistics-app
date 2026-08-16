// components/data-table/SectionTableSkeleton.tsx
//
// A fallback for a plain server-rendered table: one that has no toolbar, no
// paging and no react-query behind it, just headers and rows. The sweep screens
// and the ops summary tables are all built that way.
//
// WHY THIS EXISTS ALONGSIDE DataTableSkeleton
// DataTableSkeleton greys out the column headings too, because it stands in for a
// client table whose columns are chosen at runtime. These tables know their
// headings at build time, so greying them out would hide text that could have
// been on screen from the first frame and would redraw when the rows land. Here
// the headings are real and only the cells are placeholders: the table paints its
// own outline immediately and fills in.
//
// The wrapper classes default to the chrome those tables use
// (`overflow-x-auto rounded-lg border`) so the border, the radius and the
// horizontal scroll behaviour are identical before and after the swap.

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SkeletonColumn = {
  /**
   * The real heading, rendered as text and never as a placeholder.
   *
   * `null` for the rare column whose heading is itself data — the carrier
   * comparison has one column per vendor the run queried, and which vendors
   * those were is not known until the run row is read. A placeholder there is
   * honest; inventing a label would put text on screen that the real table then
   * has to correct.
   */
  label: string | null;
  /** Matches the alignment of the real column so the fill-in does not slide. */
  align?: "left" | "right";
  /** Tailwind width for the placeholder inside the cell, e.g. "w-24". */
  width?: string;
  /** Extra classes for both the head and the cell, e.g. "hidden sm:table-cell". */
  className?: string;
};

export function SectionTableSkeleton({
  columns,
  rows = 6,
  wrapperClassName,
}: {
  columns: SkeletonColumn[];
  rows?: number;
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border",
        wrapperClassName,
      )}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={index}
                className={cn(
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.label ?? (
                  <Skeleton
                    className={cn(
                      "h-3.5 w-16",
                      column.align === "right" && "ml-auto",
                    )}
                  />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {Array.from({ length: rows }).map((_, row) => (
            <TableRow key={row}>
              {columns.map((column, index) => (
                <TableCell
                  key={index}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  <Skeleton
                    className={cn(
                      "h-4",
                      column.width ?? "w-24",
                      column.align === "right" && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
