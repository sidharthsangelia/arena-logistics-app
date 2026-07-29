import { Card, CardContent } from "@/components/ui/card";

type Counts = {
  clients: number;
  quotes: number;
  documents: number;
  vendorKeys: number;
};

type Props = {
  counts: Counts;
};

const STAT_LABELS: Array<{ key: keyof Counts; label: string }> = [
  { key: "clients", label: "Clients" },
  { key: "quotes", label: "Quotes" },
  { key: "vendorKeys", label: "Active Carrier Integrations" },
  { key: "documents", label: "Documents" },
];

export default function OrgStatsGrid({ counts }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STAT_LABELS.map(({ key, label }) => (
        <Card key={key}>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tracking-tight">{counts[key]}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}