// app/(auth)/layout.tsx

import VaultToolbar from "@/components/documentVault/VaultToolbar";
import QuotesToolbar from "@/components/quotes/QuotesToolbar";

export default function QuotesPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <QuotesToolbar />

      {children}
    </div>
  );
}
 