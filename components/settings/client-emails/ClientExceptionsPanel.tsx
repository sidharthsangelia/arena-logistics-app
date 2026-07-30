"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchClientEmailRoster,
  setClientEmailPreference,
} from "@/actions/settings/clientEmails.action";
import {
  CLIENT_EMAIL_PREFERENCE_CONFIG,
  CLIENT_EMAIL_PREFERENCES,
  type ClientEmailPreferenceKey,
} from "@/lib/email/clientEmails";
import type { ClientEmailRoster, ClientEmailRosterRow } from "@/lib/email/queries";

/**
 * PER-CLIENT EXCEPTIONS
 * -----------------------------------------------------------------------------
 * Three states rather than a switch, because a switch cannot express the useful
 * one. "Default" means a client keeps moving with the account setting, so someone
 * who turns client emails on later does not find that the twelve clients they
 * touched months ago are silently pinned to the old answer.
 *
 * Each change saves on its own, immediately. This is a list of small independent
 * decisions, not a form, and a Save button under a paginated list would quietly
 * lose whatever was changed on page two.
 *
 * The list loads when this panel mounts, which is when the dialog opens. Nobody
 * pays for a paginated query on a settings screen they opened to flip one switch.
 */

const rosterKey = (page: number, query: string, exceptionsOnly: boolean) =>
  ["client-email-roster", page, query, exceptionsOnly] as const;

export function ClientExceptionsPanel({ orgEnabled }: { orgEnabled: boolean }) {
  const queryClient = useQueryClient();

  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [exceptionsOnly, setExceptionsOnly] = React.useState(false);

  // Debounced so typing does not fire a query per keystroke. Any new search goes
  // back to the first page, or you can end up on page three of two results.
  React.useEffect(() => {
    const id = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: rosterKey(page, query, exceptionsOnly),
    queryFn: async (): Promise<ClientEmailRoster> => {
      const result = await fetchClientEmailRoster({
        page,
        query: query || undefined,
        exceptionsOnly,
      });
      if (!result.ok) throw new Error(result.error);
      return result.roster;
    },
    // Keeps the previous page on screen while the next one loads, so paging does
    // not collapse the dialog to a stack of skeletons and back.
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const { mutate: changePreference, isPending: isSaving } = useMutation({
    mutationFn: async (vars: {
      row: ClientEmailRosterRow;
      preference: ClientEmailPreferenceKey;
    }) => {
      const result = await setClientEmailPreference({
        clientId: vars.row.id,
        preference: vars.preference,
      });
      if (!result.ok) throw new Error(result.error);
      return vars;
    },

    // Optimistic, so a click lands instantly on a list where several clicks in a
    // row is the normal way to use this.
    onMutate: async (vars) => {
      const key = rosterKey(page, query, exceptionsOnly);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ClientEmailRoster>(key);

      queryClient.setQueryData<ClientEmailRoster>(key, (current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((r) =>
                r.id === vars.row.id ? { ...r, preference: vars.preference } : r,
              ),
            }
          : current,
      );

      return { previous, key };
    },

    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error("Could not save that", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    },

    onSuccess: ({ row, preference }) => {
      toast.success(
        preference === "INHERIT"
          ? `${row.companyName} follows your setting again`
          : preference === "ALWAYS"
            ? `${row.companyName} will always be emailed`
            : `${row.companyName} will never be emailed`,
      );
    },

    // Counts and the exceptions-only filter both shift under a change, so settle
    // every page of the list rather than just the one on screen.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["client-email-roster"] });
    },
  });

  const rows = data?.rows ?? [];
  const pageCount = data?.pageCount ?? 1;

  return (
    <div className="space-y-4">
      {/* Controls are static, so they are usable the instant the dialog opens
          rather than appearing once the first page of clients lands. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Find a client by name or email"
            className="pl-8"
            aria-label="Find a client"
          />
        </div>

        <Button
          variant={exceptionsOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setExceptionsOnly((v) => !v);
            setPage(1);
          }}
        >
          {exceptionsOnly ? "Showing exceptions" : "Exceptions only"}
        </Button>
      </div>

      {isPending ? (
        <RosterRowsSkeleton />
      ) : isError ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            We could not load your clients.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {query
            ? `No clients match "${query}".`
            : exceptionsOnly
              ? "No exceptions. Every client follows your setting, which is usually what you want."
              : "You have not added any clients yet."}
        </p>
      ) : (
        <ul
          className={cn(
            "divide-y transition-opacity",
            (isPlaceholderData || isSaving) && "opacity-70",
          )}
        >
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2.5 py-3 lg:flex-row lg:items-center lg:justify-between"
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
                disabled={isSaving}
                onChange={(next) => {
                  if (next === row.preference) return;
                  changePreference({ row, preference: next });
                }}
                labelledBy={row.companyName}
              />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {pageCount} · {data?.totalRows ?? 0}{" "}
            {data?.totalRows === 1 ? "client" : "clients"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Only the rows: the search box and the filter above them are already real. */
function RosterRowsSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2.5 py-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-9 w-52 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * Three mutually exclusive choices as a segmented control.
 *
 * A radio group is the semantically obvious answer, but three radios per row down
 * a paginated list is a lot of weight for a setting most clients never leave.
 * Buttons with aria-pressed inside a labelled group stay announced correctly and
 * one line tall.
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

        // What the default means depends on the switch on the tab behind this
        // dialog, so spell it out rather than making someone hold both at once.
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
