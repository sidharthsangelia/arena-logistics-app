import { Skeleton } from "@/components/ui/skeleton";

// Every skeleton mirrors its real section 1:1 — same rules, same static text,
// only the data-dependent bits blocked out, so nothing reflows when the real
// content lands.

/** The section heading is static text, so it renders for real in the skeleton. */
function SectionHeading({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
      {right}
    </div>
  );
}

// ─── Header: company name + subtitle ────────────────────────────────────────
// The action buttons (Edit, New quote) are always rendered by the shell

export function HeaderSkeleton() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-56" />
    </div>
  );
}

// ─── Stats row: all 4 numbers are dynamic ───────────────────────────────────

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t pt-6 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ─── Field: the label is static in the real thing, so only the value blocks ──

function FieldSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className={`h-4 ${wide ? "w-40" : "w-28"}`} />
    </div>
  );
}

// ─── Sidebar: contact then address ──────────────────────────────────────────

export function ContactSidebarSkeleton() {
  return (
    <>
      <section className="space-y-4">
        <SectionHeading>Contact</SectionHeading>
        <div className="space-y-4">
          <FieldSkeleton />
          <FieldSkeleton wide />
          <FieldSkeleton />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Address</SectionHeading>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </section>
    </>
  );
}

// ─── Quote history: heading is static, rows are dynamic ─────────────────────

export function QuoteHistorySkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeading right={<Skeleton className="h-3 w-14" />}>
        Quote history
      </SectionHeading>
      <div className="divide-y divide-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── KYC vault: heading + upload button shell are static, rows dynamic ──────

export function KycVaultSkeleton() {
  return (
    <section className="space-y-5">
      <SectionHeading right={<Skeleton className="h-8 w-28 rounded-md" />}>
        KYC vault
      </SectionHeading>
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group}>
            <Skeleton className="h-4 w-28" />
            <div className="mt-2 divide-y divide-border/60">
              {Array.from({ length: group === 0 ? 2 : 1 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-4 w-4 shrink-0 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
