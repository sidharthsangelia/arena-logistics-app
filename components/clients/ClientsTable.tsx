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
import Link from "next/link";

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
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">
                Company
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Contact
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Email
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Phone
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Location
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No clients found.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/clients/${client.id}`}
                      className="h-4 w-4 text-muted-foreground hover:underline"
                    >
                      {client.companyName}
                    </Link>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {client.contactName ?? "—"}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {client.email ?? "—"}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {client.phone ?? "—"}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {[client.city, client.country].filter(Boolean).join(", ") ||
                      "—"}
                  </TableCell>

                  <TableCell data-stop-propagation>
                    <ClientRowActions client={client} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClientsPagination page={page} totalPages={totalPages} query={query} />
    </div>
  );
}
