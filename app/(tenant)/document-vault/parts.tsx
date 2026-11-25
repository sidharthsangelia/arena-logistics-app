import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The vault page's fixed frame, shared by page.tsx and loading.tsx so the route
 * fallback and the streamed page are the same markup: the heading and the "My
 * documents" card render for real in both, and only what reads the org waits.
 */

export function VaultPageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">{children}</div>;
}

export function VaultHeading({ subtitle }: { subtitle: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Document Vault</h1>
      {subtitle}
    </div>
  );
}

/** The subtitle reads differently for Business Associates, so it waits on the org. */
export function VaultSubtitleSkeleton() {
  return (
    <div className="mt-1 flex h-5 items-center">
      <Skeleton className="h-3.5 w-80 max-w-full" />
    </div>
  );
}

export function MyDocumentsCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My documents</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
