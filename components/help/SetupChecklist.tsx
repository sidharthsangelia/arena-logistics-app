import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getSetupProgress } from "@/lib/help/progress";
import { cn } from "@/lib/utils";

/**
 * "Getting started" on the help home. Ticks come from live account data, so
 * this is the only part of the help home that waits on the database; the card
 * title and description are static and render in the skeleton too.
 */
export async function SetupChecklist() {
  const steps = await getSetupProgress();
  if (!steps) return null;

  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;

  return (
    <ChecklistFrame
      meta={`${done} of ${steps.length} done`}
      progress={<Progress value={(done / steps.length) * 100} className="h-1.5" />}
    >
      {steps.map((step, i) => (
        <li key={step.key} className="flex h-14 items-center gap-3 px-4">
          {step.done ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="Done" />
          ) : (
            <Circle className="size-5 shrink-0 text-muted-foreground" aria-label="Not done yet" />
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", step.done ? "text-muted-foreground" : "text-foreground")}>
              {i + 1}. {step.label}
            </p>
            <Link href={`/help/${step.article}`} className="text-xs text-primary underline-offset-4 hover:underline">
              How to do this
            </Link>
          </div>
          {!step.done && (
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href={step.href}>
                Go
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </li>
      ))}
      {allDone && (
        <li className="px-4 py-3 text-sm text-muted-foreground">
          You are all set. The guides below cover everything else.
        </li>
      )}
    </ChecklistFrame>
  );
}

function ChecklistFrame({
  meta,
  progress,
  children,
}: {
  meta: React.ReactNode;
  progress: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-1 border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Getting started</CardTitle>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </div>
        <CardDescription>Do these in order. Each one ticks itself off once it is done.</CardDescription>
        <div className="pt-2">{progress}</div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  );
}

/** Four rows: the common case (address, documents, wallet, first booking). */
export function SetupChecklistSkeleton() {
  return (
    <ChecklistFrame
      meta={<Skeleton className="h-3 w-16" />}
      progress={<Skeleton className="h-1.5 w-full" />}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex h-14 items-center gap-3 px-4">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-14" />
        </li>
      ))}
    </ChecklistFrame>
  );
}
