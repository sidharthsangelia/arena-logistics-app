"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Calculator,
  PackagePlus,
  MapPin,
  Package,
  FileText,
  Settings,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_MAIN = [
  { label: "Overview",        href: "/",  icon: LayoutDashboard, badge: null },
  { label: "Rate Calculator", href: "/rates",       icon: Calculator,      badge: null },
  { label: "Book Order",      href: "/book",        icon: PackagePlus,     badge: null },
  { label: "Track Shipment",  href: "/track",       icon: MapPin,          badge: null },
  { label: "Shipments",       href: "/shipments",   icon: Package,         badge: "3"  },
  { label: "Invoices",        href: "/invoices",    icon: FileText,        badge: null },
] as const;

const NAV_SYSTEM = [
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* ── Brand header ──────────────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5 px-1">
          {/* Logo: always visible, even when collapsed */}
          {/* <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <Package className="h-4 w-4 text-white" />
          </div> */}
          <Image src="/arena_logo.png" alt="Arena Cargo Logo" width={84} height={32} />
          {/* Name: hidden when sidebar is icon-only */}
          <div className="group-data-[collapsible=icon]:hidden overflow-hidden">
            <p className="text-sm font-semibold leading-none text-sidebar-foreground truncate">
              Arena Cargo
            </p>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5 truncate">
              &amp; Logistics
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ── Main nav ──────────────────────────────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} className="flex items-center gap-2">
                      <item.icon className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <Badge
                          variant="secondary"
                          className="ml-auto h-5 min-w-5 px-1 text-xs group-data-[collapsible=icon]:hidden"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_SYSTEM.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon className="shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer / user ─────────────────────────────────────────────────── */}
      <SidebarFooter className="p-2">
        <SidebarSeparator className="mb-2" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="group-data-[collapsible=icon]:justify-center"
              tooltip="Account"
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                  AC
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left group-data-[collapsible=icon]:hidden min-w-0">
                <span className="text-xs font-medium truncate">Admin</span>
                <span className="text-xs text-sidebar-foreground/50 truncate">
                  arena@cargo.com
                </span>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}