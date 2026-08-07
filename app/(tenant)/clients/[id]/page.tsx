import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/utils/db";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientEditSheet from "@/components/clients/clientDetailPage/ClientEditSheet";
import ClientDetailStats from "@/components/clients/clientDetailPage/ClientDetailStats";
import ClientQuoteHistory from "@/components/clients/clientDetailPage/ClientQuoteHistory";
import ClientRecentShipments from "@/components/clients/clientDetailPage/ClientRecentShipments";
import KycVault from "@/components/clients/clientDetailPage/KycVault";
import type { KycDocType } from "@/lib/validations/clientsDocument.schema";
import { AddressBookManager } from "@/components/address/AddressBookManager";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientEmailPreferenceCard } from "@/components/clients/clientDetailPage/ClientEmailPreferenceCard";
import { ClientExportProfileCard } from "@/components/clients/clientDetailPage/ClientExportProfileCard";
import {
  hasAnyExportDetail,
  toExportProfileForm,
} from "@/lib/booking/exportProfile";
import { getCurrentOrg } from "@/utils/tenant";
import {
  HeaderSkeleton,
  StatsSkeleton,
  ContactSidebarSkeleton,
  RecentShipmentsSkeleton,
  QuoteHistorySkeleton,
  KycVaultSkeleton,
} from "./skeletons";

type Props = {
  params: Promise<{ id: string }>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * A labelled value. Quiet label, then the value a step up in weight — the same
 * pairing used across the detail pages, and the reason none of these blocks
 * need a border to read as a group.
 */
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {value ? (
        <p
          className={`mt-1 wrap-break-word text-sm font-medium text-foreground ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground/60">Not set</p>
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
      shipments: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          shipmentNumber: true,
          status: true,
          quotedTotal: true,
          currency: true,
          createdAt: true,
          pickupAddress: { select: { city: true } },
          deliveryAddress: { select: { city: true } },
        },
      },
      _count: {
        select: { shipments: true },
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
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {client.companyName}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Client since {formatDate(client.createdAt)}
        {location ? ` · ${location}` : ""}
      </p>
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
  const acceptanceRate =
    client.quotes.length > 0
      ? Math.round((acceptedQuotes.length / client.quotes.length) * 100)
      : 0;

  // Whichever happened more recently — a quote or an actual booked shipment —
  // is the one worth surfacing as "last activity" for this client.
  const lastQuote = client.quotes[0] ?? null;
  const lastShipment = client.shipments[0] ?? null;
  const lastActivity =
    lastShipment && (!lastQuote || lastShipment.createdAt > lastQuote.createdAt)
      ? {
          type: "shipment" as const,
          label: lastShipment.shipmentNumber,
          date: lastShipment.createdAt,
        }
      : lastQuote
        ? {
            type: "quote" as const,
            label: lastQuote.quoteNumber,
            date: lastQuote.createdAt,
          }
        : null;

  return (
    <ClientDetailStats
      totalShipments={client._count.shipments}
      totalQuotes={client.quotes.length}
      acceptanceRate={acceptanceRate}
      acceptedCount={acceptedQuotes.length}
      lastActivity={lastActivity}
    />
  );
}

async function ClientSidebar({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  // The account-wide setting, so the section can say what "Default" actually
  // means rather than making the reader go and look. getCurrentOrg is memoised
  // per request and the tenant layout has already populated it, so this is free.
  const org = await getCurrentOrg();

  // The postal address reads as an address, not as five labelled rows — that is
  // how it will be written on a label, and how anyone checking it will read it.
  const addressLines = [
    client.addressLine1,
    [client.city, client.state, client.postalCode].filter(Boolean).join(", "),
    client.country,
  ].filter((line) => Boolean(line?.trim()));

  return (
    <>
      {/* Contact */}
      <section className="space-y-4">
        <SectionHeading>Contact</SectionHeading>
        <div className="space-y-4">
          <Field label="Contact name" value={client.contactName} />
          <Field label="Email" value={client.email} mono />
          <Field label="Phone" value={client.phone} />
        </div>
      </section>

      {/* Who hears about this client's shipments. Rendered right under the email
          address it would be sent to, which is the context the decision needs. */}
      <ClientEmailPreferenceCard
        clientId={client.id}
        clientName={client.companyName}
        clientEmail={client.email}
        preference={client.emailPreference}
        orgEnabled={org?.clientEmailsEnabled ?? false}
      />

      {/* Address */}
      <section className="space-y-4">
        <SectionHeading>Address</SectionHeading>
        {addressLines.length > 0 ? (
          <div className="space-y-0.5 text-sm leading-relaxed text-muted-foreground">
            {addressLines.slice(0, -1).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <p className="font-medium text-foreground">
              {addressLines[addressLines.length - 1]}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60">
            No address on file.
          </p>
        )}
      </section>

      {/* What this client's exports are filed under. Sits below the address
          because both describe the legal entity rather than how to reach them,
          and above notes because it is a setting rather than a remark. */}
      <ClientExportProfileCard
        clientId={client.id}
        clientName={client.companyName}
        profile={toExportProfileForm(client)}
        hasDetail={hasAnyExportDetail(client)}
      />

      {/* Notes — only rendered if present */}
      {client.notes && (
        <section className="space-y-4">
          <SectionHeading>Notes</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {client.notes}
          </p>
        </section>
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

async function ClientShipments({
  clientPromise,
}: {
  clientPromise: ReturnType<typeof fetchClient>;
}) {
  const client = await clientPromise;

  return (
    <ClientRecentShipments
      shipments={client.shipments}
      totalCount={client._count.shipments}
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
        docType: d.docType as KycDocType,
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
    <div className="space-y-12">
      {/* Header row
          Left: company name (dynamic) | Right: action buttons (dynamic, need client) */}
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <Suspense fallback={<HeaderSkeleton />}>
            <ClientHeader clientPromise={clientPromise} />
          </Suspense>

          {/* Actions also need the client (ClientEditSheet takes the full object) */}
          <Suspense
            fallback={
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-28" />
              </div>
            }
          >
            <ClientActions clientPromise={clientPromise} />
          </Suspense>
        </div>

        {/* Key figures, sitting under the name they describe */}
        <Suspense fallback={<StatsSkeleton />}>
          <ClientStats clientPromise={clientPromise} />
        </Suspense>
      </div>

      {/* Body grid — layout shell is instant, content suspends per-section.
          The sidebar is split off by a single hairline rather than by cards. */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <div className="space-y-10 lg:border-r lg:pr-10">
          <Suspense fallback={<ContactSidebarSkeleton />}>
            <ClientSidebar clientPromise={clientPromise} />
          </Suspense>
        </div>

        {/* Right column — each section suspends independently */}
        <div className="min-w-0 space-y-12">
          <Suspense fallback={<RecentShipmentsSkeleton />}>
            <ClientShipments clientPromise={clientPromise} />
          </Suspense>

          <Suspense fallback={<QuoteHistorySkeleton />}>
            <ClientQuotes clientPromise={clientPromise} />
          </Suspense>

          {/* Address book for this client — pickup / delivery / billing they reuse */}
          <section className="space-y-5">
            <SectionHeading hint="Save this client's pickup, delivery and billing addresses to book for them in one tap.">
              Saved addresses
            </SectionHeading>
            <AddressBookManager party={{ partyType: "CLIENT", clientId: id }} />
          </section>

          <Suspense fallback={<KycVaultSkeleton />}>
            <ClientDocuments clientPromise={clientPromise} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
