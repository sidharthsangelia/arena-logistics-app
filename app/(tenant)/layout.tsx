import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { prisma } from "@/utils/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LayoutDashboard, Building2, FileUser, Shield,
         Calculator, PackagePlus, MapPin, Package,
         FileText, Settings, SquareSigma } from "lucide-react";



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

  // Verify their org exists in your DB
  const org = await prisma.org.findUnique({ where: { clerkOrgId: orgId } });
  if (!org) redirect("/onboarding");


 


  return (
    <main>
      <SidebarProvider>
     <AppSidebar variant="tenant" basePath="/" />


        <SidebarInset>
          {/* Top header bar */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
           <DashboardBreadcrumb variant="tenant" basePath="/" />
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-auto bg-slate-50">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </main>
  );
}
