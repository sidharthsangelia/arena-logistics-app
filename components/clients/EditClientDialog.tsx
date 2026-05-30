"use client";

import { useState } from "react";

import type { Client } from "@/generated/prisma";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import ClientForm from "@/components/clients/ClientForm";

import { updateClientAction } from "@/actions/clients.action";
import { ClientFormValues } from "@/lib/validations/clients.schema";
import { toast } from "sonner";

type Props = {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function EditClientDialog({
  client,
  open,
  onOpenChange,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(values: ClientFormValues) {
    setLoading(true);

    try {
    const result = await updateClientAction(
  client.id,
  values,
);

if (!result.success) {
  toast.error(result.message);
  return;
}

toast.success("Client updated");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>

        <ClientForm
          client={client}
          submitLabel={
            loading ? "Saving..." : "Save Changes"
          }
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}