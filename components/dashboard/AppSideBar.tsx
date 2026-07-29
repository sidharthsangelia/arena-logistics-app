"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  useOrganization,
  useUser,
  OrganizationSwitcher,
  useClerk,
} from "@clerk/nextjs";

import { coerceOrgType, isBusinessAssociateType } from "@/lib/org-type";
import { ensureOrgTypeMetadata } from "@/actions/org/orgType.action";

import {
  LayoutDashboard,
  Building2,
  FileUser,
  Shield,
  Calculator,
  PackagePlus,
  MapPin,
  BookMarked,
  Package,
  FileText,
  Settings,
  SquareSigma,
  PackageCheck,
  Truck,
  Users,
  ChevronsUpDown,
  User,
  LogOut,
  Handshake,
  Wallet,
  Megaphone,
  MailCheck,
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
  SidebarRail,
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

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  /** Plain-language line shown under the title in the collapsed-rail tooltip.
   *  Written for someone who has not used the app before. */
  description: string;
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
          {
            title: "Dashboard",
            href: "/",
            icon: LayoutDashboard,
            description: "Your shipping activity at a glance",
          },
          {
            title: "Clients",
            href: "/clients",
            icon: Building2,
            description: "Companies you ship on behalf of",
          },
          {
            title: "Address Book",
            href: "/addressbook",
            icon: BookMarked,
            description: "Saved pickup and delivery addresses",
          },
          {
            title: "Quotes",
            href: "/quotes",
            icon: FileUser,
            description: "Prices you have quoted to your clients",
          },
          {
            title: "Document Vault",
            href: "/document-vault",
            icon: Shield,
            description: "All your shipping paperwork in one place",
          },
        ],
      },
      {
        label: "Shipping",
        items: [
          {
            title: "International Rates",
            href: "/rates",
            icon: Calculator,
            description: "Check prices for parcels going abroad",
          },
          {
            title: "Domestic Rates",
            href: "/domestic-rates",
            icon: SquareSigma,
            description: "Check prices for parcels inside India",
          },
          {
            title: "Book Shipment",
            href: "/book",
            icon: PackagePlus,
            description: "Start a new booking",
          },
          {
            title: "Track Shipment",
            href: "/track",
            icon: MapPin,
            description: "See where a parcel has reached",
          },
          {
            title: "Shipments",
            href: "/shipments",
            icon: Package,
            description: "Every shipment you have booked",
          },
        ],
      },
      {
        label: "Account",
        items: [
          {
            title: "Wallet",
            href: "/wallet",
            icon: Wallet,
            description: "Add money and see what you have spent",
          },
          {
            title: "Invoices",
            href: "/invoices",
            icon: FileText,
            description: "Bills Arena has raised to you",
          },
          {
            title: "Client Emails",
            href: "/settings/client-emails",
            icon: MailCheck,
            description: "Choose which updates your clients receive",
          },
          {
            title: "Settings",
            href: "/settings/profile",
            icon: Settings,
            description: "Your company profile and account details",
          },
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
          {
            title: "Overview",
            href: "/",
            icon: LayoutDashboard,
            description: "Today's activity across every account",
          },
          {
            title: "International",
            href: "/bookings",
            icon: PackageCheck,
            description: "Export shipments waiting to be processed",
          },
          {
            title: "Domestic",
            href: "/domestic-bookings",
            icon: Truck,
            description: "India to India courier shipments",
          },
          {
            title: "Accounts",
            href: "/accounts",
            icon: Building2,
            description: "Everyone who has signed up on the platform",
          },
          {
            title: "Business Associates",
            href: "/business-associates",
            icon: Handshake,
            description: "Partner firms that book for their own clients",
          },
          {
            title: "All Clients",
            href: "/clients",
            icon: Users,
            description: "Customers that business associates book for",
          },
          {
            title: "All Quotes",
            href: "/quotes",
            icon: FileUser,
            description: "Quotes raised by every account",
          },
          {
            title: "Document Vault",
            href: "/document-vault",
            icon: Shield,
            description: "Shipping paperwork uploaded by accounts",
          },
        ],
      },
      {
        label: "Shipping",
        items: [
          {
            title: "International Rates",
            href: "/rates",
            icon: Calculator,
            description: "Check prices for parcels going abroad",
          },
          {
            title: "Domestic Rates",
            href: "/domestic-rates",
            icon: SquareSigma,
            description: "Check prices for parcels inside India",
          },
          {
            title: "Track Shipment",
            href: "/track",
            icon: MapPin,
            description: "See where a parcel has reached",
          },
        ],
      },
      {
        label: "Admin",
        items: [
          {
            title: "Wallets",
            href: "/wallets",
            icon: Wallet,
            description: "Money held by each account",
          },
          {
            title: "Invoices",
            href: "/invoices",
            icon: FileText,
            description: "Bills you raise to accounts",
          },
          {
            title: "Notices",
            href: "/notices",
            icon: Megaphone,
            description: "Messages shown to accounts across the app",
          },
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
  /** Tenant only. BAs manage addresses per-client on the client page, so the
   *  standalone Address Book nav is hidden for them. */
  isBusinessAssociate?: boolean;
  /** Arena only. Money routes are admin-only, so members never see the link.
   *  Hiding the nav item is presentation; the route itself is gated in
   *  proxy.ts and re-checked on the page. See utils/arena-auth.ts. */
  isArenaAdmin?: boolean;
}

// Tenant nav visibility by org classification.
//   - BAs manage addresses per-client, so the org-wide Address Book is hidden.
//   - Standard (non-BA) orgs don't manage their own clients or receive quotes,
//     so those routes are hidden for them. Client Emails is in the same category:
//     they ship for themselves, so there is no third party to decide about, and
//     the route itself redirects them away.
const BA_HIDDEN_HREFS = new Set(["/addressbook"]);
const STANDARD_HIDDEN_HREFS = new Set([
  "/clients",
  "/quotes",
  "/settings/client-emails",
]);

// Arena nav visibility by role. Anything to do with Arena's own money is for
// admins only, so ops members do not see the link at all.
const ARENA_ADMIN_ONLY_HREFS = new Set(["/wallets"]);

// Shared row geometry. Kept in one place so the nav rows, the org switcher and
// the user button all collapse to the same 40px square on the icon rail and the
// rail reads as a single column of evenly sized targets.
const RAIL_SQUARE =
  "group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center";

// ─────────────────────────────────────────────────────────────────────────────
// Avatars
// ─────────────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 28;

function OrgAvatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
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
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        className="size-7 shrink-0 rounded-md object-cover"
      />
    );
  }

  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
      {initials}
    </div>
  );
}

function UserAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={AVATAR_SIZE}
        height={AVATAR_SIZE}
        className="size-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
      {name[0]?.toUpperCase()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavItemRow
// ─────────────────────────────────────────────────────────────────────────────

function NavItemRow({
  item,
  href,
  isActive,
}: {
  item: NavItem;
  href: string;
  isActive: boolean;
}) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        // Only fires on the collapsed rail (SidebarMenuButton hides it when
        // expanded), where the label is not visible and the icon alone has to
        // carry the meaning.
        tooltip={{
          children: (
            <>
              <span className="font-medium">{item.title}</span>
              <span className="text-background/70">{item.description}</span>
            </>
          ),
          className: "flex-col items-start gap-0.5 px-3 py-2 text-xs",
        }}
        // Active styling goes through the same `data-active:` variant the base
        // cva uses, so tailwind-merge drops its defaults outright rather than
        // leaving two rules to fight in the cascade. Setting these from a JS
        // conditional instead would leave the cva's own active colours in the
        // class list, and they land later in the stylesheet.
        className={cn(
          "h-9 gap-3 rounded-md px-2.5 text-sm transition-colors",
          "[&_svg]:size-4.5",
          // Resting
          "text-sidebar-foreground/75 [&_svg]:text-sidebar-foreground/50",
          "hover:bg-sidebar-foreground/6 hover:text-sidebar-foreground hover:[&_svg]:text-sidebar-foreground/80",
          // Current page
          "data-active:bg-sidebar-primary data-active:font-medium data-active:text-sidebar-primary-foreground data-active:shadow-sm",
          "data-active:[&_svg]:text-sidebar-primary-foreground",
          // Hold the pill on hover rather than letting the resting hover win.
          // The icon needs its own rule: the resting `hover:[&_svg]:` selector
          // outranks the plain active one, and would grey the icon out against
          // the dark pill.
          "data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground",
          "data-active:hover:[&_svg]:text-sidebar-primary-foreground",
          RAIL_SQUARE,
        )}
      >
        <Link href={href}>
          <Icon />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {item.title}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrgSwitcher
//
// Clerk's OrganizationSwitcher ships its own trigger, so it is laid invisibly
// on top of our own row and takes the click. The row underneath is what the
// user actually sees.
// ─────────────────────────────────────────────────────────────────────────────

function OrgSwitcherRow() {
  const { state, isMobile } = useSidebar();
  const { organization } = useOrganization();

  const name = organization?.name ?? "Select organisation";
  const members = organization?.membersCount;

  const clerkOverlay = (
    <div className="absolute inset-0 overflow-hidden rounded-md opacity-0">
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
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <SidebarMenuButton
            className={cn(
              "h-12 gap-2.5 rounded-md px-2 transition-colors",
              "border border-sidebar-border bg-sidebar-foreground/3",
              "hover:bg-sidebar-foreground/6",
              RAIL_SQUARE,
              "group-data-[collapsible=icon]:border-transparent",
            )}
          >
            <OrgAvatar name={name} logoUrl={organization?.imageUrl} />
            <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                {name}
              </p>
              {members != null && (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
                  {members} {members === 1 ? "member" : "members"}
                </p>
              )}
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
          {clerkOverlay}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        className="flex-col items-start gap-0.5 px-3 py-2 text-xs"
      >
        <span className="font-medium">{name}</span>
        <span className="text-background/70">Switch to another organisation</span>
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppSidebar
// ─────────────────────────────────────────────────────────────────────────────

export function AppSidebar({
  variant,
  basePath,
  isBusinessAssociate,
  isArenaAdmin = false,
}: AppSidebarProps) {
  const { subtitle, sections: allSections } = NAV_CONFIGS[variant];

  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const { organization } = useOrganization();
  const { user } = useUser();

  // Org classification drives which tenant routes are visible. The server prop
  // (derived from the DB, the source of truth) is authoritative; the public
  // metadata mirror is a fallback for the rare case the prop is unavailable, so
  // stale metadata can never hide/show the wrong routes.
  const metadataOrgType = coerceOrgType(organization?.publicMetadata?.orgType);
  const isBA = isBusinessAssociate ?? isBusinessAssociateType(metadataOrgType);

  // Backfill the Clerk metadata mirror once for orgs created before it existed.
  // Guarded by a ref so it fires at most once per mount: the Clerk client won't
  // reflect the freshly written metadata until it refetches the org, so without
  // the guard this could re-fire on every render until then. Best-effort — the
  // server action swallows failures, and a missed backfill self-heals on the
  // next server-side resolveOrgType.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (variant !== "tenant") return;
    if (!organization) return; // wait until Clerk has loaded the active org
    if (metadataOrgType) return; // already populated — nothing to do
    if (backfilledRef.current) return;
    backfilledRef.current = true;
    void ensureOrgTypeMetadata();
  }, [variant, organization, metadataOrgType]);

  // Filter nav down to what this viewer is allowed: tenant items by org
  // classification, arena items by role. Sections that end up empty are dropped
  // so no stray heading is left behind with nothing under it.
  const sections = useMemo(() => {
    const filtered =
      variant === "tenant"
        ? allSections.map((s) => ({
            ...s,
            items: s.items.filter((i) =>
              isBA
                ? !BA_HIDDEN_HREFS.has(i.href)
                : !STANDARD_HIDDEN_HREFS.has(i.href),
            ),
          }))
        : allSections.map((s) => ({
            ...s,
            items: s.items.filter(
              (i) => isArenaAdmin || !ARENA_ADMIN_ONLY_HREFS.has(i.href),
            ),
          }));

    return filtered.filter((s) => s.items.length > 0);
  }, [variant, allSections, isBA, isArenaAdmin]);

  // openUserProfile / openOrganizationProfile mount Clerk's own modal UI —
  // that's what makes the "Clerk popup" actually appear, as opposed to
  // router.push-ing to an app route that may not exist.
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();

  // "Settings" maps to the org profile modal (members, roles, domains) since
  // it pairs naturally with the org switcher above. If there's no active
  // org yet (e.g. mid-onboarding), fall back to the user profile instead of
  // calling openOrganizationProfile with nothing to operate on.
  const handleOpenSettings = () => {
    if (organization) {
      openOrganizationProfile();
    } else {
      openUserProfile();
    }
  };

  const handleOpenProfile = () => {
    openUserProfile();
  };

  // Resolve full href by prepending basePath to relative hrefs
  // e.g. basePath="/arena-dashboard", href="/clients" → "/arena-dashboard/clients"
  // e.g. href="/" → basePath itself (the index route)
  const resolveHref = (href: string) => {
    if (href === "/") return basePath;
    // Avoid a double slash when basePath is the app root
    if (basePath === "/") return href;
    return `${basePath}${href}`;
  };

  // Exactly one row is ever active: the longest nav href that the current path
  // sits on or under. Matching on a plain startsWith would light up two rows at
  // once wherever one nav route nests inside another, and comparing on segment
  // boundaries keeps "/rates" from claiming "/rate-cards".
  const activeHref = useMemo(() => {
    let best: string | null = null;
    let bestLength = -1;

    for (const section of sections) {
      for (const item of section.items) {
        const full = resolveHref(item.href);
        const onRoute = pathname === full || pathname.startsWith(`${full}/`);
        if (onRoute && full.length > bestLength) {
          best = item.href;
          bestLength = full.length;
        }
      }
    }

    return best;
    // resolveHref is a pure function of basePath, which is in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, pathname, basePath]);

  const displayName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ??
    "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatarUrl = user?.imageUrl;

  const accountMenu = (
    <>
      <DropdownMenuLabel className="font-normal">
        <div className="flex items-center gap-2.5">
          <UserAvatar name={displayName} avatarUrl={avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleOpenSettings}>
        <Settings className="mr-2 size-4" />
        Settings
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handleOpenProfile}>
        <User className="mr-2 size-4" />
        Profile
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onClick={() => signOut({ redirectUrl: "/sign-in" })}
      >
        <LogOut className="mr-2 size-4" />
        Sign out
      </DropdownMenuItem>
    </>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* ── Header ──────────────────────────────────────────────────────────
          The brand row is fixed at h-14 so it lines up exactly with the page
          header bar to its right. */}
      <SidebarHeader className="gap-0 p-0">
        <Link
          href={basePath}
          className={cn(
            "flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3 transition-colors",
            "hover:bg-sidebar-foreground/4",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          <Image
            src="/arena_logo.png"
            alt="Arena Cargo"
            width={32}
            height={32}
            priority
            className="size-8 shrink-0 rounded-md object-contain"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground">
              Arena Cargo
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
              {subtitle}
            </p>
          </div>
        </Link>

        <div className="p-2 group-data-[collapsible=icon]:px-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <OrgSwitcherRow />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>

      {/* ── Content ─────────────────────────────────────────────────────────
          px-3 on the rail centres the 40px rows inside the 64px column. */}
      <SidebarContent className="gap-0 px-2 pb-3 group-data-[collapsible=icon]:px-3">
        {sections.map((section, index) => (
          <Fragment key={section.label}>
            {/* The rail has no group headings, so a hairline is what keeps the
                groups readable there. Expanded, the headings do that job. */}
            {index > 0 && (
              <div
                aria-hidden
                className="mx-1 my-2 hidden h-px bg-sidebar-border group-data-[collapsible=icon]:block"
              />
            )}

            <SidebarGroup
              className={cn(
                "p-0",
                index > 0 && "mt-4 group-data-[collapsible=icon]:mt-0",
              )}
            >
              <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45 group-data-[collapsible=icon]:-mt-7">
                {section.label}
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {section.items.map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      href={resolveHref(item.href)}
                      isActive={item.href === activeHref}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Fragment>
        ))}
      </SidebarContent>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:px-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  aria-label={`Account menu for ${displayName}`}
                  className={cn(
                    "h-12 gap-2.5 rounded-md px-2 transition-colors",
                    "hover:bg-sidebar-foreground/6",
                    "data-open:bg-sidebar-foreground/6",
                    RAIL_SQUARE,
                  )}
                >
                  <UserAvatar name={displayName} avatarUrl={avatarUrl} />
                  <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
                      {email}
                    </p>
                  </div>
                  <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                className="w-56"
              >
                {accountMenu}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Drag/click the edge to collapse. Gives the sidebar a toggle that is
          reachable without going back up to the header button. Desktop only:
          in the mobile sheet there is no rail to grab, and the element would
          otherwise sit at the bottom of the panel as an invisible hit area. */}
      {!isMobile && <SidebarRail />}
    </Sidebar>
  );
}
