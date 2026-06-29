// components/business-assoicates/StatCard.tsx
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string | number;
};

export default function StatCard({ icon: Icon, label, value }: Props) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}