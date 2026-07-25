import { TenantInvoicesTable } from "@/components/invoices/TenantInvoicesTable";

export const metadata = {
  title: "Invoices",
};

export default function InvoicesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bills from Arena for your shipments. View or download any invoice.
        </p>
      </div>

      <TenantInvoicesTable />
    </div>
  );
}
