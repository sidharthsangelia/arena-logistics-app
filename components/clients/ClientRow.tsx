"use client";

import { useState } from "react";

import type { Client } from "@/generated/prisma";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import EditClientDialog from "@/components/clients/toolbar/EditClientDialog";
import DeleteClientDialog from "@/components/clients/toolbar/DeleteClientDialog";

type Props = {
  client: Client;
};

export default function ClientRowActions({
  client,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] =
    useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setEditOpen(true)}
          >
            Edit
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditClientDialog
        client={client}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <DeleteClientDialog
        client={client}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}