import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getArenaAuth } from "@/utils/arena-auth";
import { ManualInvoiceStatus } from "@/generated/prisma";
import { getInvoiceIssuer } from "@/lib/invoices/tax/config";
import {
  getManualInvoiceDetail,
  listChargePresets,
  listChargeTypes,
  listForwarderProducts,
  listForwarders,
  listServiceTypes,
} from "@/lib/invoices/manual/queries";
import { ManualInvoiceBuilder } from "@/components/invoices/manual/ManualInvoiceBuilder";

export const metadata = {
  title: "Edit draft invoice",
};

/**
 * Editing is drafts only. An issued invoice is frozen, and the redirect here
 * matches the refusal in saveManualInvoiceAction rather than duplicating the
 * rule: the action is the authority, and this just avoids showing a form whose
 * save could never succeed.
 */
export default async function EditManualInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  const { id } = await params;

  const [
    invoice,
    catalog,
    presets,
    serviceHistory,
    forwarderHistory,
    productHistory,
  ] = await Promise.all([
    getManualInvoiceDetail(id),
    listChargeTypes(),
    listChargePresets(),
    listServiceTypes(),
    listForwarders(),
    listForwarderProducts(),
  ]);

  if (!invoice) notFound();
  if (invoice.status !== ManualInvoiceStatus.DRAFT) {
    redirect(`/arena-dashboard/invoices/manual/${id}`);
  }

  const issuer = getInvoiceIssuer();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/arena-dashboard/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Draft invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For {invoice.party?.legalName ?? "a customer"}. Not numbered yet, so
          edit freely.
        </p>
      </div>

      <ManualInvoiceBuilder
        initial={invoice}
        catalog={catalog}
        presets={presets}
        serviceHistory={serviceHistory}
        forwarderHistory={forwarderHistory}
        productHistory={productHistory}
        sellerStateCode={issuer.stateCode}
      />
    </div>
  );
}
