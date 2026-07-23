import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getCurrentOrg } from "@/utils/tenant";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileCompletionBanner } from "@/components/profile/ProfileComplettionBanner";

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

  // Verify their org exists in your DB. Shared (per-request memoised) with the
  // page below, so the layout + page don't each fire their own org query.
  const org = await getCurrentOrg();
  if (!org) redirect("/onboarding");

  return (
    <main>
      <SidebarProvider>
        <AppSidebar
          variant="tenant"
          basePath="/"
          isBusinessAssociate={org.isBusinessAssociate}
        />

        <SidebarInset>
          {/* Top header bar */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <DashboardBreadcrumb variant="tenant" basePath="/" />
          </header>

          {/* Page content */}
          <ProfileCompletionBanner />
          <div className="flex-1 overflow-auto bg-slate-50">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </main>
  );
}
