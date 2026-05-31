"use client";

/**
 * src/components/quotes/QuotesFilters.tsx
 *
 * URL-driven search + status filter. No local state — all filter state
 * lives in the URL so filters survive refresh and are shareable.
 *
 * Uses router.replace (not push) to avoid polluting browser history with
 * every keystroke.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QuoteStatus } from "@/generated/prisma";

const STATUS_TABS: { value: QuoteStatus | ""; label: string }[] = [
  { value: "",          label: "All"       },
  { value: "DRAFT",     label: "Draft"     },
  { value: "SENT",      label: "Sent"      },
  { value: "ACCEPTED",  label: "Accepted"  },
  { value: "EXPIRED",   label: "Expired"   },
  { value: "CANCELLED", label: "Cancelled" },
];

interface Props {
  query: string;
  status: QuoteStatus | "";
}

export default function QuotesFilters({ query, status }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const push = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    }
    params.delete("page");
    router.replace(`/quotes?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Tabs
        value={status}
        onValueChange={(v) => push({ status: v })}
      >
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Input
        placeholder="Search quotes…"
        defaultValue={query}
        className="w-[240px]"
        onChange={(e) => push({ q: e.target.value })}
      />
    </div>
  );
}