// components/business-assoicates/BusinessAsscoiatesToolBar.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  query: string;
  type: string; // "all" | "ba" | "standard"
  total: number;
};

export default function BusinessAssociatesToolbar({
  query,
  type,
  total,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query);
  const [, startTransition] = useTransition();

  // Keep the input in sync if the URL changes externally (e.g. back button)
  useEffect(() => {
    setSearch(query);
  }, [query]);

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    params.delete("page"); // reset pagination whenever filters change

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Debounce search input -> URL
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== query) {
        updateParams({ q: search || undefined });
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Business Associates
        </h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "organisation" : "organisations"} found
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 sm:w-64"
          />
        </div>

        <Select
          value={type}
          onValueChange={(value) =>
            updateParams({ type: value === "all" ? undefined : value })
          }
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All organisations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisations</SelectItem>
            <SelectItem value="ba">Business associates</SelectItem>
            <SelectItem value="standard">Standard orgs</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}