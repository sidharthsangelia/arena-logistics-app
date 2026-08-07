import Link from "next/link";
import type { ShipmentStatus } from "@/generated/prisma";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { fmt } from "@/utils/helpers";

export type ClientShipmentRow = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  quotedTotal: unknown;
  currency: string;
  createdAt: Date;
  pickupAddress: { city: string };
  deliveryAddress: { city: string };
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(d);
}

// Five rows, read left to right: which shipment, where it goes, how it is
// doing, what it cost. No card, no zebra fill, no outlined status pills — the
// status keeps its colour as a dot, which is the only thing the colour was
// ever for.
export default function ClientRecentShipments({
  shipments,
  totalCount,
}: {
  shipments: ClientShipmentRow[];
  totalCount: number;
}) {
  return (
    <section className="space-y-5">
      <SectionHeading right={`${totalCount} total`}>
        Recent shipments
      </SectionHeading>

      {shipments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No shipments for this client yet.
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-lg text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Shipment
                </th>
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Route
                </th>
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Status
                </th>
                <th className="px-2 pb-2 text-right text-xs font-normal text-muted-foreground">
                  Amount
                </th>
                <th className="px-2 pb-2 text-right text-xs font-normal text-muted-foreground">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {shipments.map((s) => {
                const cfg = STATUS_CONFIG[s.status];
                return (
                  <tr key={s.id} className="group">
                    <td className="px-2 py-3">
                      <Link
                        href={`/shipments/${s.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {s.shipmentNumber}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {s.pickupAddress.city} → {s.deliveryAddress.city}
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-2 whitespace-nowrap text-foreground">
                        <span
                          className={`h-1.75 w-1.75 shrink-0 rounded-full ${cfg.dotClassName}`}
                        />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right font-medium tabular-nums text-foreground">
                      {s.quotedTotal != null
                        ? fmt(Number(s.quotedTotal), s.currency)
                        : "—"}
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {fmtDate(s.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
