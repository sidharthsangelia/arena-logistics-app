"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// ─────────────────────────────────────────────────────────────────────────────
// Route label maps — tenant and arena have different route vocabularies
//
// Each entry mirrors the nav row title in AppSideBar.tsx, so the crumb reads
// back the label the user just clicked. Rename a nav item, rename it here too.
// A segment with no entry falls back to title-cased words, which is why the
// map only has to cover routes whose label is not just their slug.
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_LABELS: Record<string, string> = {
  rates: "International Rates",
  "domestic-rates": "Domestic Rates",
  book: "Book Shipment",
  track: "Track Shipment",
  shipments: "Shipments",
  clients: "Clients",
  quotes: "Quotes",
  addressbook: "Address Book",
  "document-vault": "Document Vault",
  wallet: "Wallet",
  invoices: "Invoices",
  settings: "Settings",
  notifications: "Notifications",
};

const ARENA_LABELS: Record<string, string> = {
  bookings: "International Bookings",
  "domestic-bookings": "Domestic Bookings",
  track: "Track Shipment",
  rates: "International Rates",
  "domestic-rates": "Domestic Rates",
  accounts: "Accounts",
  "business-associates": "Business Associates",
  clients: "Clients",
  quotes: "Quotes",
  "document-vault": "Document Vault",
  "rate-sweeps": "Rate Sweeps",
  wallets: "Wallets",
  invoices: "Invoices",
  customers: "Billing Customers",
  notices: "Notices",
  notifications: "Notifications",
};

const LABEL_MAPS: Record<string, Record<string, string>> = {
  tenant: TENANT_LABELS,
  arena: ARENA_LABELS,
};

// Root label shown as the first crumb — matches the top nav row of each variant
const ROOT_LABELS: Record<string, string> = {
  tenant: "Dashboard",
  arena: "Overview",
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardBreadcrumbProps {
  /** Matches AppSidebar variant — "tenant" | "arena" */
  variant: "tenant" | "arena";
  /** Base path for this variant — e.g. "/dashboard" or "/arena-dashboard"
   *  Segments matching this path are stripped from the breadcrumb trail */
  basePath: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatSegment(segment: string, labelMap: Record<string, string>) {
  return (
    labelMap[segment] ??
    segment
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardBreadcrumb({ variant, basePath }: DashboardBreadcrumbProps) {
  const pathname = usePathname();
  const labelMap = LABEL_MAPS[variant];
  const rootLabel = ROOT_LABELS[variant];

  // Strip leading slash and split — e.g. "/dashboard/clients/123" → ["dashboard","clients","123"]
  const allSegments = pathname.split("/").filter(Boolean);

  // Strip the basePath segments so breadcrumb starts after the root
  // e.g. basePath="/dashboard" removes the "dashboard" segment
  // e.g. basePath="/arena-dashboard" removes "arena-dashboard"
  const baseSegments = basePath.split("/").filter(Boolean);
  const segments = allSegments.slice(baseSegments.length);

  const isRoot = segments.length === 0;

  return (
    <Breadcrumb>
      <BreadcrumbList>

        {/* Root crumb — always first */}
        <BreadcrumbItem>
          {isRoot ? (
            <BreadcrumbPage>{rootLabel}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href={basePath}>{rootLabel}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {/* Remaining segments */}
        {segments.map((segment, index) => {
          // Build href relative to basePath
          const href = basePath + "/" + segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;

          // Skip dynamic segments that look like IDs (cuid, uuid, numeric)
          // They render as the parent's detail view — not useful as crumb labels
          const isDynamic = /^[a-z0-9]{20,}$|^\d+$|^[0-9a-f-]{36}$/.test(segment);
          const label = isDynamic ? "Detail" : formatSegment(segment, labelMap);

          return (
            <div key={href} className="flex items-center">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}

      </BreadcrumbList>
    </Breadcrumb>
  );
}