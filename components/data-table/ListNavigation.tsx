"use client";

// components/data-table/ListNavigation.tsx
//
// THE REASON THIS EXISTS
// A URL-driven list has one bad habit: every keystroke in the search box is a
// navigation, and a navigation that suspends replaces the table with a skeleton.
// Type five letters and the screen strobes five times. Skeletons make a page
// feel fast on first paint and sluggish on every interaction after it.
//
// The fix is to navigate inside a transition. React then keeps the rows that are
// already on screen until the next set is ready, and `isPending` tells the UI to
// look busy rather than look empty. Skeletons are left to do the one job they
// are good at: the first load, where there is genuinely nothing to show.
//
// The caller must NOT put a changing `key` on the Suspense boundary around the
// table. A new key forces a remount, which brings the fallback straight back and
// undoes all of this.
//
// This file is the only client component in the list. The toolbar consumes the
// context to navigate, StaleWhileNavigating consumes it to dim, and the table
// itself stays a server component rendered through `children`.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type ParamPatch = Record<string, string | undefined>;

type ListNavigationValue = {
  /** True while the next page of results is on its way. */
  isPending: boolean;
  /**
   * Merge values into the list's query string and navigate. An undefined value
   * removes that key. Pagination always resets, because landing on page 7 of a
   * filter you just changed is never what anyone meant.
   */
  setParams: (patch: ParamPatch) => void;
};

const ListNavigationContext = createContext<ListNavigationValue | null>(null);

export function useListNavigation(): ListNavigationValue {
  const value = useContext(ListNavigationContext);

  if (!value) {
    throw new Error(
      "useListNavigation must be used inside a <ListNavigationProvider>.",
    );
  }

  return value;
}

type ProviderProps = {
  /** Route the list lives at, e.g. "/arena-dashboard/accounts". */
  basePath: string;
  /**
   * The filters currently in the URL, as the server parsed them. Passed in
   * rather than read with useSearchParams so this component never triggers a
   * client-side bail-out, and so the server stays the single source of truth for
   * what the list is showing.
   */
  params: ParamPatch;
  children: ReactNode;
};

export function ListNavigationProvider({
  basePath,
  params,
  children,
}: ProviderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Serialised so the callback below is not rebuilt on every render just because
  // the server handed down a fresh object with identical contents.
  const paramsKey = JSON.stringify(params);

  const setParams = useCallback(
    (patch: ParamPatch) => {
      const current = JSON.parse(paramsKey) as ParamPatch;
      const next = new URLSearchParams();

      for (const [key, value] of Object.entries({ ...current, ...patch })) {
        if (value) next.set(key, value);
      }

      const qs = next.toString();
      const href = qs ? `${basePath}?${qs}` : basePath;

      // startTransition is the whole point: it is what lets React hold the old
      // rows on screen instead of falling back to the Suspense skeleton.
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [basePath, paramsKey, router],
  );

  const value = useMemo(
    () => ({ isPending, setParams }),
    [isPending, setParams],
  );

  return (
    <ListNavigationContext.Provider value={value}>
      {children}
    </ListNavigationContext.Provider>
  );
}

/**
 * Wraps the results while they are being replaced. The rows stay readable and
 * stay put, they simply stop responding to clicks that are about to be answered
 * with different data.
 *
 * `children` is whatever the caller passes, normally a server-rendered table
 * inside its own Suspense boundary. Nothing here forces it to become a client
 * component.
 */
export function StaleWhileNavigating({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isPending } = useListNavigation();

  return (
    <div
      aria-busy={isPending}
      className={cn(
        "transition-opacity duration-200 motion-reduce:transition-none",
        isPending && "pointer-events-none opacity-60",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A hairline progress bar for the top of the list. Communicates "working" in the
 * spot the eye is already on, without the layout shift a spinner in the toolbar
 * would cause.
 */
export function ListNavigationProgress() {
  const { isPending } = useListNavigation();

  return (
    <div
      className="h-px w-full overflow-hidden bg-border"
      role="presentation"
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full w-1/5 rounded-full bg-primary transition-opacity duration-200",
          "motion-reduce:animate-none motion-reduce:w-full",
          isPending ? "animate-list-sweep opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
