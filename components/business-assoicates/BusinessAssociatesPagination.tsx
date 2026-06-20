import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  totalPages: number;
  query: string;
};

export default function BusinessAssociatesPagination({ page, totalPages, query }: Props) {
  if (totalPages <= 1) return null;

  function hrefFor(target: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(target));
    return `/arena-dashboard/business-associates?${params.toString()}`;
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className={prevDisabled ? "pointer-events-none opacity-50" : ""}
        >
          <Link
            href={prevDisabled ? "#" : hrefFor(page - 1)}
            aria-disabled={prevDisabled}
            tabIndex={prevDisabled ? -1 : undefined}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className={nextDisabled ? "pointer-events-none opacity-50" : ""}
        >
          <Link
            href={nextDisabled ? "#" : hrefFor(page + 1)}
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}