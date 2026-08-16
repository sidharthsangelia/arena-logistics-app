import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  getInvoiceIssuer,
  issuerIsConfigured,
  issuerStateMatchesGstin,
} from "@/lib/invoices/tax/config";
import { gstStateName } from "@/lib/invoices/tax/gst";
import {
  listChargePresets,
  listChargeTypes,
  listServiceTypes,
} from "@/lib/invoices/manual/queries";
import { ManualInvoiceBuilder } from "@/components/invoices/manual/ManualInvoiceBuilder";
import { ManualInvoiceBuilderSkeleton } from "@/components/invoices/manual/ManualInvoiceBuilderSkeleton";

export const metadata = {
  title: "New invoice",
};

/**
 * Raise an invoice for work that never went through the platform.
 *
 * Admin-only, and the check here is not redundant with proxy.ts: proxy is an
 * optimistic redirect, and every action re-checks besides. See
 * utils/arena-auth.ts.
 */
export default async function NewManualInvoicePage() {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  // Read from the environment, not the database, so both warnings below are
  // decided before anything is fetched. They are also the two things on this
  // screen that must not arrive late: someone who starts typing an invoice
  // before being told the issuer details are missing has wasted the entry.
  const issuer = getInvoiceIssuer();
  const configured = issuerIsConfigured(issuer);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/arena-dashboard/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For a shipment or a deal that did not go through the platform. Save it
          as a draft as often as you like; nothing is numbered until you issue.
        </p>
      </div>

      {/* A serial spent on a document reading REPLACE ME where the GSTIN
          belongs leaves a hole no later fix can close, so the warning is loud
          and the issue action refuses regardless. */}
      {!configured ? (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium">Arena&rsquo;s own invoice details are missing.</p>
          <p className="mt-1 text-muted-foreground">
            Set the <code className="font-mono text-xs">INVOICE_ISSUER_*</code>{" "}
            environment variables before issuing anything. You can still build a
            draft.
          </p>
        </div>
      ) : null}

      {/* Warns rather than blocks: a mismatch here never changes what a
          customer pays, only which tax heads it is filed under, and it applies
          to the automatic booking invoices too. See issuerStateMatchesGstin. */}
      {configured && !issuerStateMatchesGstin(issuer) ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium">
            Arena&rsquo;s GST state code does not match its GSTIN.
          </p>
          <p className="mt-1 text-muted-foreground">
            <code className="font-mono text-xs">INVOICE_ISSUER_GSTIN</code> is{" "}
            {issuer.gstin}, which is{" "}
            {gstStateName(issuer.gstin.slice(0, 2)) ?? "another state"}, but{" "}
            <code className="font-mono text-xs">INVOICE_ISSUER_STATE_CODE</code>{" "}
            is {issuer.stateCode} ({gstStateName(issuer.stateCode) ?? "unknown"}
            ). Totals are unaffected, but every invoice, including the automatic
            booking ones, splits its tax under the wrong heads. Fix the
            environment variable before issuing.
          </p>
        </div>
      ) : null}

      {/* The form's own labels are in the fallback, so the shape of what is
          being asked for is on screen while the charge catalogue, the presets
          and the service history are read. */}
      <Suspense fallback={<ManualInvoiceBuilderSkeleton />}>
        <BuilderSection sellerStateCode={issuer.stateCode} />
      </Suspense>
    </div>
  );
}

async function BuilderSection({ sellerStateCode }: { sellerStateCode: string }) {
  const [catalog, presets, serviceHistory] = await Promise.all([
    listChargeTypes(),
    listChargePresets(),
    listServiceTypes(),
  ]);

  return (
    <ManualInvoiceBuilder
      initial={null}
      catalog={catalog}
      presets={presets}
      serviceHistory={serviceHistory}
      sellerStateCode={sellerStateCode}
    />
  );
}
