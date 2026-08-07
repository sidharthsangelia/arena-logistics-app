import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ClientDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A white canvas rather than the dashboard's slate: the page carries no cards,
  // so its sections need a plain sheet to sit on.
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10">
        {/* Back — always visible, needs no data */}
        <Link
          href="/clients"
          className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          All clients
        </Link>

        {/* Page content — page.tsx or loading.tsx drops in here */}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
