"use client";

/**
 * "Their account says something different."
 *
 * A party adopted from a signed-up org or a business associate's client is a
 * COPY of it, taken once. That is deliberate: a tax invoice states what was
 * true when it was issued, and a customer correcting their address next month
 * must not silently rewrite a document already in their hands.
 *
 * The cost of that choice is drift, and drift nobody can see is drift that ends
 * up on the next invoice. So the difference is shown and left for a person to
 * accept. Never applied on read, never applied automatically: a customer who
 * deliberately bills under an old registered address would otherwise have it
 * overwritten by a background job.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { BillingPartyLink } from "@/lib/invoices/manual/config";
import { refreshBillingPartyFromLinkAction } from "@/actions/invoices/manualInvoices.action";

export function BillingPartyDriftNotice({
  partyId,
  link,
}: {
  partyId: string;
  link: BillingPartyLink;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (!link.present || link.drift.length === 0) return null;

  const source =
    link.source === "ORG" ? "their account" : "their client record";

  async function apply() {
    setBusy(true);
    try {
      const result = await refreshBillingPartyFromLinkAction(partyId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.updated === 0
          ? "Nothing to copy; the details already match."
          : `Copied ${result.data.updated} ${result.data.updated === 1 ? "detail" : "details"} across.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <p className="text-sm font-medium">
        {link.name} has different details on {source}.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Invoices print what is on the left. Copying across changes what the next
        one says and nothing already issued.
      </p>

      <dl className="mt-3 space-y-1.5">
        {link.drift.map((field) => (
          <div
            key={field.field}
            className="flex flex-wrap items-baseline gap-x-3 text-xs"
          >
            <dt className="w-24 shrink-0 text-muted-foreground">
              {field.label}
            </dt>
            <dd className="break-words">
              <span className="text-muted-foreground line-through">
                {field.ours || "not set"}
              </span>
              <span className="mx-2 text-muted-foreground">&rarr;</span>
              <span className="font-medium">{field.theirs}</span>
            </dd>
          </div>
        ))}
      </dl>

      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={apply}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            Copying
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Use their current details
          </>
        )}
      </Button>
    </div>
  );
}
