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

import {
  LayoutDashboard,
  Building2,
  FileUser,
  Shield,
  Calculator,
  PackagePlus,
  MapPin,
  Package,
  FileText,
  Settings,
  SquareSigma,
  PackageCheck,
  Users,
  BarChart3,
  Upload,
  ChevronsUpDown,
  User,
  LogOut,
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavConfig {
  subtitle: string;
  sections: NavSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav configs — defined here (client file) so icons never cross the
// Server → Client boundary. Only the string variant key is passed as a prop.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_CONFIGS: Record<string, NavConfig> = {
  tenant: {
    subtitle: "Freight Operations",
    sections: [
      {
        label: "Operations",
        items: [
          { title: "Dashboard",      href: "/",               icon: LayoutDashboard },
          { title: "Clients",        href: "/clients",        icon: Building2 },
          { title: "Quotes",         href: "/quotes",         icon: FileUser },
          { title: "Document Vault", href: "/document-vault", icon: Shield },
        ],
      },
      {
        label: "Shipping",
        items: [
          { title: "International Rates", href: "/rates",          icon: Calculator },
          { title: "Domestic Rates",      href: "/domestic-rates", icon: SquareSigma },
          { title: "Book Shipment",       href: "/book",           icon: PackagePlus },
          { title: "Track Shipment",      href: "/track",          icon: MapPin },
          { title: "Shipments",           href: "/shipments",      icon: Package },
        ],
      },
      {
        label: "Admin",
        items: [
          { title: "Invoices", href: "/invoices", icon: FileText },
          { title: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ],
  },

  arena: {
    subtitle: "Internal Ops",
    sections: [
      {
        label: "Operations",
        items: [
          { title: "Overview",  href: "/",         icon: LayoutDashboard },
          { title: "Bookings",  href: "/bookings", icon: PackageCheck },
          { title: "Clients",   href: "/clients",  icon: Users },
        ],
      },
      {
        label: "Rate Management",
        items: [
          { title: "Rate Cards",   href: "/rate-cards",        icon: BarChart3 },
          { title: "Upload Domestic Rates", href: "/domestic-rates/upload", icon: Upload },
        ],
      },
      {
        label: "Admin",
        items: [
          { title: "Settings", href: "/settings", icon: Settings },
        ],
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Props — only serializable values cross the Server → Client boundary
// ─────────────────────────────────────────────────────────────────────────────

export interface AppSidebarProps {
  /** "tenant" | "arena" — selects the nav config defined above */
  variant: keyof typeof NAV_CONFIGS;
  /** Base path for href resolution and active detection
   *  e.g. "/dashboard" or "/arena-dashboard" */
  basePath: string;
}

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
// SectionLabel
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40 select-none">
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavItemRow
// ─────────────────────────────────────────────────────────────────────────────

function NavItemRow({
  item,
  isActive,
}: {
  item: NavItem;
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
// AppSidebar
// ─────────────────────────────────────────────────────────────────────────────

export function AppSidebar({ variant, basePath }: AppSidebarProps) {
  const { subtitle, sections } = NAV_CONFIGS[variant];

  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { organization } = useOrganization();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Resolve full href by prepending basePath to relative hrefs
  // e.g. basePath="/dashboard", href="/clients" → "/dashboard/clients"
  // e.g. href="/" → basePath itself (the index route)
  const resolveHref = (href: string) =>
    href === "/" ? basePath : `${basePath}${href}`;

  // Active check against full resolved path
  const isActive = (href: string) => {
    const full = resolveHref(href);
    return full === basePath
      ? pathname === basePath
      : pathname.startsWith(full);
  };

  const displayName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ??
    "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatarUrl = user?.imageUrl;

  const UserAvatar = ({ size }: { size: number }) =>
    avatarUrl ? (
      <Image
        src={avatarUrl}
        alt={displayName}
        width={size}
        height={size}
        className="rounded-full shrink-0"
      />
    ) : (
      <div
        className="rounded-full bg-primary flex items-center justify-center font-semibold text-primary-foreground shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {displayName[0]?.toUpperCase()}
      </div>
    );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <SidebarHeader
        className={cn("pb-2", collapsed ? "px-2 pt-3" : "px-3 pt-3")}
      >
        {/* Logo */}
        <Link
          href={basePath}
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
                {subtitle}
              </p>
            </div>
          )}
        </Link>

        {/* Divider */}
        <div className="h-px bg-border/50 my-2" />

        {/* Org switcher */}
        {collapsed ? (
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
        {sections.map((section, sectionIndex) => (
          <div key={section.label}>
            {/* Divider between sections (not before the first) */}
            {sectionIndex > 0 && (
              <div className={cn("h-px bg-border/40 my-2", collapsed && "mx-1")} />
            )}

            <SidebarGroup className="p-0 mb-1">
              {!collapsed && <SectionLabel>{section.label}</SectionLabel>}
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">
                  {section.items.map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={{ ...item, href: resolveHref(item.href) }}
                      isActive={isActive(item.href)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={displayName}
                    className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-sidebar-accent/60 p-0 mx-auto"
                  >
                    <UserAvatar size={28} />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-52">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-[13px] font-medium truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(`${basePath}/settings`)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`${basePath}/settings/profile`)}>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      "h-auto w-full rounded-lg px-2 py-2 gap-2.5",
                      "hover:bg-sidebar-accent/60 transition-colors",
                      "data-[state=open]:bg-sidebar-accent/60",
                    )}
                  >
                    <UserAvatar size={32} />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-[12px] font-medium leading-tight truncate text-foreground">
                        {displayName}
                      </p>
                      <p className="text-[11px] leading-tight text-muted-foreground truncate mt-0.5">
                        {email}
                      </p>
                    </div>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>

                <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56">
                  <DropdownMenuLabel className="font-normal pb-2">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar size={32} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{displayName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push(`${basePath}/settings`)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`${basePath}/settings/profile`)}>
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