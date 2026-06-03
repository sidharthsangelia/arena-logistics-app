import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/utils/db";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientEditSheet from "@/components/clients/clientDetailPage/ClientEditSheet";
import ClientDetailStats from "@/components/clients/clientDetailPage/ClientDetailStats";
import ClientQuoteHistory from "@/components/clients/clientDetailPage/ClientQuoteHistory";
import KycVault from "@/components/clients/clientDetailPage/KycVault";

type Props = {
  params: Promise<{ id: string }>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

// ─── InfoRow (static, but only used inside page content) ────────────────────

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {value ? (
        <span className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground/50">—</span>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      quotes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          vendorName: true,
          productName: true,
          currency: true,
          quotedTotal: true,
          pdfUrl: true,
          createdAt: true,
          validUntil: true,
        },
      },
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          docType: true,
          label: true,
          description: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!client) notFound();

  // ── Derived stats ──────────────────────────────────────────────────────────
  const acceptedQuotes = client.quotes.filter((q) => q.status === "ACCEPTED");
  const totalRevenue = acceptedQuotes.reduce(
    (sum, q) => sum + Number(q.quotedTotal),
    0,
  );
  const acceptanceRate =
    client.quotes.length > 0
      ? Math.round((acceptedQuotes.length / client.quotes.length) * 100)
      : 0;
  const lastQuote = client.quotes[0] ?? null;

  const location = [client.city, client.country].filter(Boolean).join(", ");

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-medium text-muted-foreground">
            {getInitials(client.companyName)}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {client.companyName}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Client since {formatDate(client.createdAt)}
              {location ? ` · ${location}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ClientEditSheet client={client} />
          <Button size="sm" asChild>
            <Link href="/rates">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              New quote
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <ClientDetailStats
        totalQuotes={client.quotes.length}
        totalRevenue={totalRevenue}
        acceptanceRate={acceptanceRate}
        acceptedCount={acceptedQuotes.length}
        lastQuote={lastQuote}
      />

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">

        {/* Left sidebar */}
        <div className="space-y-4">

          {/* Contact */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Contact
              </p>
            </div>
            <div className="divide-y px-4">
              <InfoRow label="Contact name" value={client.contactName} />
              <InfoRow label="Email" value={client.email} mono />
              <InfoRow label="Phone" value={client.phone} />
            </div>
          </div>

          {/* Address */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Address
              </p>
            </div>
            <div className="divide-y px-4">
              <InfoRow label="Address" value={client.addressLine1} />
              <InfoRow label="City" value={client.city} />
              <InfoRow label="State" value={client.state} />
              <InfoRow label="Country" value={client.country} />
              <InfoRow label="Postal code" value={client.postalCode} />
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="rounded-lg border">
              <div className="border-b px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Notes
                </p>
              </div>
              <p className="px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {client.notes}
              </p>
            </div>
          )}

        </div>

        {/* Right column */}
        <div className="space-y-5">
          <ClientQuoteHistory quotes={client.quotes} />

          <KycVault
            clientId={client.id}
            documents={client.documents.map((d) => ({
              id:          d.id,
              docType:     d.docType as any,
              label:       d.label,
              description: d.description,
              fileUrl:     d.fileUrl,
              fileName:    d.fileName,
              fileSize:    d.fileSize,
              mimeType:    d.mimeType,
              uploadedAt:  d.uploadedAt,
            }))}
          />
        </div>

      </div>
    </>
  );
}