"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CircleHelp, FileText, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveNavHref, visibleNavSections } from "@/components/dashboard/AppSideBar";
import { getPageHelpAction } from "@/actions/help/help.action";
import { linkContextFor } from "@/lib/help/links";
import { scopeOfPath } from "@/lib/help/routes";
import { SUPPORT_EMAIL } from "@/lib/help/types";

import { HelpBlocks } from "./HelpBlocks";
import { useHelpSearch } from "./useHelpSearch";

/**
 * Search (Cmd+K) and page help (?) for the dashboard header.
 *
 * Both controls are fixed-size buttons that render on the server, so the header
 * never reflows. Their content loads only when opened: the search index on the
 * first Cmd+K, an article when "?" is clicked.
 */
export function HelpHeaderControls({
  variant,
  basePath,
  isBusinessAssociate = false,
  isArenaAdmin = false,
}: {
  variant: "tenant" | "arena";
  basePath: string;
  isBusinessAssociate?: boolean;
  isArenaAdmin?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSearchOpen(true)}
        className="h-8 gap-2 px-2 text-muted-foreground sm:w-44 sm:justify-start sm:px-3"
        aria-label="Search pages and guides"
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left font-normal sm:inline">Search</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline">
          Ctrl K
        </kbd>
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setHelpOpen(true)}
            aria-label="Help for this page"
          >
            <CircleHelp className="size-4.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Help for this page</TooltipContent>
      </Tooltip>

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        variant={variant}
        basePath={basePath}
        isBA={isBusinessAssociate}
        isArenaAdmin={isArenaAdmin}
      />
      <PageHelpSheet open={helpOpen} onOpenChange={setHelpOpen} basePath={basePath} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Cmd+K
// ---------------------------------------------------------------------------

function SearchPalette({
  open,
  onOpenChange,
  variant,
  basePath,
  isBA,
  isArenaAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "tenant" | "arena";
  basePath: string;
  isBA: boolean;
  isArenaAdmin: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, isLoading } = useHelpSearch(query, open, 8);

  const pages = useMemo(
    () =>
      visibleNavSections(variant, { isBA, isArenaAdmin }).flatMap((s) =>
        s.items.map((i) => ({ ...i, full: resolveNavHref(basePath, i.href) })),
      ),
    [variant, isBA, isArenaAdmin, basePath],
  );

  const q = query.trim().toLowerCase();
  const matchingPages = q
    ? pages.filter((p) =>
        q.split(/\s+/).every((w) => `${p.title} ${p.description}`.toLowerCase().includes(w)),
      )
    : pages;

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  const helpHome = resolveNavHref(basePath, "/help");

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
      title="Search"
      description="Search pages and help guides"
      className="sm:max-w-xl"
    >
      {/* Filtering is ours: cmdk's own scorer knows nothing about guide bodies. */}
      <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search pages and guides…"
      />
      <CommandList className="max-h-[min(60vh,420px)]">
        {!isLoading && matchingPages.length === 0 && results.length === 0 && (
          <CommandEmpty>
            Nothing found. Try other words, or email {SUPPORT_EMAIL}.
          </CommandEmpty>
        )}

        {matchingPages.length > 0 && (
          <CommandGroup heading={q ? "Pages" : "Go to"}>
            {matchingPages.slice(0, q ? 6 : 20).map((p) => {
              const Icon = p.icon;
              return (
                <CommandItem key={p.full} value={`page:${p.full}`} onSelect={() => go(p.full)}>
                  <Icon className="size-4" />
                  <span>{p.title}</span>
                  <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                    {p.description}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {q && (
          <CommandGroup heading="Guides">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))
              : results.map((r) => (
                  <CommandItem
                    key={r.doc.slug}
                    value={`guide:${r.doc.slug}`}
                    onSelect={() => go(`${helpHome}/${r.doc.slug}`)}
                  >
                    <FileText className="size-4" />
                    <div className="min-w-0">
                      <p className="truncate">{r.doc.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.doc.summary}</p>
                    </div>
                  </CommandItem>
                ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Help">
          <CommandItem value="help:home" onSelect={() => go(helpHome)}>
            <BookOpen className="size-4" />
            <span>All guides</span>
          </CommandItem>
          <CommandItem value="help:whats-new" onSelect={() => go(`${helpHome}/whats-new`)}>
            <Sparkles className="size-4" />
            <span>What&apos;s new</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

// ---------------------------------------------------------------------------
// "?" sheet
// ---------------------------------------------------------------------------

function PageHelpSheet({
  open,
  onOpenChange,
  basePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath: string;
}) {
  const pathname = usePathname();
  const { scope } = scopeOfPath(pathname);

  const help = useQuery({
    queryKey: ["page-help", pathname],
    queryFn: () => getPageHelpAction(pathname),
    enabled: open,
    staleTime: Infinity,
  });

  const data = help.data;
  const article = data?.article ?? null;
  const helpHome = resolveNavHref(basePath, "/help");
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          {help.isPending ? (
            <>
              <SheetTitle className="sr-only">Loading help</SheetTitle>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </>
          ) : article ? (
            <>
              <SheetTitle>{article.title}</SheetTitle>
              <SheetDescription>{article.summary}</SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>Help</SheetTitle>
              <SheetDescription>There is no guide for this screen yet.</SheetDescription>
            </>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {help.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${95 - (i % 3) * 12}%` }} />
              ))}
            </div>
          ) : article && data ? (
            <HelpBlocks
              blocks={article.blocks}
              audience={data.audience}
              ctx={{ ...linkContextFor(article, data.audience, scope), onNavigate: close }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Search all the guides instead, or email {SUPPORT_EMAIL} and we will help directly.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
          {article ? (
            <Link
              href={`${helpHome}/${article.slug}`}
              onClick={close}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open full guide
              <ArrowRight className="size-3.5" />
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={helpHome}
            onClick={close}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            All guides
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
