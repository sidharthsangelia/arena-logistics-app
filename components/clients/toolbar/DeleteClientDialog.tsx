"use client";

import type { Client } from "@/generated/prisma";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteClientAction } from "@/actions/clients.action";
import { toast } from "sonner";

type Props = {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function DeleteClientDialog({
  client,
  open,
  onOpenChange,
}: Props) {
  async function handleDelete() {
   const result = await deleteClientAction(
  client.id,
);

if (!result.success) {
  toast.error(result.message);
  return;
}

toast.success("Client deleted");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete Client
          </AlertDialogTitle>

          <AlertDialogDescription>
            This client will be soft deleted and removed
            from active searches.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>
            Cancel
          </AlertDialogCancel>

          <AlertDialogAction onClick={handleDelete}   variant="destructive">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}