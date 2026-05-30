import ClientsSearch from "@/components/clients/ClientsSearch";
import CreateClientDialog from "@/components/clients/CreateClientDialog";
import ExportClientsButton from "./ExportClientButton";
import ImportClientsButton from "./ImportClientButton";

export default function ClientsToolbar() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Clients
        </h1>

        <p className="text-sm text-muted-foreground">
          Manage customer records and contact information.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <ClientsSearch />

  <ImportClientsButton />

  <ExportClientsButton />
        <CreateClientDialog />
      </div>
    </div>
  );
}