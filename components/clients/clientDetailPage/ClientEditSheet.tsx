"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/generated/prisma";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { updateClientAction } from "@/actions/clients.action";
import type { ClientFormValues } from "@/lib/validations/clients.schema";

export default function ClientEditSheet({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

 const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setSaving(true);

  const fd = new FormData(e.currentTarget);

  // Helper: empty string or missing → undefined (matches .optional() schema)
  const str = (key: string): string | undefined =>
    (fd.get(key) as string | null) || undefined;

  const input: ClientFormValues = {
    companyName: fd.get("companyName") as string,
    contactName: str("contactName"),
    email: str("email"),
    phone: str("phone"),
    addressLine1: str("addressLine1"),
    city: str("city"),
    state: str("state"),
    country: str("country"),
    postalCode: str("postalCode"),
    notes: str("notes"),
  };

  const result = await updateClientAction(client.id, input);

  if (result.success) {
    toast.success("Client updated");
    setOpen(false);
    router.refresh();
  } else {
    toast.error(result.message);
  }

  setSaving(false);
};

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-base">Edit client</SheetTitle>
            <SheetDescription className="text-xs">
              Update details for {client.companyName}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <div className="flex-1 space-y-5 px-6 py-5">

              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Company
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-xs">
                    Company name *
                  </Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    defaultValue={client.companyName}
                    required
                    className="h-8 text-sm"
                  />
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Contact
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="contactName" className="text-xs">Contact name</Label>
                  <Input
                    id="contactName"
                    name="contactName"
                    defaultValue={client.contactName ?? ""}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={client.email ?? ""}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={client.phone ?? ""}
                    className="h-8 text-sm"
                  />
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Address
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="addressLine1" className="text-xs">Address line</Label>
                  <Input
                    id="addressLine1"
                    name="addressLine1"
                    defaultValue={client.addressLine1 ?? ""}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-xs">City</Label>
                    <Input
                      id="city"
                      name="city"
                      defaultValue={client.city ?? ""}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-xs">State</Label>
                    <Input
                      id="state"
                      name="state"
                      defaultValue={client.state ?? ""}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="text-xs">Country</Label>
                    <Input
                      id="country"
                      name="country"
                      defaultValue={client.country ?? ""}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-xs">Postal code</Label>
                    <Input
                      id="postalCode"
                      name="postalCode"
                      defaultValue={client.postalCode ?? ""}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Notes
                </p>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={client.notes ?? ""}
                  rows={3}
                  className="resize-none text-sm"
                  placeholder="Payment terms, preferences…"
                />
              </section>
            </div>

            <div className="border-t px-6 py-4">
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}