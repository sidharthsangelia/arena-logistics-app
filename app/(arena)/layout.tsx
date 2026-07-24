import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getArenaAuth } from "@/utils/arena-auth";

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

 

export default async function ArenaDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");
  if (orgId !== ARENA_ORG_ID) redirect("/dashboard");

  // Drives which nav items render. Money routes are admin-only, and the check is
  // repeated on the pages and actions themselves rather than trusted from here.
  const { isArenaAdmin } = await getArenaAuth();

  // console.log("ARENA LAYOUT CHECK:", {
  //   userId,
  //   orgId,
  //   ARENA_ORG_ID: process.env.ARENA_ORG_ID,
  // });
  return (
    <main>
      <SidebarProvider>
       <AppSidebar
          variant="arena"
          basePath="/arena-dashboard"
          isArenaAdmin={isArenaAdmin}
        />

        <SidebarInset>
          {/* Top header bar */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          <DashboardBreadcrumb variant="arena" basePath="/arena-dashboard" />
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-auto bg-slate-50">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </main>
  );
}
