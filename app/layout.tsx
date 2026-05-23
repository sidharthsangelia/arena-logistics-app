import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSideBar";
import { Separator } from "@/components/ui/separator";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arena Cargo And Logistics - Rate Calculator",
  description: "Calculate international shipping rates instantly. Compare carriers, view detailed charges, and find the best option for your cargo. Fast, accurate, and easy to use.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        
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
      </body>
    </html>
  );
}
