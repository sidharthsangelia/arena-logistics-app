/**
 * lib/help/routes.ts
 *
 * Matching an app path to the article that explains it. Pure, shared by the
 * "?" button (server side) and the coverage test.
 *
 * Patterns use the App Router's own spelling, relative to the dashboard root:
 * "/shipments/[id]" matches "/shipments/abc123". Exact segments beat dynamic
 * ones, so "/invoices/new" wins over "/invoices/[id]" for the path
 * "/invoices/new".
 */

export type HelpRouteScope = "tenant" | "arena";

export const ARENA_BASE_PATH = "/arena-dashboard";

/** Splits a pathname into its scope and its path relative to that dashboard. */
export function scopeOfPath(pathname: string): {
  scope: HelpRouteScope;
  path: string;
} {
  const clean = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (clean === ARENA_BASE_PATH || clean.startsWith(`${ARENA_BASE_PATH}/`)) {
    return { scope: "arena", path: clean.slice(ARENA_BASE_PATH.length) || "/" };
  }
  return { scope: "tenant", path: clean };
}

function segments(p: string): string[] {
  return p.split("/").filter(Boolean);
}

function isDynamic(seg: string): boolean {
  return seg.startsWith("[") && seg.endsWith("]");
}

/**
 * Returns a specificity score when `pattern` matches `path`, or -1. Higher is
 * more specific: each exact segment counts 2, each dynamic segment 1.
 */
export function matchRoute(pattern: string, path: string): number {
  const ps = segments(pattern);
  const xs = segments(path);
  if (ps.length !== xs.length) return -1;
  let score = 0;
  for (let i = 0; i < ps.length; i++) {
    if (isDynamic(ps[i])) {
      score += 1;
    } else if (ps[i] === xs[i]) {
      score += 2;
    } else {
      return -1;
    }
  }
  return score;
}

/**
 * Turns an `app/` page file path into its route pattern, dropping route groups.
 * "app/(tenant)/shipments/[id]/page.tsx" → { scope: "tenant", path: "/shipments/[id]" }
 */
export function routeFromPageFile(file: string): {
  scope: HelpRouteScope;
  path: string;
} {
  const parts = file
    .replace(/\\/g, "/")
    .replace(/^.*?app\//, "")
    .replace(/\/?page\.tsx?$/, "")
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  return scopeOfPath(`/${parts.join("/")}`);
}
