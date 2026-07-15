import Link from "next/link";

import type { Client, Org } from "@/generated/prisma";

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
import { formatDate } from "@/lib/utils";

type ClientWithOrg = Client & {
  org: Pick<Org, "id" | "name" | "slug">;
};

type Props = {
  clients: ClientWithOrg[];
  page: number;
  total: number;
  pageSize: number;
  query: string;
};

export default function ClientsTableInternal({
  clients,
  page,
  total,
  pageSize,
  query,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wide">
                Client
              </TableHead>

              <TableHead className="text-xs uppercase tracking-wide">
                Business Associate
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
{/* 
              <TableHead className="text-xs uppercase tracking-wide">
                Created
              </TableHead> */}

              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
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
                      href={`/arena-dashboard/clients/${client.id}`}
                      className="hover:underline"
                    >
                      {client.companyName}
                    </Link>
                  </TableCell>

                  <TableCell className="max-w-50 truncate">
                    <Link
                      href={`/arena-dashboard/business-associates/${client.org.id}`}
                      className="text-muted-foreground truncate hover:underline  "
                    >
                      {client.org.name}
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
                    {[client.city, client.country]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>

                  {/* <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(client.createdAt)}
                  </TableCell> */}

                  <TableCell data-stop-propagation>
                    <ClientRowActions client={client} />
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