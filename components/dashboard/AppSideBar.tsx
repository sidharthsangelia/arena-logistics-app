"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
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
  Calculator,
  Globe,
  ReceiptIndianRupee,
  PackagePlus,
  MapPin,
  Package,
  Settings,
  TableProperties,
  Plane,
  Truck,
  Users,
  ChevronsUpDown,
  User,
  LogOut,
  Handshake,
  Wallet,
  Megaphone,
  FolderOpen,
  BookUser,
  LifeBuoy,
} from "lucide-react";

import { useHelpUnread } from "@/components/help/HelpUnread";

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

export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  /** Plain-language line shown under the title in the collapsed-rail tooltip.
   *  Written for someone who has not used the app before. */
  description: string;
}

export interface NavSection {
  /** Stable React key. Also what an unlabelled section is identified by. */
  id: string;
  /** Heading shown above the group when expanded. Omitted for the top section,
   *  which holds the single dashboard row and needs no heading to explain it. */
  label?: string;
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

// Both variants use the same four-group shape so the two apps read alike:
//   (no heading)  the one dashboard row
//   Shipping      the daily flow: quote, book, track, look up
//   Clients       who the work is for
//   Library       saved records you reuse rather than act on
//   Account/Admin money and configuration
//
// Groups are kept to five rows or fewer. A group that grows past that is the
// signal to split it, not to append.
const NAV_CONFIGS: Record<string, NavConfig> = {
  tenant: {
    subtitle: "Freight Operations",
    sections: [
      {
        id: "home",
        items: [
          {
            title: "Dashboard",
            href: "/",
            icon: LayoutDashboard,
            description: "Your shipping activity at a glance",
          },
        ],
      },
      {
        id: "shipping",
        label: "Shipping",
        items: [
          {
            title: "International Rates",
            href: "/rates",
            icon: Globe,
            description: "Check prices for parcels going abroad",
          },
          {
            title: "Domestic Rates",
            href: "/domestic-rates",
            icon: Calculator,
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
        id: "clients",
        label: "Clients",
        items: [
          {
            title: "Clients",
            href: "/clients",
            icon: Building2,
            description: "Companies you ship on behalf of",
          },
          {
            title: "Quotes",
            href: "/quotes",
            icon: FileUser,
            description: "Prices you have quoted to your clients",
          },
        ],
      },
      {
        id: "library",
        label: "Library",
        items: [
          {
            title: "Address Book",
            href: "/addressbook",
            icon: BookUser,
            description: "Saved pickup and delivery addresses",
          },
          {
            title: "Document Vault",
            href: "/document-vault",
            icon: FolderOpen,
            description: "All your shipping paperwork in one place",
          },
        ],
      },
      {
        id: "account",
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
            icon: ReceiptIndianRupee,
            description: "Bills Arena has raised to you",
          },
          {
            title: "Settings",
            href: "/settings",
            icon: Settings,
            description: "Your details, documents and client emails",
          },
        ],
      },
    ],
  },

  arena: {
    subtitle: "Internal Ops",
    sections: [
      {
        id: "home",
        items: [
          {
            title: "Overview",
            href: "/",
            icon: LayoutDashboard,
            description: "Today's activity across every account",
          },
        ],
      },
      {
        id: "shipping",
        label: "Shipping",
        items: [
          // "International" and "Domestic" alone read as rate pages next to the
          // two rate rows below, so the queues carry the noun.
          {
            title: "International Bookings",
            href: "/bookings",
            icon: Plane,
            description: "Export shipments waiting to be processed",
          },
          {
            title: "Domestic Bookings",
            href: "/domestic-bookings",
            icon: Truck,
            description: "India to India courier shipments",
          },
          {
            title: "Track Shipment",
            href: "/track",
            icon: MapPin,
            description: "See where a parcel has reached",
          },
          {
            title: "International Rates",
            href: "/rates",
            icon: Globe,
            description: "Check prices for parcels going abroad",
          },
          {
            title: "Domestic Rates",
            href: "/domestic-rates",
            icon: Calculator,
            description: "Check prices for parcels inside India",
          },
        ],
      },
      {
        id: "clients",
        label: "Customers",
        items: [
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
            title: "Clients",
            href: "/clients",
            icon: Users,
            description: "Customers that business associates book for",
          },
          {
            title: "Quotes",
            href: "/quotes",
            icon: FileUser,
            description: "Quotes raised by every account",
          },
        ],
      },
      {
        id: "library",
        label: "Library",
        items: [
          {
            title: "Document Vault",
            href: "/document-vault",
            icon: FolderOpen,
            description: "Shipping paperwork uploaded by accounts",
          },
          {
            title: "Rate Sweeps",
            href: "/rate-sweeps",
            icon: TableProperties,
            description: "The stored rate grid and how fresh it is",
          },
        ],
      },
      {
        id: "admin",
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
            icon: ReceiptIndianRupee,
            description: "Bills you raise to accounts",
          },
          {
            // Its own row rather than a link buried on the invoices page: this
            // is the address book behind every invoice raised by hand, and a
            // wrong GSTIN on it is a wrong GSTIN on every future document.
            title: "Billing Customers",
            href: "/invoices/customers",
            icon: BookUser,
            description: "Everyone you raise invoices to",
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
  /** Newest What's new release this viewer has entries in. Drives the unread
   *  dot on Help & Docs. Computed server-side so no changelog text ships. */
  latestHelpVersion?: string | null;
}

// Tenant nav visibility by org classification.
//   - BAs manage addresses per-client, so the org-wide Address Book is hidden
//     and the Library group is left holding the Document Vault alone.
//   - Standard (non-BA) orgs don't manage their own clients or receive quotes,
//     so those routes are hidden for them. That empties the Clients group
//     outright, and the empty-group filter below drops its heading with it.
//
// Client emails used to be listed here as its own route. It is now a tab inside
// Settings, hidden by the page itself for standard orgs, so there is nothing for
// the nav to gate: everyone gets one Settings link.
const BA_HIDDEN_HREFS = new Set(["/addressbook"]);
const STANDARD_HIDDEN_HREFS = new Set(["/clients", "/quotes"]);

// Arena nav visibility by role. Anything to do with Arena's own money is for
// admins only, so ops members do not see the link at all.
const ARENA_ADMIN_ONLY_HREFS = new Set(["/wallets"]);

/**
 * The nav sections this viewer may see. Shared with the Cmd+K palette, which
 * offers exactly the pages the sidebar does, so the two can never disagree
 * about what someone is allowed to open. Sections left empty are dropped.
 */
export function visibleNavSections(
  variant: keyof typeof NAV_CONFIGS,
  { isBA, isArenaAdmin }: { isBA: boolean; isArenaAdmin: boolean },
): NavSection[] {
  const filtered = NAV_CONFIGS[variant].sections.map((s) => ({
    ...s,
    items: s.items.filter((i) =>
      variant === "tenant"
        ? isBA
          ? !BA_HIDDEN_HREFS.has(i.href)
          : !STANDARD_HIDDEN_HREFS.has(i.href)
        : isArenaAdmin || !ARENA_ADMIN_ONLY_HREFS.has(i.href),
    ),
  }));
  return filtered.filter((s) => s.items.length > 0);
}

/** "/clients" under "/arena-dashboard" → "/arena-dashboard/clients"; "/" → the base itself. */
export function resolveNavHref(basePath: string, href: string): string {
  if (href === "/") return basePath;
  if (basePath === "/") return href;
  return `${basePath}${href}`;
}

// ── Rail geometry ───────────────────────────────────────────────────────────
// Collapsing should look like the sidebar sliding shut over a fixed column of
// icons, not a re-layout. So nothing is re-centred or re-padded on the rail:
// every icon, avatar and the logo already sit on the rail's centre line (32px
// from the left edge) when expanded, and collapsing only narrows each row to a
// 40px target while the labels fade. The sums, with the 12px side gutter:
//   nav row   12 + 11 pad + 18 icon/2           = 32
//   avatars   12 + 1 border + 5 pad + 28/2      = 32  (org row)
//             12 + 6 pad + 28/2                 = 32  (account row)
//   logo      16 pad + 32/2                     = 32
// Change one of those numbers and its partner has to move with it.

// Every curve below is the sidebar's own width change in ui/sidebar.tsx
// (300ms, cubic-bezier(0.32,0.72,0,1)). Written out in full each time because
// Tailwind only generates classes it can read literally in the source.

/** Rows narrow in step with the sidebar; hover colours stay quick. */
const ROW_MOTION =
  "[transition:width_300ms_cubic-bezier(0.32,0.72,0,1),height_300ms_cubic-bezier(0.32,0.72,0,1),background-color_150ms,color_150ms] motion-reduce:transition-none";

/** Labels and secondary text fade rather than vanish in one frame. */
const RAIL_FADE =
  "transition-opacity duration-200 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0";

/** Vertical spacing that changes between states animates on the same curve. */
const RAIL_SPACING =
  "transition-[margin,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

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
  indicator,
}: {
  item: NavItem;
  href: string;
  isActive: boolean;
  /** Absolutely positioned extra, e.g. an unread dot. Never affects layout. */
  indicator?: React.ReactNode;
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
          "h-9 w-full gap-3 rounded-md px-[11px] text-sm",
          "group-data-[collapsible=icon]:w-10",
          ROW_MOTION,
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
        )}
      >
        <Link href={href} className={indicator ? "relative" : undefined}>
          <Icon />
          <span className={cn("truncate", RAIL_FADE)}>{item.title}</span>
          {indicator}
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
              "h-12 w-full gap-2.5 rounded-md px-[5px]",
              "group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10",
              ROW_MOTION,
              "border border-sidebar-border bg-sidebar-foreground/3",
              "hover:bg-sidebar-foreground/6",
              "group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent",
            )}
          >
            <OrgAvatar name={name} logoUrl={organization?.imageUrl} />
            <div className={cn("min-w-0 flex-1 text-left", RAIL_FADE)}>
              <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                {name}
              </p>
              {members != null && (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
                  {members} {members === 1 ? "member" : "members"}
                </p>
              )}
            </div>
            <ChevronsUpDown className={cn("size-4 shrink-0 text-sidebar-foreground/40", RAIL_FADE)} />
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
  latestHelpVersion = null,
}: AppSidebarProps) {
  const { subtitle } = NAV_CONFIGS[variant];

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
  const sections = useMemo(
    () => visibleNavSections(variant, { isBA, isArenaAdmin }),
    [variant, isBA, isArenaAdmin],
  );

  const helpHref = resolveNavHref(basePath, "/help");
  const helpActive = pathname === helpHref || pathname.startsWith(`${helpHref}/`);
  const helpUnread = useHelpUnread(latestHelpVersion);

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
  // Memoised so the activeHref calculation below can depend on it honestly.
  // It was previously an inline function, which the memo could not list without
  // recomputing every render — hence the suppression. It is a pure function of
  // basePath, so a useCallback makes that true in the dependency graph too.
  const resolveHref = useCallback(
    (href: string) => resolveNavHref(basePath, href),
    [basePath],
  );

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
  }, [sections, pathname, resolveHref]);

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
            "flex h-14 shrink-0 items-center gap-2.5 overflow-hidden border-b border-sidebar-border px-4 transition-colors",
            "hover:bg-sidebar-foreground/4",
          )}
        >
          {/* The emblem alone, cut from the full wordmark (public/arena_logo.png)
              on a transparent background. The wordmark itself is a wide banner
              on a black starfield and shrank to an unreadable smudge here. */}
          <Image
            src="/arena_mark.png"
            alt="Arena Cargo"
            width={32}
            height={32}
            priority
            className="size-8 shrink-0 object-contain"
          />
          <div className={cn("min-w-0", RAIL_FADE)}>
            <p className="truncate text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground">
              Arena Cargo
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
              {subtitle}
            </p>
          </div>
        </Link>

        <div className="px-3 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <OrgSwitcherRow />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>

      {/* ── Content ─────────────────────────────────────────────────────────
          The same 12px gutter in both states, so the icon column never moves
          (see Rail geometry above). */}
      <SidebarContent className="gap-0 px-3 pb-3">
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {/* The rail has no group headings, so a hairline is what keeps the
                groups readable there. Expanded, the headings do that job. It is
                always rendered and only grows in, so the swap with the heading
                animates instead of jumping. */}
            {index > 0 && (
              <div
                aria-hidden
                className={cn(
                  "mx-2 my-0 h-px bg-sidebar-border opacity-0",
                  "group-data-[collapsible=icon]:my-2 group-data-[collapsible=icon]:opacity-100",
                  RAIL_SPACING,
                )}
              />
            )}

            <SidebarGroup
              className={cn(
                "p-0",
                // Four gaps now sit between five groups, so the run is kept
                // tighter than it was at three: the whole list still has to
                // clear the footer on a laptop viewport without scrolling.
                index > 0 && "mt-3 group-data-[collapsible=icon]:mt-0",
                RAIL_SPACING,
              )}
            >
              {/* The first section is the lone dashboard row. A heading over a
                  single self-explanatory link is noise, so it goes without. */}
              {section.label && (
                <SidebarGroupLabel
                  className={cn(
                    "h-7 whitespace-nowrap px-[11px] text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45 group-data-[collapsible=icon]:-mt-7",
                    RAIL_SPACING,
                  )}
                >
                  {section.label}
                </SidebarGroupLabel>
              )}

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
      <SidebarFooter className="border-t border-sidebar-border px-3 py-2">
        {/* Help sits above the account row rather than in a nav group: it is
            about the app, not a part of it. The unread dot is absolutely
            placed so it appearing after hydration never moves the row. */}
        <SidebarMenu className="gap-0.5">
          <NavItemRow
            item={{
              title: "Help & Docs",
              href: "/help",
              icon: LifeBuoy,
              description: helpUnread
                ? "Guides, search and something new in What's new"
                : "Guides for everything you can do here",
            }}
            href={helpHref}
            isActive={helpActive}
            indicator={
              helpUnread ? (
                <span
                  aria-label="New updates"
                  className="absolute right-2.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary group-data-[collapsible=icon]:right-1.5 group-data-[collapsible=icon]:top-1.5 group-data-[collapsible=icon]:translate-y-0"
                />
              ) : null
            }
          />
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  aria-label={`Account menu for ${displayName}`}
                  className={cn(
                    "h-12 w-full gap-2.5 rounded-md px-1.5",
                    "group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10",
                    ROW_MOTION,
                    "hover:bg-sidebar-foreground/6",
                    "data-open:bg-sidebar-foreground/6",
                  )}
                >
                  <UserAvatar name={displayName} avatarUrl={avatarUrl} />
                  <div className={cn("min-w-0 flex-1 text-left", RAIL_FADE)}>
                    <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] leading-tight text-sidebar-foreground/55">
                      {email}
                    </p>
                  </div>
                  <ChevronsUpDown className={cn("size-4 shrink-0 text-sidebar-foreground/40", RAIL_FADE)} />
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
