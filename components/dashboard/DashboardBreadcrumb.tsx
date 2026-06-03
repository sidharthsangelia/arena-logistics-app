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

const ROUTE_LABELS: Record<string, string> = {
  clients: "Clients",
  rates: "Rate Calculator",
  book: "Book Shipment",
  track: "Track Shipment",
  shipments: "Shipments",
  quotes: "Quotes",
  invoices: "Invoices",
  settings: "Settings",
  vault: "Document Vault",
};

function formatSegment(segment: string) {
  return (
    ROUTE_LABELS[segment] ??
    segment
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>

        {/* Root */}

        <BreadcrumbItem>
          {pathname === "/" ? (
            <BreadcrumbPage>Overview</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href="/">Overview</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {segments.map((segment, index) => {
          const href =
            "/" + segments.slice(0, index + 1).join("/");

          const isLast =
            index === segments.length - 1;

          return (
            <div
              key={href}
              className="flex items-center"
            >
              <BreadcrumbSeparator />

              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>
                    {formatSegment(segment)}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>
                      {formatSegment(segment)}
                    </Link>
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