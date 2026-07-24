"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { setClientEmailPreference } from "@/actions/settings/clientEmails.action";
import {
  CLIENT_EMAIL_PREFERENCE_CONFIG,
  CLIENT_EMAIL_PREFERENCES,
  type ClientEmailPreferenceKey,
} from "@/lib/email/clientEmails";
import type { ClientEmailRosterRow } from "@/lib/email/queries";

/**
 * Per-client exceptions to the account-wide setting.
 *
 * Three states rather than a switch, because a switch cannot express the useful
 * one. "Follow my setting" means a client keeps moving with the account toggle, so
 * a BA who later turns client emails on does not discover that the twelve clients
 * they touched months ago are silently pinned to the old answer.
 *
 * Each change saves on its own, immediately. This is a list of small independent
 * decisions rather than a form, and a Save button at the bottom of a paginated
 * table would lose everything on page two.
 */
export function ClientEmailRoster({
  rows,
  totalRows,
  pageCount,
  exceptionCount,
  page,
  query,
  exceptionsOnly,
  orgEnabled,
}: {
  rows: ClientEmailRosterRow[];
  totalRows: number;
  pageCount: number;
  exceptionCount: number;
  page: number;
  query: string;
  exceptionsOnly: boolean;
  /** Drives what "Follow my setting" resolves to in the copy. */
  orgEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // Optimistic so a click lands instantly. The server action revalidates this
  // route, which replaces `rows` and retires the optimistic value.
  const [optimisticRows, applyOptimistic] = React.useOptimistic(
    rows,
    (state: ClientEmailRosterRow[], update: { id: string; preference: ClientEmailPreferenceKey }) =>
      state.map((row) =>
        row.id === update.id ? { ...row, preference: update.preference } : row,
      ),
  );

  const [searchValue, setSearchValue] = React.useState(query);

  // Adjusted during render rather than in an effect. React documents this as the
  // way to derive state from a changed prop, and it avoids the extra commit an
  // effect would cause. A keyed remount would steal focus mid-typing, since every
  // committed search changes the prop.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setSearchValue(query);
  }

  const pushParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounced so typing does not fire a query per keystroke. Cleared on unmount so
  // a pending push cannot land after the component is gone.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams((params) => {
        if (value.trim()) params.set("q", value.trim());
        else params.delete("q");
        params.delete("page"); // a new search always starts at the first page
      });
    }, 350);
  };

  const change = (row: ClientEmailRosterRow, preference: ClientEmailPreferenceKey) => {
    if (row.preference === preference) return;

    startTransition(async () => {
      applyOptimistic({ id: row.id, preference });
      const result = await setClientEmailPreference({
        clientId: row.id,
        preference,
      });

      if (!result.ok) {
        toast.error("Could not save that", { description: result.error });
        return;
      }

      toast.success(
        preference === "INHERIT"
          ? `${row.companyName} follows your setting again`
          : preference === "ALWAYS"
            ? `${row.companyName} will always be emailed`
            : `${row.companyName} will never be emailed`,
      );
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Exceptions by client</CardTitle>
            </div>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              Most clients should follow your setting above. Use this when one of them
              needs the opposite: a client who wants updates directly, or one who
              would rather hear only from you.
            </p>
          </div>

          {exceptionCount > 0 && (
            <Badge variant="outline" className="shrink-0">
              {exceptionCount} {exceptionCount === 1 ? "exception" : "exceptions"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-5">
        <div className="flex flex-wrap items-center gap-2 pb-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Find a client by name or email"
              className="pl-8"
              aria-label="Find a client"
            />
          </div>

          <Button
            variant={exceptionsOnly ? "default" : "outline"}
            size="sm"
            onClick={() =>
              pushParams((params) => {
                if (exceptionsOnly) params.delete("exceptions");
                else params.set("exceptions", "1");
                params.delete("page");
              })
            }
          >
            {exceptionsOnly ? "Showing exceptions" : "Show exceptions only"}
          </Button>
        </div>

        {optimisticRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query
              ? `No clients match "${query}".`
              : exceptionsOnly
                ? "No exceptions. Every client follows your setting above, which is usually what you want."
                : "You have not added any clients yet."}
          </p>
        ) : (
          <ul
            className={cn(
              "divide-y transition-opacity",
              isPending && "opacity-70",
            )}
          >
            {optimisticRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/clients/${row.id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {row.companyName}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.email ? (
                      row.email
                    ) : (
                      <span className="text-amber-700">
                        No email on file, so this client cannot be emailed either way
                      </span>
                    )}
                    {row.shipmentCount > 0 && (
                      <>
                        {" · "}
                        {row.shipmentCount}{" "}
                        {row.shipmentCount === 1 ? "shipment" : "shipments"}
                      </>
                    )}
                  </p>
                </div>

                <PreferenceToggle
                  value={row.preference}
                  orgEnabled={orgEnabled}
                  disabled={isPending}
                  onChange={(next) => change(row, next)}
                  labelledBy={row.companyName}
                />
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Page {page} of {pageCount} · {totalRows}{" "}
              {totalRows === 1 ? "client" : "clients"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isPending}
                onClick={() =>
                  pushParams((params) => params.set("page", String(page - 1)))
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || isPending}
                onClick={() =>
                  pushParams((params) => params.set("page", String(page + 1)))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Three mutually exclusive choices, shown as a segmented control.
 *
 * A native radio group would be the semantically obvious choice, but three radios
 * per row across a paginated list is a lot of visual weight for a setting most
 * clients never leave. Buttons with `aria-pressed` inside a labelled group keep it
 * announced correctly while staying one line tall.
 */
function PreferenceToggle({
  value,
  orgEnabled,
  disabled,
  onChange,
  labelledBy,
}: {
  value: ClientEmailPreferenceKey;
  orgEnabled: boolean;
  disabled: boolean;
  onChange: (next: ClientEmailPreferenceKey) => void;
  labelledBy: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Email preference for ${labelledBy}`}
      className="flex shrink-0 gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {CLIENT_EMAIL_PREFERENCES.map((key) => {
        const meta = CLIENT_EMAIL_PREFERENCE_CONFIG[key];
        const active = key === value;

        // The default's meaning depends on the switch above, so spell it out
        // rather than making someone hold both in their head at once.
        const title =
          key === "INHERIT"
            ? orgEnabled
              ? "Follows your setting, which is currently on, so this client is emailed."
              : "Follows your setting, which is currently off, so this client is not emailed."
            : meta.hint;

        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            title={title}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {key === "INHERIT" ? "Default" : meta.label.replace(" them", "")}
          </button>
        );
      })}
    </div>
  );
}
