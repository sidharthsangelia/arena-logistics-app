type LastActivity = {
  type: "quote" | "shipment";
  label: string;
  date: Date;
} | null;

type Props = {
  totalShipments: number;
  totalQuotes: number;
  acceptanceRate: number;
  acceptedCount: number;
  lastActivity: LastActivity;
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(d);
}

// The four numbers that say how this client is doing. They used to sit in four
// tinted tiles; the figures are large enough to carry themselves, so they are
// separated by whitespace and one rule above the row instead.
export default function ClientDetailStats({
  totalShipments,
  totalQuotes,
  acceptanceRate,
  acceptedCount,
  lastActivity,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-4">
      <Stat label="Total shipments" value={String(totalShipments)} sub="All time" />
      <Stat label="Total quotes" value={String(totalQuotes)} sub="All time" />
      <Stat
        label="Quote win rate"
        value={`${acceptanceRate}%`}
        sub={`${acceptedCount} of ${totalQuotes} accepted`}
      />
      <Stat
        label="Last activity"
        value={lastActivity ? fmtDate(lastActivity.date) : "None yet"}
        sub={
          lastActivity
            ? `${lastActivity.type === "shipment" ? "Shipment" : "Quote"} ${lastActivity.label}`
            : "No quotes or shipments"
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
