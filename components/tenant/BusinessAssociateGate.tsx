import { requireBusinessAssociateOrg } from "@/utils/tenant";

/**
 * Renders its children only for a Business Associate org; anyone else is
 * redirected (see requireBusinessAssociateOrg).
 *
 * A component rather than an await at the top of the layout, so a layout can
 * put it inside a Suspense boundary. Awaited at the top, the guard held the
 * whole layout, and Next stood in the nearest loading state above it, which is
 * the dashboard's: every visit to /quotes or /clients flashed the dashboard
 * skeleton. Inside Suspense, the layout's static header paints at once and
 * only the guarded content waits.
 */
export async function BusinessAssociateGate({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBusinessAssociateOrg();
  return <>{children}</>;
}
