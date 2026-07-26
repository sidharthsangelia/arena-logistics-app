import { cn } from "@/lib/utils"

/**
 * Placeholder block for content that has not landed yet. A single band of light
 * sweeps left to right across it; the block itself never changes opacity, so a
 * screen full of skeletons reads as still surfaces catching light rather than
 * as blinking boxes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative isolate overflow-hidden rounded-md bg-skeleton",
        "after:absolute after:inset-0 after:content-[''] after:animate-skeleton-sheen",
        "after:bg-[linear-gradient(100deg,transparent_38%,var(--skeleton-sheen)_50%,transparent_62%)]",
        "motion-reduce:after:hidden",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
