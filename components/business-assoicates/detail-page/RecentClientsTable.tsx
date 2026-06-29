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
import { Badge } from "@/components/ui/badge";
import type { Client } from "@/generated/prisma";
import { formatDate } from "@/lib/utils";

const COMPANY_KIND_LABEL: Record<string, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
};

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
      <CardContent className="p-0">
        {clients.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No clients yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Company</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="pr-6">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="pl-6 font-medium">
                    {client.companyName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {COMPANY_KIND_LABEL[client.companyKind] ??
                        client.companyKind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.contactName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email ?? "—"}
                  </TableCell>
                  <TableCell className="pr-6 text-muted-foreground">
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