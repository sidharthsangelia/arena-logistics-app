import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ClientDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Back — always visible, needs no data */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All clients
      </Link>

      {/* Page content — page.tsx or loading.tsx drops in here */}
      {children}
    </div>
  );
}