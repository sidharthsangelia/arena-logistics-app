"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  totalPages: number;
  query: string;
};

export default function ClientsPagination({
  page,
  totalPages,
  query,
}: Props) {
  const router = useRouter();

  if (totalPages <= 1) {
    return null;
  }

  function goTo(nextPage: number) {
    const params = new URLSearchParams();

    if (query) {
      params.set("q", query);
    }

    params.set("page", String(nextPage));

    router.push(
      `/clients?${params.toString()}`
    );
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          Previous
        </Button>

        <Button
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}