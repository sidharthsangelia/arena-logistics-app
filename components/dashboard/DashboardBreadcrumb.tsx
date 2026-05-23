"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  dashboard:  "Overview",
  rates:      "Rate Calculator",
  book:       "Book Order",
  track:      "Track Shipment",
  shipments:  "Shipments",
  invoices:   "Invoices",
  settings:   "Settings",
};

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <span className="text-muted-foreground text-sm font-medium">
            Arena Cargo
          </span>
        </BreadcrumbItem>
        {segments.map((seg, i) => (
          <>
            <BreadcrumbSeparator key={`sep-${i}`} />
            <BreadcrumbItem key={seg}>
              <BreadcrumbPage className="capitalize">
                {ROUTE_LABELS[seg] ?? seg}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}