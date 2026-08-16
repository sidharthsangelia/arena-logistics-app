"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function BusinessAssociatesSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  /**
   * `searchParams` is a new object after every navigation — including the one
   * this effect itself causes — so listing it would make the effect retrigger
   * its own debounce in a loop. `router` and `pathname` are stable in practice
   * but are not contractually so.
   *
   * The suppression hid a real bug behind that, though: the effect closed over
   * the `searchParams` from whenever `value` last changed, so a filter applied
   * in another control after the user stopped typing would be silently dropped
   * from the URL this push builds. An effect event reads them at fire time, so
   * the debounce stays keyed on typing while the params are always current.
   */
  const pushSearch = useEffectEvent((term: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    params.delete("page"); // any new search resets back to page 1

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  });

  useEffect(() => {
    const handle = setTimeout(() => pushSearch(value), 300);
    return () => clearTimeout(handle);
  }, [value]);

  return (
    <div className="relative w-full sm:w-[280px]">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search by name or slug..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-8"
        aria-label="Search business associates"
      />
    </div>
  );
}