# 14. Skeletons that cover only the part that is actually loading

**Kind:** technical learning · **Tier:** 3 · **Est. length:** 1100 words

## Hook

Most loading states are a full-page grey rectangle standing in for content the
server already knows. The page heading was never loading. Neither was the tab
bar, the empty-state copy, or the button labels.

## Thesis

A skeleton is not a placeholder for a page, it is a placeholder for a *value*. If
you can render something without waiting, render it, and the loading state
shrinks to the shape of the actual uncertainty.

## Outline

1. The rule this codebase enforces on itself: static copy stays on screen, only
   the dynamic part gets a skeleton, and there is no layout shift across the
   boundary.
2. Why the second half is the hard half. A skeleton that is not dimensionally
   identical to what replaces it is worse than no skeleton, because it moves the
   thing the user was about to click.
3. The practical technique: build the skeleton from the same layout primitives
   and the same measurements as the real component, and colocate them so they
   change together. Twenty-five skeleton components in this repo, each next to
   what it stands in for.
4. Two levels, and the difference. Route-level `loading.tsx` covers navigation;
   component-level skeletons cover data inside a page that is already up. Getting
   this split right is why the heading does not blink.
5. Server components decide what is static. This is the part that connects to
   architecture rather than CSS: the reason so much can stay on screen is that
   only the dynamic subtree is suspended.
6. Where a client query is the right answer instead. Tables that poll on a short
   interval, and why that is a different loading problem with a different answer
   (keep previous data, do not skeleton on refetch).
7. Loading heavy engines on demand. The spreadsheet parser is around 420KB of
   client JavaScript and used to be a static import; the PDF renderer is similar.
   Both are now dynamic, and the interaction that needs them owns the wait.
8. A checklist to close on.

## Code

- `components/**/*Skeleton*.tsx`, `app/**/skeletons.tsx`, `app/**/loading.tsx`
- `components/data-table/DataTableSkeleton.tsx`
- `components/invoices/useInvoicesQuery.ts`
- `lib/clients/clientImportBrowser.ts`

## Note

Broadest-appeal post in the backlog. Good candidate for the one that brings
people to the harder ones.
