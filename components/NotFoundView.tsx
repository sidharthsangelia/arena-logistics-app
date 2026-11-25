import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A missing record inside the app (a shipment, client or invoice id that does
 * not exist or is not yours). Renders inside the dashboard shell, so the sidebar
 * stays and the way back is one click.
 */
export function NotFoundView({ homeHref }: { homeHref: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">We could not find that</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          It may have been removed, or the link is wrong.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href={homeHref}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
