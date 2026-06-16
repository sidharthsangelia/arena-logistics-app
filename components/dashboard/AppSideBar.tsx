"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  useOrganization,
  useUser,
  OrganizationSwitcher,
  useClerk,
} from "@clerk/nextjs";
import { useState } from "react";

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
  ChevronDown,
  Building2,
  LogOut,
  ChevronsUpDown,
  User,
  SquareSigma,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";
import { title } from "process";

// ─────────────────────────────────────────────────────────────────────────────
// Nav config
// ─────────────────────────────────────────────────────────────────────────────

const OPERATIONS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Clients", href: "/clients", icon: Building2 },
  { title: "Quotes", href: "/quotes", icon: FileUser },
  { title: "Document Vault", href: "/document-vault", icon: Shield },
] as const;

const SHIPPING = [
  { title: "International Rate Calculator", href: "/rates", icon: Calculator },
  {title:"Domestic Rate Calculator", href: "/domestic-rates", icon: SquareSigma},
  { title: "Book Shipment", href: "/book", icon: PackagePlus },
  { title: "Track Shipment", href: "/track", icon: MapPin },
  { title: "Shipments", href: "/shipments", icon: Package },
] as const;

const ADMIN = [
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Settings", href: "/settings", icon: Settings },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// OrgAvatar
// ─────────────────────────────────────────────────────────────────────────────

function OrgAvatar({
  name,
  logoUrl,
  size = 32,
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
        className="rounded-md object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavSection label
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40 select-none">
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavItem
// ─────────────────────────────────────────────────────────────────────────────

function NavItem({
  item,
  isActive,
}: {
  item: { title: string; href: string; icon: React.ElementType };
  isActive: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        isActive={isActive}
        className={cn(
          "h-8 rounded-md px-2 transition-all duration-100 gap-2.5",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-2.5",
            collapsed && "justify-center",
          )}
        >
          <Icon   
            className={cn(
              "h-[15px] w-[15px] shrink-0",
              isActive
                ? "text-sidebar-foreground"
                : "text-muted-foreground/60",
            )}
          />
          {!collapsed && (
            <span className="text-[13px] leading-none">{item.title}</span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed icon button (used in collapsed state for org + user)
// ─────────────────────────────────────────────────────────────────────────────

function CollapsedIconBtn({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) {
  return (
    <SidebarMenuButton
      tooltip={tooltip}
      className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-sidebar-accent/60 p-0 mx-auto"
    >
      {children}
    </SidebarMenuButton>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppSidebar
// ─────────────────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { organization } = useOrganization();
  const { user } = useUser();
  const { signOut } = useClerk();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const displayName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ??
    "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatarUrl = user?.imageUrl;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <SidebarHeader
        className={cn("pb-2", collapsed ? "px-2 pt-3" : "px-3 pt-3")}
      >
        {/* Logo */}
        <Link
          href="/"
          className={cn(
            "flex items-center rounded-lg transition-colors hover:bg-sidebar-accent/50",
            collapsed ? "justify-center p-1.5" : "gap-3 px-1.5 py-2",
          )}
        >
          <Image
            src="/arena_logo.png"
            alt="Arena Cargo"
            width={collapsed ? 34 : 36}
            height={collapsed ? 34 : 36}
            priority
            className="shrink-0 rounded-md object-contain"
          />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight tracking-tight text-foreground truncate">
                Arena Cargo
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground truncate mt-0.5">
                Operations Platform
              </p>
            </div>
          )}
        </Link>

        {/* Divider */}
        <div className="h-px bg-border/50 my-2" />

        {/* Org switcher */}
        {collapsed ? (
          // Collapsed: org avatar as tooltip button
          // Collapsed org — replace the SidebarMenu/SidebarMenuItem wrapper with just:
<SidebarMenu>
  <SidebarMenuItem>

          <div className="flex justify-center py-1 relative">
            <div className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-sidebar-accent/60 transition-colors cursor-pointer relative">
              <OrgAvatar
                name={organization?.name ?? "O"}
                logoUrl={organization?.imageUrl}
                size={28}
              />
              <div className="absolute inset-0 opacity-0 overflow-hidden rounded-md">
                <OrganizationSwitcher
                  hidePersonal
                  appearance={{
                    elements: {
                      rootBox: "w-full h-full",
                      organizationSwitcherTrigger:
                        "w-full h-full absolute inset-0 opacity-0",
                    },
                  }}
                />
              </div>
            </div>
          </div>
  </SidebarMenuItem>
</SidebarMenu>
        ) : (
          // Expanded: full org row
          <div className="relative rounded-lg border border-border/50 bg-sidebar-accent/30 hover:bg-sidebar-accent/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <OrgAvatar
                name={organization?.name ?? "Select org"}
                logoUrl={organization?.imageUrl}
                size={26}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-tight truncate text-foreground">
                  {organization?.name ?? "Select organisation"}
                </p>
                {organization?.membersCount != null && (
                  <p className="text-[11px] leading-tight text-muted-foreground mt-0.5">
                    {organization.membersCount}{" "}
                    {organization.membersCount === 1 ? "member" : "members"}
                  </p>
                )}
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </div>
            {/* Invisible Clerk overlay — covers the entire row */}
            <div className="absolute inset-0 opacity-0 overflow-hidden rounded-lg">
              <OrganizationSwitcher
                hidePersonal
                appearance={{
                  elements: {
                    rootBox: "w-full h-full",
                    organizationSwitcherTrigger:
                      "w-full h-full absolute inset-0 opacity-0",
                  },
                }}
              />
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <SidebarContent className={cn("py-2", collapsed ? "px-2" : "px-2.5")}>
        {/* Operations */}
        <SidebarGroup className="p-0 mb-1">
          {!collapsed && <SectionLabel>Operations</SectionLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {OPERATIONS.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Divider */}
        <div className={cn("h-px bg-border/40 my-2", collapsed && "mx-1")} />

        {/* Shipping */}
        <SidebarGroup className="p-0 mb-1">
          {!collapsed && <SectionLabel>Shipping</SectionLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {SHIPPING.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Divider */}
        <div className={cn("h-px bg-border/40 my-2", collapsed && "mx-1")} />

        {/* Admin */}
        <SidebarGroup className="p-0">
          {!collapsed && <SectionLabel>Admin</SectionLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {ADMIN.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <SidebarFooter
        className={cn(
          "border-t border-border/60 py-2",
          collapsed ? "px-2" : "px-2.5",
        )}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            {collapsed ? (
              // Collapsed: avatar only, dropdown on click
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={displayName}
                    className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-sidebar-accent/60 p-0 mx-auto"
                  >
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={displayName}
                        width={28}
                        height={28}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-semibold text-primary-foreground">
                        {displayName[0]?.toUpperCase()}
                      </div>
                    )}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-52">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-[13px] font-medium truncate">
                      {displayName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/settings/profile")}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => signOut({ redirectUrl: "/sign-in" })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // Expanded: full user card as dropdown trigger
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      "h-auto w-full rounded-lg px-2 py-2 gap-2.5",
                      "hover:bg-sidebar-accent/60 transition-colors",
                      "data-[state=open]:bg-sidebar-accent/60",
                    )}
                  >
                    {/* Avatar */}
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="rounded-full shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center text-[12px] font-semibold text-primary-foreground">
                        {displayName[0]?.toUpperCase()}
                      </div>
                    )}

                    {/* Name + email */}
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-[12px] font-medium leading-tight truncate text-foreground">
                        {displayName}
                      </p>
                      <p className="text-[11px] leading-tight text-muted-foreground truncate mt-0.5">
                        {email}
                      </p>
                    </div>

                    {/* Chevron */}
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="w-56"
                >
                  <DropdownMenuLabel className="font-normal pb-2">
                    <div className="flex items-center gap-2.5">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={displayName}
                          width={32}
                          height={32}
                          className="rounded-full shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center text-[12px] font-semibold text-primary-foreground">
                          {displayName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">
                          {displayName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {email}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/settings/profile")}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => signOut({ redirectUrl: "/sign-in" })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
