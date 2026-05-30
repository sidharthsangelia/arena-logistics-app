import type { Client } from "@/generated/prisma";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import ClientRowActions from "@/components/clients/ClientRow";
import ClientsPagination from "@/components/clients/ClientsPagination";

type Props = {
  clients: Client[];
  page: number;
  total: number;
  pageSize: number;
  query: string;
};

export default function ClientsTable({
  clients,
  page,
  total,
  pageSize,
  query,
}: Props) {
  const totalPages = Math.ceil(
    total / pageSize,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.companyName}
                  </TableCell>

                  <TableCell>
                    {client.contactName ?? "—"}
                  </TableCell>

                  <TableCell>
                    {client.email ?? "—"}
                  </TableCell>

                  <TableCell>
                    {client.phone ?? "—"}
                  </TableCell>

                  <TableCell>
                    {[client.city, client.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>

                  <TableCell>
                    <ClientRowActions
                      client={client}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClientsPagination
        page={page}
        totalPages={totalPages}
        query={query}
      />
    </div>
  );
}