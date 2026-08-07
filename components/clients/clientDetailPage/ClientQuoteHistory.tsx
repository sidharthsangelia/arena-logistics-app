import Link from "next/link";
import type { QuoteStatus } from "@/generated/prisma";
import QuoteActionsMenu from "@/components/quotes/QuoteActionsMenu";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { displayServiceName } from "@/lib/branding/serviceName";

type QuoteRow = {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  vendorName: string;
  productName: string;
  currency: string;
  quotedTotal: unknown;
  pdfUrl: string | null;
  createdAt: Date;
  validUntil: Date;
};

type ClientInfo = {
  companyName: string;
  contactName: string | null;
  email: string | null;
};

// Status keeps its colour, but as a dot rather than a filled pill: five pills
// stacked down a table read as decoration, five dots read as a column.
const STATUS_DOT: Record<QuoteStatus, string> = {
  DRAFT: "bg-muted-foreground/40",
  SENT: "bg-blue-500",
  ACCEPTED: "bg-emerald-500",
  EXPIRED: "bg-amber-500",
  CANCELLED: "bg-red-500",
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(d);
}

export default function ClientQuoteHistory({
  quotes,
  client,
  showVendor = false,
}: {
  quotes: QuoteRow[];
  client: ClientInfo;
  /** Arena staff only. Tenants and BAs never see the sourcing vendor. */
  showVendor?: boolean;
}) {
  return (
    <section className="space-y-5">
      <SectionHeading
        right={`${quotes.length} quote${quotes.length !== 1 ? "s" : ""}`}
      >
        Quote history
      </SectionHeading>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No quotes for this client yet.
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-lg text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Quote
                </th>
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Status
                </th>
                {showVendor && (
                  <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                    Vendor
                  </th>
                )}
                <th className="px-2 pb-2 text-xs font-normal text-muted-foreground">
                  Product
                </th>
                <th className="px-2 pb-2 text-right text-xs font-normal text-muted-foreground">
                  Total
                </th>
                <th className="px-2 pb-2 text-right text-xs font-normal text-muted-foreground">
                  Date
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="px-2 py-3">
                    {q.pdfUrl ? (
                      <Link
                        href={q.pdfUrl}
                        target="_blank"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {q.quoteNumber}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        {q.quoteNumber}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-2 whitespace-nowrap text-foreground">
                      <span
                        className={`h-1.75 w-1.75 shrink-0 rounded-full ${STATUS_DOT[q.status]}`}
                      />
                      {STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  {showVendor && (
                    <td className="px-2 py-3 text-muted-foreground">
                      {q.vendorName}
                    </td>
                  )}
                  <td className="max-w-32 truncate px-2 py-3 text-muted-foreground">
                    {displayServiceName(q.productName, showVendor)}
                  </td>
                  <td className="px-2 py-3 text-right font-medium tabular-nums text-foreground">
                    {fmt(Number(q.quotedTotal), q.currency)}
                  </td>
                  <td className="px-2 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {fmtDate(q.createdAt)}
                  </td>
                  <td className="py-3 pl-1">
                    <QuoteActionsMenu
                      quote={{
                        id: q.id,
                        quoteNumber: q.quoteNumber,
                        productName: q.productName,
                        vendorName: q.vendorName,
                        quotedTotal: Number(q.quotedTotal),
                        currency: q.currency,
                        status: q.status,
                        validUntil: q.validUntil,
                        pdfUrl: q.pdfUrl,
                      }}
                      client={client}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
