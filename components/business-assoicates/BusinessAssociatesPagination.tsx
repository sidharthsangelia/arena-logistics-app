// components/business-assoicates/BusinessAssociatesPagination.tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  totalPages: number;
  searchParams?: Record<string, string | undefined>;
};

export default function BusinessAssociatesPagination({
  page,
  totalPages,
  searchParams = {},
}: Props) {
  if (totalPages <= 1) return null;

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return `/arena-dashboard/business-associates${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        {page <= 1 ? (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Link>
          </Button>
        )}

        {page >= totalPages ? (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildHref(page + 1)}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}