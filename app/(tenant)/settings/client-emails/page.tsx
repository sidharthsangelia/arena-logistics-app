import { Suspense } from "react";
import { Mail, MailQuestion, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  // Params only, no data fetch, so the header below is never held up by them.
  const sp = await searchParams;
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

      {/* Everything below needs the org + a DB read, so it is the part that
          suspends.    The header above is static and renders on the firs */}
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsPanel page={page} query={query} exceptionsOnly={exceptionsOnly} />
      </Suspense>
    </div>
  );
}

async function SettingsPanel({
  page,
  query,
  exceptionsOnly,
}: {
  page: number;
  query: string;
  exceptionsOnly: boolean;
}) {
  const org = await requireBusinessAssociateOrg();
  const settings = await getClientEmailSettings(org.id);

  // requireBusinessAssociateOrg just resolved this org, so a miss here means it was
  // deleted between the two reads. Rare enough to handle plainly rather than with a
  // dedicated error state.
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        We could not load your settings. Please refresh the page.
      </p>
    );
  }

  return (
    <>
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
    </>
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

/**
 * These skeletons deliberately render the real card chrome, headings and
 * explanatory copy, and grey out only the parts that genuinely depend on the
 * query: the master switch's position, which milestones are ticked, the reply-to
 * address, and the roster rows.
 *
 * All that prose is static — it is the same on every load for every account, and
 * it is the part of this screen that does the explaining. Hiding it behind grey
 * boxes for the length of a query means the page arrives saying nothing, then
 * rearranges itself. Showing it immediately means the user starts reading while
 * the two or three actual values land underneath.
 */
function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Master toggle — the sentence that states who currently gets emailed is
          the one thing here that really is data, so it is the only skeleton. */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-base">Emails to your clients</CardTitle>
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </CardHeader>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Which updates they get</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pick the moments worth an email. Anything you leave unticked comes to
            you instead, so you always know where a shipment is.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-3 pt-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-44" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Where replies go</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            When a client replies to one of these emails, this is the inbox it
            lands in. They never see an Arena address.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <Skeleton className="h-9 w-full max-w-md" />
        </CardContent>
      </Card>

      <RosterSkeleton />
    </div>
  );
}

function RosterSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Exceptions by client</CardTitle>
        </div>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Most clients should follow your setting above. Use this when one of them
          needs the opposite: a client who wants updates directly, or one who
          would rather hear only from you.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: Math.min(4, ROSTER_PAGE_SIZE) }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
