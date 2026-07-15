import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import CreateClientDialog from "@/components/clients/toolbar/CreateClientDialog";
import ExportClientsButton from "./ExportClientButton";
import ImportClientsButton from "./ImportClientButton";

interface ClientsToolbarProps {
  client?: boolean;
}

export default function ClientsToolbar({
  client = false,
}: ClientsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          All Clients
        </h1>

        <p className="text-sm text-muted-foreground">
          {client
            ? "Manage your customer records and contact information."
            : "Manage customer records and contact information across all business associates."}
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <ImportClientsButton />
          <ExportClientsButton />
          <CreateClientDialog />
        </div>
      </Suspense>
    </div>
  );
}