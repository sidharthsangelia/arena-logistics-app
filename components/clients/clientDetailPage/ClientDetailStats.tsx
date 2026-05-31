import { fmt } from "@/utils/helpers";


type QuoteSummary = {
  quoteNumber: string;
  createdAt: Date;
} | null;

type Props = {
  totalQuotes: number;
  totalRevenue: number;
  acceptanceRate: number;
  acceptedCount: number;
  lastQuote: QuoteSummary;
};


function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(d);
}

export default function ClientDetailStats({
  totalQuotes,
  totalRevenue,
  acceptanceRate,
  acceptedCount,
  lastQuote,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total quotes"
        value={String(totalQuotes)}
        sub="All time"
      />
      <StatCard
        label="Revenue"
        value={fmt(totalRevenue, "INR")}
        sub={`${acceptedCount} accepted quote${acceptedCount !== 1 ? "s" : ""}`}
      />
      <StatCard
        label="Acceptance rate"
        value={`${acceptanceRate}%`}
        sub={`${acceptedCount} of ${totalQuotes}`}
      />
      <StatCard
        label="Last quote"
        value={lastQuote ? fmtDate(lastQuote.createdAt) : "—"}
        sub={lastQuote?.quoteNumber ?? "No quotes yet"}
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