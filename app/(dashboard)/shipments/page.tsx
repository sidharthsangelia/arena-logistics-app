import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type ShipmentStatus = "In Transit" | "Delivered" | "Pending" | "Delayed";

const SHIPMENTS: {
  id: string;
  origin: string;
  destination: string;
  carrier: string;
  status: ShipmentStatus;
  date: string;
  weight: string;
}[] = [
  { id: "AWB-20240512-001", origin: "New Delhi, IN",  destination: "Sydney, AU",    carrier: "Aramex", status: "In Transit", date: "12 May 2025", weight: "3.2 kg" },
  { id: "AWB-20240511-004", origin: "Mumbai, IN",     destination: "Dubai, UAE",    carrier: "Skart",  status: "Delivered",  date: "11 May 2025", weight: "1.8 kg" },
  { id: "AWB-20240510-002", origin: "Bangalore, IN",  destination: "London, UK",    carrier: "Aramex", status: "Delivered",  date: "10 May 2025", weight: "5.0 kg" },
  { id: "AWB-20240509-007", origin: "Chennai, IN",    destination: "Singapore, SG", carrier: "Skart",  status: "Delayed",    date: "9 May 2025",  weight: "2.1 kg" },
  { id: "AWB-20240508-003", origin: "New Delhi, IN",  destination: "New York, US",  carrier: "Aramex", status: "Pending",    date: "8 May 2025",  weight: "0.9 kg" },
  { id: "AWB-20240507-009", origin: "Kolkata, IN",    destination: "Toronto, CA",   carrier: "Aramex", status: "Delivered",  date: "7 May 2025",  weight: "4.5 kg" },
  { id: "AWB-20240506-005", origin: "Hyderabad, IN",  destination: "Tokyo, JP",     carrier: "Skart",  status: "Delivered",  date: "6 May 2025",  weight: "1.2 kg" },
];

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  "In Transit": "bg-blue-50   text-blue-700   border-blue-200",
  "Delivered":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Pending":    "bg-slate-50  text-slate-600  border-slate-200",
  "Delayed":    "bg-red-50    text-red-700    border-red-200",
};

export default function ShipmentsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Shipments
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Full history of all your shipments.
          </p>
        </div>
        <Badge variant="secondary" className="mt-1">
          {SHIPMENTS.length} total
        </Badge>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">All Shipments</CardTitle>
          </div>
          <CardDescription>Sorted by most recent first</CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60">
                  {["AWB / ID", "Route", "Carrier", "Weight", "Status", "Date"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIPMENTS.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${
                      i % 2 === 0 ? "" : "bg-slate-50/30"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {s.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-slate-900">{s.origin}</span>
                        <span className="text-xs text-slate-400">→ {s.destination}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{s.carrier}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{s.weight}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_STYLES[s.status]}`}
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {s.date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}