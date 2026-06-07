"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useOrganization, useUser, OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import {
  LayoutDashboard,
  Calculator,
  PackagePlus,
  MapPin,
  Package,
  FileText,
  Settings,
  FileUser,
  Shield,
  ChevronRight,
  Building2,
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
  useSidebar,
} from "@/components/ui/sidebar";

import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Navigation config
// -----------------------------------------------------------------------------

const OPERATIONS = [
  { title: "Dashboard",       href: "/",               icon: LayoutDashboard },
  { title: "Clients",         href: "/clients",         icon: Building2 },
  { title: "Quotes",          href: "/quotes",          icon: FileUser },
  { title: "Document Vault",  href: "/document-vault",  icon: Shield },
] as const;

const SHIPPING = [
  { title: "Rate Calculator", href: "/rates",           icon: Calculator },
  { title: "Book Shipment",   href: "/book",            icon: PackagePlus },
  { title: "Track Shipment",  href: "/track",           icon: MapPin },
  { title: "Shipments",       href: "/shipments",       icon: Package },
] as const;

const ADMIN = [
  { title: "Invoices",        href: "/invoices",        icon: FileText },
  { title: "Settings",        href: "/settings",        icon: Settings },
] as const;

// -----------------------------------------------------------------------------
// Org avatar — uses logo if available, falls back to initials
// -----------------------------------------------------------------------------

function OrgAvatar({
  name,
  logoUrl,
  size = 28,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Nav item
// -----------------------------------------------------------------------------

function NavItem({
  item,
  isActive,
}: {
  item: { title: string; href: string; icon: React.ElementType };
  isActive: boolean;
}) {
  const { state } = useSidebar();
  const collapsed  = state === "collapsed";
  const Icon       = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        isActive={isActive}
        className={cn(
          "group/item h-9 rounded-lg transition-all duration-150",
          isActive
            ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Link href={item.href} className="flex items-center gap-2.5">
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover/item:text-sidebar-accent-foreground",
            )}
          />
          {!collapsed && (
            <span className="truncate text-[13px]">{item.title}</span>
          )}
          {!collapsed && isActive && (
            <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-sidebar-primary opacity-60" />
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// -----------------------------------------------------------------------------
// Main sidebar
// -----------------------------------------------------------------------------

export function AppSidebar() {
  const pathname             = usePathname();
  const { state }            = useSidebar();
  const collapsed            = state === "collapsed";
  const { organization }     = useOrganization();
  const { user }             = useUser();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon" className="border-r">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <SidebarHeader className="px-3 py-3">

        {/* Logo strip — always visible */}
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
        >
          <div className="relative shrink-0">
            <Image
              src="/arena_logo.png"
              alt="Arena Cargo"
              width={28}
              height={28}
              priority
              className="rounded-md object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">
                Arena Cargo
              </p>
              <p className="truncate text-[11px] text-muted-foreground leading-tight">
                Operations Platform
              </p>
            </div>
          )}
        </Link>

        {/* Divider */}
        <div className="my-1 h-px bg-border/60" />

        {/* Org switcher section */}
        {collapsed ? (
          /* Collapsed: just show org avatar centered */
          <div className="flex justify-center py-1">
            <OrgAvatar
              name={organization?.name ?? "Org"}
              logoUrl={organization?.imageUrl}
              size={28}
            />
          </div>
        ) : (
          /* Expanded: custom trigger + Clerk switcher hidden behind it */
          <div className="relative">
            {/* Visual org row — purely display */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-sidebar-accent/40 px-2.5 py-2">
              <OrgAvatar
                name={organization?.name ?? "Select org"}
                logoUrl={organization?.imageUrl}
                size={24}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium leading-tight">
                  {organization?.name ?? "Select organisation"}
                </p>
                {organization?.membersCount != null && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {organization.membersCount}{" "}
                    {organization.membersCount === 1 ? "member" : "members"}
                  </p>
                )}
              </div>
              {/* Clerk's OrganizationSwitcher — invisible overlay */}
              <div className="absolute inset-0 opacity-0">
                <OrganizationSwitcher
                  hidePersonal
                  appearance={{
                    elements: {
                      rootBox:                     "w-full h-full",
                      organizationSwitcherTrigger: "w-full h-full opacity-0 absolute inset-0",
                    },
                  }}
                />
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 rotate-90" />
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <SidebarContent className="px-2 py-1">

        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
              Operations
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {OPERATIONS.map((item) => (
                <NavItem key={item.href} item={item} isActive={isActive(item.href)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && <div className="mx-2 h-px bg-border/40" />}

        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
              Shipping
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {SHIPPING.map((item) => (
                <NavItem key={item.href} item={item} isActive={isActive(item.href)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && <div className="mx-2 h-px bg-border/40" />}

        <SidebarGroup className="py-1">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
              Administration
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {ADMIN.map((item) => (
                <NavItem key={item.href} item={item} isActive={isActive(item.href)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <SidebarFooter className="border-t px-3 py-3">
        {collapsed ? (
          /* Collapsed: just the avatar */
          <div className="flex justify-center">
            <UserButton
              appearance={{ elements: { avatarBox: "h-8 w-8" } }}
            />
          </div>
        ) : (
          /* Expanded: user card */
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent group/user cursor-pointer">
            <UserButton
              appearance={{ elements: { avatarBox: "h-8 w-8 shrink-0" } }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-tight">
                {user?.fullName ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "User"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground leading-tight">
                {user?.primaryEmailAddress?.emailAddress ?? ""}
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 group-hover/user:opacity-100 transition-opacity" />
          </div>
        )}
      </SidebarFooter>

    </Sidebar>
  );
}