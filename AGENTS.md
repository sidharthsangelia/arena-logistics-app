<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.


there must be proper granular loading states made with the shadcn skeleton component so the only the dynamic part of the component and page is shown in loading state with the skeleton, other hardcoded things should not be blocked behind the loading states. make sure there is no layout shift before and after the loading states. 
<!-- END:nextjs-agent-rules -->


# Help docs must ship with the change

The in-app help centre (`/help`, `/arena-dashboard/help`) is hard-coded TypeScript in `lib/help/content/`. Any change a user would notice (a new page, a renamed button, a new step, a changed rule, threshold or status) must update the docs in the same commit:

1. Edit the matching article in `lib/help/content/*.ts` (or add one, with `routes` for any new page) and set its `updated` to today's IST date, `"YYYY.MM.DD"`.
2. Add an entry to `lib/help/content/changelog.ts` under today's release (create the release at the top if it does not exist), tagged with the audiences it matters to.
3. Run `npm run test:server`. `utils/helpContent.server-test.ts` fails if a page has no guide, a link is broken, a release is out of order, copy has an em dash, or a customer-visible block names a vendor.

Audiences are `standard`, `ba`, `arena-ops`, `arena-admin`. Customer blocks never name a carrier or vendor (see carrierBranding.md); put vendor detail in a block tagged for arena. Money material for Arena is tagged `arena-admin` only. Prefer reading thresholds from the constants the app enforces (as `content/booking.ts` does) over typing the number.
