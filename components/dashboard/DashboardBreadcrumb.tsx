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
// ─────────────────────────────────────────────────────────────────────────────

const TENANT_LABELS: Record<string, string> = {
  dashboard: "Overview",
  clients: "Clients",
  rates: "Rate Calculator",
  "domestic-rates": "Domestic Rates",
  book: "Book Shipment",
  track: "Track Shipment",
  shipments: "Shipments",
  quotes: "Quotes",
  invoices: "Invoices",
  settings: "Settings",
  "document-vault": "Document Vault",
  debug: "Debug",
  upload: "Upload",
};

const ARENA_LABELS: Record<string, string> = {
  "arena-dashboard": "Overview",
  bookings: "Bookings",
  clients: "Clients",
  "rate-cards": "Rate Cards",
  upload: "Upload Rates",
  settings: "Settings",
  orgs: "Organisations",
  notices: "Dashboard Notices",
  "business-associates": "Business Associates",
};

const LABEL_MAPS: Record<string, Record<string, string>> = {
  tenant: TENANT_LABELS,
  arena: ARENA_LABELS,
};

// Root label shown as the first crumb
const ROOT_LABELS: Record<string, string> = {
  tenant: "Overview",
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