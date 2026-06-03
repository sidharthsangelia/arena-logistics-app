// app/(auth)/layout.tsx

import ClientsToolbar from "@/components/clients/ClientsToolbar";


export default function DocumentVaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
       <ClientsToolbar />
      {children}
    </div>
  );
}
