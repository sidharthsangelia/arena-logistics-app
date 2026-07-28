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

export default function ClientDetailStats({
  totalShipments,
  totalQuotes,
  acceptanceRate,
  acceptedCount,
  lastActivity,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total shipments"
        value={String(totalShipments)}
        sub="All time"
      />
      <StatCard
        label="Total quotes"
        value={String(totalQuotes)}
        sub="All time"
      />
      <StatCard
        label="Quote win rate"
        value={`${acceptanceRate}%`}
        sub={`${acceptedCount} of ${totalQuotes} accepted`}
      />
      <StatCard
        label="Last activity"
        value={lastActivity ? fmtDate(lastActivity.date) : "—"}
        sub={
          lastActivity
            ? `${lastActivity.type === "shipment" ? "Shipment" : "Quote"} ${lastActivity.label}`
            : "No activity yet"
        }
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-medium leading-none tracking-tight">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
