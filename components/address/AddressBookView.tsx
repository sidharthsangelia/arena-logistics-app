"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { ClientSummary, Party } from "@/types/booking";
import { ClientCombobox } from "@/components/booking/ClientComboBox";
import { AddressBookManager } from "./AddressBookManager";

interface Props {
  orgId: string;
  isBusinessAssociate: boolean;
}

type Scope = "ORG" | "CLIENT";

export function AddressBookView({ orgId, isBusinessAssociate }: Props) {
  const [scope, setScope] = useState<Scope>("ORG");
  const [client, setClient] = useState<ClientSummary | null>(null);

  // Normal orgs only ever manage their own book.
  if (!isBusinessAssociate) {
    return <AddressBookManager party={{ partyType: "ORG", orgId }} />;
  }

  const party: Party | null =
    scope === "ORG"
      ? { partyType: "ORG", orgId }
      : client
        ? { partyType: "CLIENT", clientId: client.id }
        : null;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="space-y-2">
          <Label className="text-xs">Whose address book?</Label>
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
            className="inline-flex flex-wrap gap-1 rounded-lg border bg-background p-1"
          >
            {[
              { value: "ORG", label: "My organisation" },
              { value: "CLIENT", label: "A client" },
            ].map((s) => (
              <Label key={s.value} htmlFor={`scope-${s.value}`} className="cursor-pointer">
                <RadioGroupItem value={s.value} id={`scope-${s.value}`} className="peer sr-only" />
                <span className="block rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow-sm">
                  {s.label}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {scope === "CLIENT" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Select a client</Label>
            <div className="max-w-sm">
              <ClientCombobox value={client} onChange={setClient} />
            </div>
            <p className="text-xs text-muted-foreground">
              Save each client&apos;s pickup, delivery and billing addresses so
              booking for them is a one-tap job.
            </p>
          </div>
        )}
      </div>

      {party ? (
        <AddressBookManager key={scope + (client?.id ?? "")} party={party} />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Users className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">Pick a client to see their addresses</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Choose a client above to view and manage the addresses saved for them.
          </p>
        </div>
      )}
    </div>
  );
}
