// components/business-assoicates/RecentClientsTable.tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function RecentClientsTable({
  clients,
}: {
  clients: Client[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent clients</CardTitle>
        <CardDescription>
          The 5 most recently added clients for this organisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No clients yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.companyName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.contactName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email ?? "—"}
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