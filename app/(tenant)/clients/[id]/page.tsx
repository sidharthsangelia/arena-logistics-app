import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/utils/db";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientEditSheet from "@/components/clients/clientDetailPage/ClientEditSheet";
import ClientDetailStats from "@/components/clients/clientDetailPage/ClientDetailStats";
import ClientQuoteHistory from "@/components/clients/clientDetailPage/ClientQuoteHistory";
import KycVault from "@/components/clients/clientDetailPage/KycVault";
import { AddressBookManager } from "@/components/address/AddressBookManager";
import {
  HeaderSkeleton,
  StatsSkeleton,
  ContactSidebarSkeleton,
  QuoteHistorySkeleton,
  KycVaultSkeleton,
} from "./skeletons";

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

// ─── Data fetcher (single query, shared via promise) ────────────────────────
// One DB call — we pass the same promise to all sub-components
// so they all resolve from the same request, not N separate queries.

async function fetchClient(id: string) {
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
  return client;
}

// ─── Async sub-components ────────────────────────────────────────────────────
// Each awaits the same promise — React deduplicates the underlying fetch.

async function ClientHeader({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;
  const location = [client.city, client.country].filter(Boolean).join(", ");

  return (
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
  );
}

async function ClientActions({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  return (
    <div className="flex items-center gap-2">
      <ClientEditSheet client={client} />
      <Button size="sm" asChild>
        <Link href="/rates">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          New quote
        </Link>
      </Button>
    </div>
  );
}

async function ClientStats({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

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

  return (
    <ClientDetailStats
      totalQuotes={client.quotes.length}
      totalRevenue={totalRevenue}
      acceptanceRate={acceptanceRate}
      acceptedCount={acceptedQuotes.length}
      lastQuote={lastQuote}
    />
  );
}

async function ClientSidebar({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  return (
    <>
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

      {/* Notes — only rendered if present */}
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
    </>
  );
}

async function ClientQuotes({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  return (
    <ClientQuoteHistory
      quotes={client.quotes}
      client={{
        companyName: client.companyName,
        contactName: client.contactName,
        email: client.email,
      }}
    />
  );
}

async function ClientDocuments({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  return (
    <KycVault
      clientId={client.id}
      documents={client.documents.map((d) => ({
        id: d.id,
        docType: d.docType as any,
        label: d.label,
        description: d.description,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
      }))}
    />
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;

  // Kick off the query once — all sub-components share this promise.
  // React will deduplicate; no extra DB calls are made.
  const clientPromise = fetchClient(id);

  return (
    <>
      {/* Header row
          Left: avatar + name (dynamic) | Right: action buttons (dynamic, need client) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Suspense fallback={<HeaderSkeleton />}>
          <ClientHeader clientPromise={clientPromise} />
        </Suspense>

        {/* Actions also need the client (ClientEditSheet takes the full object) */}
        <Suspense
          fallback={
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded-md bg-muted animate-pulse" />
              <div className="h-8 w-28 rounded-md bg-muted animate-pulse" />
            </div>
          }
        >
          <ClientActions clientPromise={clientPromise} />
        </Suspense>
      </div>

      {/* Stats — all dynamic */}
      <Suspense fallback={<StatsSkeleton />}>
        <ClientStats clientPromise={clientPromise} />
      </Suspense>

      {/* Body grid — layout shell is instant, content suspends per-section */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Left sidebar — contact + address values are dynamic */}
        <div className="space-y-4">
          <Suspense fallback={<ContactSidebarSkeleton />}>
            <ClientSidebar clientPromise={clientPromise} />
          </Suspense>
        </div>

        {/* Right column — each section suspends independently */}
        <div className="space-y-5">
          <Suspense fallback={<QuoteHistorySkeleton />}>
            <ClientQuotes clientPromise={clientPromise} />
          </Suspense>

          {/* Address book for this client — pickup / delivery / billing they reuse */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Addresses
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                Save this client&apos;s pickup, delivery and billing addresses to
                book for them in one tap.
              </p>
            </div>
            <div className="p-4">
              <AddressBookManager party={{ partyType: "CLIENT", clientId: id }} />
            </div>
          </div>

          <Suspense fallback={<KycVaultSkeleton />}>
            <ClientDocuments clientPromise={clientPromise} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
