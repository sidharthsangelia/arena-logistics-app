import { FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function InvoicesPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Invoices
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View and download your shipment invoices.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="text-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <FileText className="h-8 w-8 text-slate-500" />
          </div>
          <CardTitle className="text-xl">Invoices Coming Soon</CardTitle>
          <CardDescription className="max-w-sm mx-auto mt-2">
            Invoice generation and download will be available once shipment
            booking is live.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}