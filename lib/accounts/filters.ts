// lib/accounts/filters.ts
//
// The vocabulary of the Accounts list: which filters exist, what they are
// called, and how they round-trip through the URL.
//
// This module is intentionally PURE. No Prisma, no Clerk, no "server-only", so
// the client toolbar can import the option lists and labels it renders while
// queries/accounts.ts imports the same constants to build its `where` clause.
// One definition, two consumers, no drift between the dropdown and the query.
//
// The URL is the single source of truth for list state. Nothing here holds
// state of its own, which is what makes the back button, a bookmarked filter
// and a shared link all behave the same way.

/** The route these filters serialise into. */
export const ACCOUNTS_BASE_PATH = "/arena-dashboard/accounts";

export const ACCOUNT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_ACCOUNT_PAGE_SIZE = 25;

/** Business associate, standard, or both. */
export const ACCOUNT_TYPES = ["all", "ba", "standard"] as const;
export type AccountTypeFilter = (typeof ACCOUNT_TYPES)[number];

/**
 * "Is this signup real, or did they walk away half way through?" Each value
 * maps to a condition on data we already store, so no schema change is needed
 * to answer it.
 */
export const ACCOUNT_HEALTH_FILTERS = [
  "all",
  "profile-incomplete",
  "kyc-pending",
  "never-booked",
] as const;
export type AccountHealthFilter = (typeof ACCOUNT_HEALTH_FILTERS)[number];

export const ACCOUNT_SORT_FIELDS = ["joined", "name", "shipments"] as const;
export type AccountSortField = (typeof ACCOUNT_SORT_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export type AccountFilters = {
  query: string;
  type: AccountTypeFilter;
  health: AccountHealthFilter;
  sort: AccountSortField;
  dir: SortDirection;
  page: number;
  pageSize: number;
};

export const DEFAULT_ACCOUNT_FILTERS: AccountFilters = {
  query: "",
  type: "all",
  health: "all",
  sort: "joined",
  dir: "desc",
  page: 1,
  pageSize: DEFAULT_ACCOUNT_PAGE_SIZE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeFilter, string> = {
  all: "All accounts",
  ba: "Business associates",
  standard: "Standard accounts",
};

export const ACCOUNT_HEALTH_LABELS: Record<AccountHealthFilter, string> = {
  all: "Any signup status",
  "profile-incomplete": "Profile incomplete",
  "kyc-pending": "KYC not verified",
  "never-booked": "Never booked",
};

/**
 * Sort field and direction are one control in the UI, because "sort by name,
 * descending" is two decisions to answer a question nobody asks. These four
 * cover what the list is actually used for.
 */
export const ACCOUNT_SORT_OPTIONS = [
  { value: "joined:desc", label: "Newest first", sort: "joined", dir: "desc" },
  { value: "joined:asc", label: "Oldest first", sort: "joined", dir: "asc" },
  { value: "name:asc", label: "Name A to Z", sort: "name", dir: "asc" },
  {
    value: "shipments:desc",
    label: "Most shipments",
    sort: "shipments",
    dir: "desc",
  },
] as const satisfies readonly {
  value: string;
  label: string;
  sort: AccountSortField;
  dir: SortDirection;
}[];

export type AccountSortOptionValue =
  (typeof ACCOUNT_SORT_OPTIONS)[number]["value"];

/** The option the current filters correspond to, for the select's value. */
export function accountSortValue(filters: AccountFilters): string {
  const match = ACCOUNT_SORT_OPTIONS.find(
    (option) => option.sort === filters.sort && option.dir === filters.dir,
  );

  return match?.value ?? "joined:desc";
}

/**
 * A sort field and direction as URL params, defaults omitted. Shared by the
 * sort dropdown and the clickable column headers so both write the same URL for
 * the same order, and neither can invent a param the parser will not read back.
 */
export function accountSortParams(
  sort: AccountSortField,
  dir: SortDirection,
): { sort: string | undefined; dir: string | undefined } {
  return {
    sort: sort === DEFAULT_ACCOUNT_FILTERS.sort ? undefined : sort,
    dir: dir === DEFAULT_ACCOUNT_FILTERS.dir ? undefined : dir,
  };
}

/** Splits a select value back into the two URL params it stands for. */
export function accountSortToParams(
  value: string,
): { sort: string | undefined; dir: string | undefined } {
  const match = ACCOUNT_SORT_OPTIONS.find((option) => option.value === value);

  if (!match) return { sort: undefined, dir: undefined };

  return accountSortParams(match.sort, match.dir);
}

// ─────────────────────────────────────────────────────────────────────────────
// URL ⇄ filters
// ─────────────────────────────────────────────────────────────────────────────

export type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function readOneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readString(value);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Anything malformed falls back to a default rather than throwing. These values
 * come from the address bar, so a hand-edited or stale link is expected input,
 * not an error worth showing anybody.
 */
export function parseAccountFilters(sp: RawSearchParams): AccountFilters {
  const rawPage = Number(readString(sp.page));
  const page =
    Number.isFinite(rawPage) && rawPage > 0
      ? Math.floor(rawPage)
      : DEFAULT_ACCOUNT_FILTERS.page;

  const rawPageSize = Number(readString(sp.pageSize));
  const pageSize = (ACCOUNT_PAGE_SIZE_OPTIONS as readonly number[]).includes(
    rawPageSize,
  )
    ? rawPageSize
    : DEFAULT_ACCOUNT_PAGE_SIZE;

  return {
    query: readString(sp.q).trim(),
    type: readOneOf(sp.type, ACCOUNT_TYPES, DEFAULT_ACCOUNT_FILTERS.type),
    health: readOneOf(
      sp.health,
      ACCOUNT_HEALTH_FILTERS,
      DEFAULT_ACCOUNT_FILTERS.health,
    ),
    sort: readOneOf(sp.sort, ACCOUNT_SORT_FIELDS, DEFAULT_ACCOUNT_FILTERS.sort),
    dir: readOneOf(sp.dir, ["asc", "desc"] as const, DEFAULT_ACCOUNT_FILTERS.dir),
    page,
    pageSize,
  };
}

/**
 * The inverse: filters back to a query string, with defaults omitted so a URL
 * only ever carries what actually differs from the plain list. Used to build
 * pagination links on the server.
 */
export function accountFiltersToQuery(
  filters: AccountFilters,
): Record<string, string | undefined> {
  return {
    q: filters.query || undefined,
    type: filters.type === "all" ? undefined : filters.type,
    health: filters.health === "all" ? undefined : filters.health,
    sort: filters.sort === DEFAULT_ACCOUNT_FILTERS.sort ? undefined : filters.sort,
    dir: filters.dir === DEFAULT_ACCOUNT_FILTERS.dir ? undefined : filters.dir,
    pageSize:
      filters.pageSize === DEFAULT_ACCOUNT_PAGE_SIZE
        ? undefined
        : String(filters.pageSize),
  };
}

/** True when the viewer has narrowed the list in any way. Drives empty-state copy. */
export function hasActiveAccountFilters(filters: AccountFilters): boolean {
  return (
    filters.query.length > 0 || filters.type !== "all" || filters.health !== "all"
  );
}
