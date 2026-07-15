"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import ClientForm from "@/components/clients/toolbar/ClientForm";

import { createClientAction } from "@/actions/clients.action";
import { ClientFormValues } from "@/lib/validations/clients.schema";
import { toast } from "sonner";

export default function CreateClientDialog() {
  const [open, setOpen] = useState(false);

  async function handleSubmit(values: ClientFormValues) {
    const result = await createClientAction(values);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success("Client created");

    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Client</DialogTitle>
        </DialogHeader>

        <ClientForm submitLabel="Create Client" onSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  );
}
