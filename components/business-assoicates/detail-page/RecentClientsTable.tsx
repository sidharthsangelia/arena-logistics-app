import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Client } from "@/generated/prisma";
import { formatDate } from "@/lib/utils";

type Props = {
  clients: Client[];
};

export default function RecentClientsTable({ clients }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Clients</CardTitle>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No clients recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wide">Company</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Contact</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.companyName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.contactName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(client.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}