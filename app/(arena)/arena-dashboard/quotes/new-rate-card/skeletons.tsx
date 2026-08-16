// app/(arena)/arena-dashboard/quotes/new-rate-card/skeletons.tsx
//
// Fallback for the rate-card builder.
//
// The builder is a form, and the questions it asks do not depend on the
// database: "who is this file for", "what shape", "which destinations". Only the
// answers do — the carrier chips come from what the sweep actually stored, the
// client list from the platform, the freshness stamp from the run. So the
// headings are real text here and land unchanged, and the controls under them
// are placeholders sized to the controls they stand in for.
//
// The two-column grid and the sticky summary rail are reproduced exactly,
// because those set the page's geometry: getting them right is what stops the
// left column from resizing when the real form mounts beside it.

import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export function QuotationBuilderSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        <Section
          title="Who is this file for"
          description="This decides whether the workbook shows your selling price or your buying price."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCardSkeleton />
            <ChoiceCardSkeleton />
          </div>
        </Section>

        <Section
          title="Shape of the workbook"
          description="Both include a cover and the full terms."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCardSkeleton />
            <ChoiceCardSkeleton />
          </div>
        </Section>

        <Section
          title="Destinations"
          description="Only countries the sweep covers can be included."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-56 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-5.5 w-20 rounded-md" />
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="Weight slabs"
          description="Rows in every rate grid. Only slabs the sweep priced are offered, because anything else would be an invented number."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-28 rounded-md" />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-12 rounded-md" />
              ))}
            </div>
          </div>
        </Section>

        {/* Carriers only appears under the per-carrier layout, which is the
            default, and its chips are the one control here whose very existence
            is data: a carrier with no stored rates is not offered. */}
        <Section
          title="Carriers"
          description="One sheet each. Leave all unticked for every carrier with rates."
        >
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-md" />
            ))}
          </div>
        </Section>

        <Section title="Pricing and presentation">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
            <div className="sm:col-span-2">
              <FieldSkeleton />
            </div>
            <div className="sm:col-span-2">
              <FieldSkeleton />
            </div>
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 w-36" />
          </div>

          <dl className="mt-4 space-y-2.5 text-sm">
            {["Layout", "Destinations", "Weight slabs", "Carriers", "Markup"].map(
              (label) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>
                    <Skeleton className="h-4 w-24" />
                  </dd>
                </div>
              ),
            )}
          </dl>

          <Separator className="my-4" />

          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors the builder's own Section wrapper so the vertical rhythm matches. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChoiceCardSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-2 h-3.5 w-full" />
      <Skeleton className="mt-1.5 h-3.5 w-3/4" />
    </div>
  );
}

function FieldSkeleton() {
  return (
    <div>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-1.5 h-9 w-full rounded-md" />
      <Skeleton className="mt-1.5 h-3 w-2/3" />
    </div>
  );
}
