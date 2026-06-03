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
  LogIn,
  UserPlus,
  User,
  FileUser,
  Shield,
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
import { Badge } from "@/components/ui/badge";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

// Nav items

const NAV_MAIN = [
  { label: "Overview", href: "/", icon: LayoutDashboard, badge: null },
  { label: "Clients", href: "/clients", icon: User, badge: null },
  { label: "Rate Calculator", href: "/rates", icon: Calculator, badge: null },
  { label: "Book Order", href: "/book", icon: PackagePlus, badge: null },
  { label: "Track Shipment", href: "/track", icon: MapPin, badge: null },
  { label: "Quotes", href: "/quotes", icon: FileUser, badge: null },
  { label: "Shipments", href: "/shipments", icon: Package, badge: "3" },
  { label: "Invoices", href: "/invoices", icon: FileText, badge: null },
  { label: "Document Vault", href: "/document-vault", icon: Shield, badge: null },
] as const;

const NAV_SYSTEM = [
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Brand header */}
      <SidebarHeader className="px-3 py-4">
        <Link href="/" className="flex items-center gap-2.5 px-1">
          <Image
            src="/arena_logo.png"
            alt="Arena Cargo Logo"
            width={84}
            height={32}
          />
          <div className="group-data-[collapsible=icon]:hidden overflow-hidden">
            <p className="text-sm font-semibold leading-none text-sidebar-foreground truncate">
              Arena Cargo
            </p>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5 truncate">
              &amp; Logistics
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main nav */}
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

      {/* Footer / auth */}
      <SidebarFooter className="p-3">
        <SidebarSeparator className="mb-2" />

        {/* Signed in: Clerk UserButton */}
        <Show when="signed-in">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="group-data-[collapsible=icon]:justify-center gap-3 h-auto py-2"
                tooltip="Account"
              >
                <UserButton
                  appearance={{
                    elements: { avatarBox: "h-7 w-7 shrink-0" },
                  }}
                />
                <div className="flex flex-col items-start text-left group-data-[collapsible=icon]:hidden min-w-0 flex-1">
                  <span className="text-xs font-medium truncate leading-none">
                    My Account
                  </span>
                  <span className="text-xs text-sidebar-foreground/50 truncate mt-0.5">
                    Manage profile &amp; billing
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Show>

        {/* Signed out: Sign In + Sign Up */}
        <Show when="signed-out">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign In" asChild>
                <SignInButton mode="modal">
                  <button className="flex w-full items-center gap-2 text-sm">
                    <LogIn className="h-4 w-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Sign In
                    </span>
                  </button>
                </SignInButton>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Create Account" asChild>
                <SignUpButton mode="modal">
                  <button className="flex w-full items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                    <UserPlus className="h-4 w-4 shrink-0" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Create Account
                    </span>
                  </button>
                </SignUpButton>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Show>
      </SidebarFooter>
    </Sidebar>
  );
}
