// components/accounts/detail/AccountContactCard.tsx
//
// What the account told us about itself during onboarding. Separate from the
// People card, which lists the humans Clerk knows can sign in: this one is the
// business, that one is the staff.

import { Mail, MapPin, Phone } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AccountDetail } from "@/queries/accounts";

export default function AccountContactCard({
  account,
}: {
  account: AccountDetail;
}) {
  // Only rows with something in them, so a half-filled profile reads as short
  // rather than as a column of blanks.
  const rows = [
    { icon: Mail, key: "email", value: account.email },
    { icon: Phone, key: "phone", value: account.phone },
  ].filter((row): row is typeof row & { value: string } => Boolean(row.value));

  const address = [
    account.addressLine1,
    account.city,
    account.state,
    account.postalCode,
    account.country,
  ]
    .filter(Boolean)
    .join(", ");

  const isEmpty = rows.length === 0 && !address && !account.companyName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contact details</CardTitle>
        <CardDescription>As provided during onboarding.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {account.companyName && account.companyName !== account.name && (
          <p className="font-medium">{account.companyName}</p>
        )}

        {account.contactName && (
          <p className="font-medium">{account.contactName}</p>
        )}

        {isEmpty && !account.contactName ? (
          <p className="text-muted-foreground">No contact details on file.</p>
        ) : (
          <>
            {rows.map(({ icon: Icon, key, value }) => (
              <div
                key={key}
                className="flex items-start gap-2 text-muted-foreground"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-all">{value}</span>
              </div>
            ))}

            {address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{address}</span>
              </div>
            )}
          </>
        )}

        {account.notes && (
          <>
            <Separator />
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-line text-muted-foreground">
                {account.notes}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
