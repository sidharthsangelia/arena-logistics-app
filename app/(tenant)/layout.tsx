import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getOrgShell } from "@/utils/tenant";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileCompletionBanner } from "@/components/profile/ProfileComplettionBanner";
import { SystemNoticeBar } from "@/components/notices/SystemNoticeBar";
import {
  WalletBalanceIndicator,
  WalletBalanceIndicatorSkeleton,
} from "@/components/wallet/WalletBalanceIndicator";
import { HeaderBell } from "@/components/notifications/HeaderBell";
import { NotificationBellSkeleton } from "@/components/notifications/NotificationBell";
import { HelpHeaderControls } from "@/components/help/HelpHeaderControls";
import { getLatestVersionFor } from "@/lib/help/registry";

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

  // Arena staff should never be here
  if (orgId === ARENA_ORG_ID) redirect("/arena-dashboard");

  // Verify their org exists in your DB. Only the id + BA flag, served from a
  // cross-request cache, so the shell below is not sitting behind a Neon round
  // trip on every navigation. The page underneath fetches the full org row when
  // it actually needs one.
  const org = await getOrgShell();
  if (!org) redirect("/onboarding");

  return (
    <main>
      <SidebarProvider>
        <AppSidebar
          variant="tenant"
          basePath="/"
          isBusinessAssociate={org.isBusinessAssociate}
          latestHelpVersion={getLatestVersionFor(
            org.isBusinessAssociate ? "ba" : "standard",
          )}
        />

        {/* min-w-0: a flex item will not shrink below its content by default, so a
            wide table used to stretch this pane past the viewport and the whole
            page scrolled sideways. With it, wide content scrolls inside its own
            container (tables already have one) and the page stays put. */}
        <SidebarInset className="min-w-0">
          {/* Top header bar */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {/* min-w-0 lets a deep breadcrumb trail shrink rather than push the
                wallet chip off the right edge of the header. */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <DashboardBreadcrumb variant="tenant" basePath="/" />
            </div>

            {/* Wallet balance and the notification bell, pinned to the right of
                the breadcrumb. Each is suspended on its own so a slow query on one
                never holds up the other or the header itself. */}
            <div className="flex shrink-0 items-center gap-1">
              <HelpHeaderControls
                variant="tenant"
                basePath="/"
                isBusinessAssociate={org.isBusinessAssociate}
              />
              <Suspense fallback={<WalletBalanceIndicatorSkeleton />}>
                <WalletBalanceIndicator orgId={org.id} />
              </Suspense>
              <Suspense fallback={<NotificationBellSkeleton />}>
                <HeaderBell />
              </Suspense>
            </div>
          </header>

          {/* Ops-authored notices. Suspended so the notice query never delays
              the dashboard shell — the banner streams in when it resolves, and
              the layout is byte-identical when there is nothing to show. */}
          <Suspense fallback={null}>
            <SystemNoticeBar isBusinessAssociate={org.isBusinessAssociate} />
          </Suspense>

          {/* Page content */}
          <ProfileCompletionBanner />
          <div className="flex-1 overflow-auto bg-slate-50">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </main>
  );
}
