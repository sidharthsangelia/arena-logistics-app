import { Suspense } from "react";
import { MailQuestion } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireBusinessAssociateOrg } from "@/utils/tenant";
import {
  getClientEmailRoster,
  getClientEmailSettings,
  ROSTER_PAGE_SIZE,
} from "@/lib/email/queries";
import { ClientEmailRoster } from "@/components/settings/ClientEmailRoster";
import { ClientEmailSettingsForm } from "@/components/settings/ClientEmailSettingsForm";

/**
 * CLIENT EMAILS (business associates only)
 * -----------------------------------------------------------------------------
 * A business associate stands between us and their client. Shipment milestone
 * emails reached those clients from the beginning, which put us in the middle of a
 * relationship that is not ours, so it is now the associate's call.
 *
 * requireBusinessAssociateOrg redirects standard orgs away. They ship for
 * themselves, so there is no third party here and the setting would be noise.
 * The mutations re-check for themselves; the route guard is not load bearing.
 *
 * Note there is no arena-side override. If ops needs a client emailed, the answer
 * is to ask the associate rather than to reach past them, which is the entire
 * point of the setting existing.
 */

export const metadata = {
  title: "Client emails",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function readString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function ClientEmailsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const org = await requireBusinessAssociateOrg();
  const sp = await searchParams;

  const settings = await getClientEmailSettings(org.id);

  // requireBusinessAssociateOrg just resolved this org, so a miss here means it was
  // deleted between the two reads. Rare enough to handle plainly rather than with a
  // dedicated error state.
  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-muted-foreground">
          We could not load your settings. Please refresh the page.
        </p>
      </div>
    );
  }

  const rawPage = Number(readString(sp.page));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const query = readString(sp.q);
  const exceptionsOnly = readString(sp.exceptions) === "1";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <header>
        <div className="flex items-center gap-2">
          <MailQuestion className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Client emails</h1>
        </div>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          We can keep your clients posted on their shipments for you, under your own
          name. Or we can keep it between us and let you pass on what matters. Either
          way you see every update.
        </p>
      </header>

      <ClientEmailSettingsForm settings={settings} />

      {/* Suspended separately so the roster query never holds up the settings
          themselves, which are the reason someone opened this page. */}
      <Suspense fallback={<RosterSkeleton />}>
        <RosterPanel
          orgId={org.id}
          orgEnabled={settings.enabled}
          page={page}
          query={query}
          exceptionsOnly={exceptionsOnly}
        />
      </Suspense>
    </div>
  );
}

async function RosterPanel({
  orgId,
  orgEnabled,
  page,
  query,
  exceptionsOnly,
}: {
  orgId: string;
  orgEnabled: boolean;
  page: number;
  query: string;
  exceptionsOnly: boolean;
}) {
  const roster = await getClientEmailRoster({
    orgId,
    page,
    query: query || undefined,
    exceptionsOnly,
  });

  // A page number past the end (a bookmarked link, or a client deleted since)
  // would otherwise render an empty list that looks like "you have no clients".
  const safePage = Math.min(page, roster.pageCount);

  return (
    <ClientEmailRoster
      rows={roster.rows}
      totalRows={roster.totalRows}
      pageCount={roster.pageCount}
      exceptionCount={roster.exceptionCount}
      page={safePage}
      query={query}
      exceptionsOnly={exceptionsOnly}
      orgEnabled={orgEnabled}
    />
  );
}

function RosterSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border p-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="space-y-2 pt-3">
        {Array.from({ length: Math.min(4, ROSTER_PAGE_SIZE) }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
