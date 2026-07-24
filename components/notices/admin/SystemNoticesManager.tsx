"use client";

// The notices list. Each row answers the one question ops actually has: what
// are tenants seeing right now? Hence the computed status chip rather than a
// pair of raw dates to compare by eye.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  AUDIENCE_CONFIG,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
} from "@/lib/notices/config";
import { noticeStatus } from "@/lib/notices/visibility";
import type { AdminSystemNoticeDTO } from "@/lib/notices/types";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";
import {
  cloneSystemNotice,
  deleteSystemNotice,
  setSystemNoticeActive,
} from "@/actions/notices/systemNotices.action";

import { SystemNoticeFormSheet } from "./SystemNoticeFormSheet";

export function SystemNoticesManager({
  notices,
}: {
  notices: AdminSystemNoticeDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSystemNoticeDTO | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<AdminSystemNoticeDTO | null>(null);

  // Bumped on every open so the form body remounts with fresh state. `editing`
  // is deliberately left in place on close, keeping the body rendered while the
  // sheet animates out.
  const [openCount, setOpenCount] = useState(0);

  // Optimistic switch state, keyed by notice id. The row flips the instant it
  // is clicked; the server result either confirms it or the refresh below
  // restores the truth.
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const openNew = () => {
    setEditing(null);
    setOpenCount((count) => count + 1);
    setSheetOpen(true);
  };

  const openEdit = (notice: AdminSystemNoticeDTO) => {
    setEditing(notice);
    setOpenCount((count) => count + 1);
    setSheetOpen(true);
  };

  const handleToggle = (notice: AdminSystemNoticeDTO, next: boolean) => {
    setToggling((current) => ({ ...current, [notice.id]: next }));

    startTransition(async () => {
      const result = await setSystemNoticeActive(notice.id, next);

      if (result.ok) {
        toast.success(next ? "Notice is now live" : "Notice switched off");
      } else {
        toast.error(result.error);
        setToggling((current) => {
          const next = { ...current };
          delete next[notice.id];
          return next;
        });
      }

      router.refresh();
    });
  };

  const handleClone = (notice: AdminSystemNoticeDTO) => {
    startTransition(async () => {
      const result = await cloneSystemNotice(notice.id);
      if (result.ok) {
        toast.success("Duplicated. The copy is switched off until you publish it.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);

    startTransition(async () => {
      const result = await deleteSystemNotice(target.id);
      if (result.ok) {
        toast.success("Notice deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const liveCount = notices.filter(
    (notice) => noticeStatus(notice) === "LIVE",
  ).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Dashboard notices
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {liveCount === 0
                ? "Nothing is showing on tenant dashboards right now."
                : `${liveCount} ${liveCount === 1 ? "notice is" : "notices are"} showing on tenant dashboards right now.`}
            </p>
          </div>

          <Button onClick={openNew} size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New notice
          </Button>
        </div>

        {notices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-white py-14 text-center">
            <Megaphone className="h-7 w-7 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No notices yet</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Write one to tell every tenant about a delay, a rate change or a
                holiday closure.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New notice
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-17.5">Live</TableHead>
                  <TableHead className="min-w-70">Notice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {notices.map((notice) => {
                  const status = noticeStatus(notice);
                  const statusConfig = STATUS_CONFIG[status];
                  const severityConfig = SEVERITY_CONFIG[notice.severity];
                  const isActive = toggling[notice.id] ?? notice.isActive;

                  return (
                    <TableRow key={notice.id}>
                      <TableCell>
                        <Switch
                          checked={isActive}
                          disabled={pending}
                          onCheckedChange={(next) => handleToggle(notice, next)}
                          aria-label={
                            isActive ? "Switch notice off" : "Switch notice on"
                          }
                        />
                      </TableCell>

                      <TableCell className="max-w-105">
                        {notice.title && (
                          <p className="text-sm font-medium">{notice.title}</p>
                        )}
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {notice.message}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {!notice.dismissible && (
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Cannot be dismissed
                            </span>
                          )}
                          {notice.priority > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              Priority {notice.priority}
                            </span>
                          )}
                          {notice.revision > 1 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[11px] text-muted-foreground">
                                  Edited {notice.revision - 1}x
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Each content edit re-shows this notice to tenants
                                who had already dismissed it.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn("border-transparent", statusConfig.chip)}
                        >
                          {statusConfig.label}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn("border-transparent", severityConfig.chip)}
                        >
                          {severityConfig.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {AUDIENCE_CONFIG[notice.audience].label}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {notice.displayMode === "SCHEDULED" ? (
                          <div className="space-y-0.5 whitespace-nowrap">
                            <p>
                              From{" "}
                              {notice.startsAt
                                ? formatDateTime(notice.startsAt)
                                : "immediately"}
                            </p>
                            <p>
                              Until{" "}
                              {notice.endsAt
                                ? formatDateTime(notice.endsAt)
                                : "switched off"}
                            </p>
                          </div>
                        ) : (
                          "Until switched off"
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEdit(notice)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                onClick={() => handleClone(notice)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span className="sr-only">Duplicate</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Duplicate for a repeat announcement
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                disabled={pending}
                                onClick={() => setConfirmDelete(notice)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <SystemNoticeFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          editing={editing}
          formKey={`${editing?.id ?? "new"}:${openCount}`}
          onSaved={() => router.refresh()}
        />

        <AlertDialog
          open={confirmDelete !== null}
          onOpenChange={(open) => !open && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this notice?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from every tenant dashboard immediately. Duplicate it
                first if you expect to send it again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
