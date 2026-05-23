import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>

    <SidebarProvider>
      <AppSidebar />

      <SidebarInset>
        {/* ── Top header bar ──────────────────────────────────────────────── */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <DashboardBreadcrumb />
        </header>

        {/* ── Page content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto bg-slate-50">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}