"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import {
  LayoutDashboard,
  Calculator,
  PackagePlus,
  MapPin,
  Package,
  FileText,
  Settings,
  User,
  FileUser,
  Shield,
  LogIn,
  UserPlus,
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
} from "@/components/ui/sidebar";

import {
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

const OPERATIONS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: User },
  { title: "Quotes", href: "/quotes", icon: FileUser },
  { title: "Document Vault", href: "/document-vault", icon: Shield },
] as const;

const SHIPPING = [
  { title: "Rate Calculator", href: "/rates", icon: Calculator },
  { title: "Book Shipment", href: "/book", icon: PackagePlus },
  { title: "Track Shipment", href: "/track", icon: MapPin },
  { title: "Shipments", href: "/shipments", icon: Package },
] as const;

const ADMIN = [
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Settings", href: "/settings", icon: Settings },
] as const;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r bg-sidebar"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}

      <SidebarHeader className="gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/arena_logo.png"
            alt="Arena Cargo"
            width={100}
            height={36}
            priority
          />

          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">
              Arena Cargo
            </p>

            <p className="truncate text-xs text-muted-foreground">
              Operations Platform
            </p>
          </div>
        </Link>

        <Show when="signed-in">
          <div className="group-data-[collapsible=icon]:hidden">
            <OrganizationSwitcher
              appearance={{
                elements: {
                  rootBox: "w-full",
                  organizationSwitcherTrigger:
                    "w-full justify-between",
                },
              }}
            />
          </div>
        </Show>
      </SidebarHeader>

      {/* ------------------------------------------------------------------ */}
      {/* Content */}
      {/* ------------------------------------------------------------------ */}

      <SidebarContent className="gap-2">
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {OPERATIONS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive(item.href)}
                    className="h-10"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Shipping</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {SHIPPING.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive(item.href)}
                    className="h-10"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive(item.href)}
                    className="h-10"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ------------------------------------------------------------------ */}
      {/* Footer */}
      {/* ------------------------------------------------------------------ */}

      <SidebarFooter className="border-t p-3">
        <Show when="signed-in">
          <div className="flex items-center justify-center group-data-[collapsible=expanded]:justify-start">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
          </div>
        </Show>

        <Show when="signed-out">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <SignInButton mode="modal">
                  <button className="flex w-full items-center gap-3">
                    <LogIn className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      Sign In
                    </span>
                  </button>
                </SignInButton>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <SignUpButton mode="modal">
                  <button className="flex w-full items-center gap-3">
                    <UserPlus className="h-4 w-4" />
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