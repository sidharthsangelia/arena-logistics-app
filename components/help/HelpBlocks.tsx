import { ChevronRight, Info, Lightbulb, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { blockAudienceLabel } from "@/lib/help/audience";
import type { HelpAudience, HelpBlock } from "@/lib/help/types";
import { cn } from "@/lib/utils";

import { HelpText, type HelpLinkContext } from "./HelpText";

/**
 * Renders an article's blocks. Expects blocks already filtered for the viewer
 * (lib/help/registry does that); `audience` is only used to label variants
 * for Arena staff, who read every customer variant.
 */
export function HelpBlocks({
  blocks,
  audience,
  ctx,
}: {
  blocks: readonly HelpBlock[];
  audience: HelpAudience;
  ctx: HelpLinkContext;
}) {
  return (
    <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
      {blocks.map((block, i) => {
        const variant = blockAudienceLabel(block, audience);
        const body = <Block block={block} ctx={ctx} />;
        if (!variant) return <div key={i}>{body}</div>;
        return (
          <div key={i} className="border-l-2 border-dashed pl-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Shown to {variant}
            </p>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function Block({ block, ctx }: { block: HelpBlock; ctx: HelpLinkContext }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="pt-2 text-base font-semibold text-foreground">
          <HelpText text={block.text} ctx={ctx} />
        </h2>
      );

    case "p":
      return (
        <p>
          <HelpText text={block.text} ctx={ctx} />
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-1.5 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, i) => (
            <li key={i}>
              <HelpText text={item} ctx={ctx} />
            </li>
          ))}
        </Tag>
      );
    }

    case "steps":
      return (
        <ol className="space-y-4">
          {block.items.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-medium text-foreground">
                  <HelpText text={step.title} ctx={ctx} />
                </p>
                {step.body && (
                  <p className="mt-0.5">
                    <HelpText text={step.body} ctx={ctx} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      );

    case "callout": {
      const Icon = block.tone === "warning" ? TriangleAlert : block.tone === "tip" ? Lightbulb : Info;
      return (
        <Alert
          className={cn(
            block.tone === "warning" &&
              "border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200 [&>svg]:text-amber-600",
          )}
        >
          <Icon />
          {block.title && <AlertTitle>{block.title}</AlertTitle>}
          <AlertDescription className={cn(block.tone === "warning" && "text-amber-900/90 dark:text-amber-200/90")}>
            <p>
              <HelpText text={block.text} ctx={ctx} />
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    case "table":
      return (
        <div className="overflow-x-auto rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                {block.head.map((h, i) => (
                  <TableHead key={i} className="whitespace-nowrap">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((cell, c) => (
                    <TableCell
                      key={c}
                      className={cn(
                        "align-top whitespace-normal",
                        c === 0 && "font-medium text-foreground",
                      )}
                    >
                      {cell ? <HelpText text={cell} ctx={ctx} /> : <span className="text-muted-foreground/50">Not needed</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "flow":
      return (
        <ol className="flex flex-wrap items-stretch gap-y-2">
          {block.stages.map((stage, i) => (
            <li key={i} className="flex items-center">
              <div
                className={cn(
                  "rounded-md border bg-background px-2.5 py-1.5",
                  stage.tone === "success" && "border-emerald-200 dark:border-emerald-900",
                  stage.tone === "warning" && "border-amber-200 dark:border-amber-900",
                )}
              >
                <p className="text-xs font-medium text-foreground">{stage.label}</p>
                {stage.hint && <p className="text-[11px] leading-tight">{stage.hint}</p>}
              </div>
              {i < block.stages.length - 1 && (
                <ChevronRight className="mx-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      );

    case "faq":
      return (
        <dl className="divide-y rounded-md border bg-background">
          {block.items.map((item, i) => (
            <div key={i} className="space-y-1 p-4">
              <dt className="font-medium text-foreground">
                <HelpText text={item.q} ctx={ctx} />
              </dt>
              <dd>
                <HelpText text={item.a} ctx={ctx} />
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}
