import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Mail, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { isArenaAudience, SUPPORT_EMAIL, type HelpAudience, type HelpArticle } from "@/lib/help/types";
import {
  formatHelpVersion,
  getArticle,
  getCategoriesFor,
  getReleasesFor,
  getRelatedFor,
  isRecentlyUpdated,
} from "@/lib/help/registry";
import type { HelpRouteScope } from "@/lib/help/routes";
import { helpBase, linkContextFor } from "@/lib/help/links";
import { HELP_CATEGORIES } from "@/lib/help/types";

import { HelpBlocks } from "./HelpBlocks";
import { HelpSearch } from "./HelpSearch";
import { MarkHelpSeen } from "./HelpUnread";
import { SetupChecklist, SetupChecklistSkeleton } from "./SetupChecklist";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function HelpPageHeading() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Help &amp; Docs</h1>
      <p className="text-sm text-muted-foreground">
        Guides for everything you can do in Arena. Press{" "}
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[11px]">Ctrl K</kbd> anywhere to search.
      </p>
    </header>
  );
}

function SupportFooter() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">Still need help?</p>
          <p className="text-sm text-muted-foreground">
            Email us with your shipment number (it starts with ARN) and we will look straight at it.
          </p>
        </div>
      </div>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="shrink-0 text-sm font-medium text-primary underline underline-offset-4 hover:no-underline"
      >
        {SUPPORT_EMAIL}
      </a>
    </div>
  );
}

function UpdatedChip({ version }: { version: HelpArticle["updated"] }) {
  if (!isRecentlyUpdated(version)) return null;
  return (
    <Badge variant="secondary" className="text-[10px]">
      Updated
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HelpHome({
  audience,
  scope,
  initialQuery,
}: {
  audience: HelpAudience;
  scope: HelpRouteScope;
  initialQuery: string;
}) {
  const base = helpBase(scope);
  const categories = getCategoriesFor(audience);
  const latest = getReleasesFor(audience)[0];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <HelpPageHeading />

      <HelpSearch base={base} initialQuery={initialQuery}>
        <div className="space-y-10">
          {!isArenaAudience(audience) && (
            <Suspense fallback={<SetupChecklistSkeleton />}>
              <SetupChecklist />
            </Suspense>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {categories.map((c) => (
              <Card key={c.id} className="gap-3">
                <CardHeader className="gap-1">
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <CardDescription>{c.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {c.articles.map((a) => (
                      <li key={a.slug}>
                        <Link
                          href={`${base}/help/${a.slug}`}
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <span className="min-w-0 flex-1 truncate">{a.title}</span>
                          <UpdatedChip version={a.updated} />
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {latest && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-muted-foreground" />
                  What&apos;s new
                  <span className="font-normal text-muted-foreground">· {formatHelpVersion(latest.version)}</span>
                </h2>
                <Link href={`${base}/help/whats-new`} className="text-sm text-primary underline-offset-4 hover:underline">
                  All updates
                </Link>
              </div>
              <ul className="space-y-2">
                {latest.entries.slice(0, 3).map((e, i) => (
                  <li key={i} className="rounded-lg border bg-background p-4">
                    <p className="text-sm font-medium text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{e.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </HelpSearch>

      <SupportFooter />
    </div>
  );
}

/** Route-level fallback: the static heading is real, only the rest stands in. */
export function HelpHomeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <HelpPageHeading />
      <Skeleton className="h-11 w-full rounded-md" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="gap-3">
            <CardHeader className="gap-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-3/4" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

const CATEGORY_TITLE = new Map<string, string>(HELP_CATEGORIES.map((c) => [c.id, c.title]));

function BackToHelp({ base }: { base: string }) {
  return (
    <Link
      href={`${base}/help`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Help &amp; Docs
    </Link>
  );
}

export function HelpArticleView({
  article,
  audience,
  scope,
}: {
  article: HelpArticle;
  audience: HelpAudience;
  scope: HelpRouteScope;
}) {
  const base = helpBase(scope);
  const related = getRelatedFor(article, audience);
  const ctx = linkContextFor(article, audience, scope);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <BackToHelp base={base} />

      <article className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {CATEGORY_TITLE.get(article.category)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{article.title}</h1>
          <p className="text-base text-muted-foreground">{article.summary}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Last updated {formatHelpVersion(article.updated)}</span>
            <UpdatedChip version={article.updated} />
          </div>
        </header>

        {!ctx.appLinks && (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            This is the customer guide, shown as customers read it. Links to customer screens are shown as plain text.
          </p>
        )}

        <Separator />

        <HelpBlocks blocks={article.blocks} audience={audience} ctx={ctx} />
      </article>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Related guides</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`${base}/help/${r.slug}`}
                  className="block h-full rounded-lg border bg-background p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SupportFooter />
    </div>
  );
}

export function HelpArticleSkeleton({ scope }: { scope: HelpRouteScope }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <BackToHelp base={helpBase(scope)} />
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Separator />
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What's new
// ---------------------------------------------------------------------------

const KIND_LABEL = { new: "New", improved: "Improved", fixed: "Fixed" } as const;

export function WhatsNewView({
  audience,
  scope,
}: {
  audience: HelpAudience;
  scope: HelpRouteScope;
}) {
  const base = helpBase(scope);
  const releases = getReleasesFor(audience);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <BackToHelp base={base} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">What&apos;s new</h1>
        <p className="text-sm text-muted-foreground">Every change that affects how you use Arena, newest first.</p>
      </header>

      {releases[0] && <MarkHelpSeen version={releases[0].version} />}

      {releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="space-y-10">
          {releases.map((r) => (
            <li key={r.version} className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                {formatHelpVersion(r.version)}
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">v{r.version}</span>
              </h2>
              <ul className="space-y-2">
                {r.entries.map((e, i) => (
                  <li key={i} className="space-y-1.5 rounded-lg border bg-background p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={e.kind === "fixed" ? "outline" : "secondary"} className="text-[10px]">
                        {KIND_LABEL[e.kind]}
                      </Badge>
                      <p className="text-sm font-medium text-foreground">{e.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{e.body}</p>
                    {(() => {
                      const guides = (e.articles ?? [])
                        .map((slug) => getArticle(slug, audience))
                        .filter((a): a is HelpArticle => a !== null);
                      if (guides.length === 0) return null;
                      return (
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                          {guides.map((g) => (
                            <Link
                              key={g.slug}
                              href={`${base}/help/${g.slug}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {g.title}
                            </Link>
                          ))}
                        </p>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function WhatsNewSkeleton({ scope }: { scope: HelpRouteScope }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <BackToHelp base={helpBase(scope)} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">What&apos;s new</h1>
        <p className="text-sm text-muted-foreground">Every change that affects how you use Arena, newest first.</p>
      </header>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-background p-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
