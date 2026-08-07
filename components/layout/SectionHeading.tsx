import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SectionHeading — the only chrome a flat detail page gets.
//
// A small-caps title over a single hairline, with optional right-hand meta text
// or an action. Pages that use this draw no cards: sections are told apart by
// whitespace and this one rule, and everything inside them earns its place with
// type size and weight instead of a border.
//
// `right` takes either a short string (rendered as quiet meta text) or a node
// (a button, a link) when the section owns an action.
//
// `icon` is for the ops console, where a page carries a dozen sections and a
// glyph gives the eye something to jump between. Customer pages leave it off.
// ---------------------------------------------------------------------------

export function SectionHeading({
  children,
  right,
  hint,
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  /** One line under the title saying what the section is for. */
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2.5">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          {children}
        </h2>
        {right &&
          (typeof right === "string" ? (
            <span className="text-xs text-muted-foreground">{right}</span>
          ) : (
            right
          ))}
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
