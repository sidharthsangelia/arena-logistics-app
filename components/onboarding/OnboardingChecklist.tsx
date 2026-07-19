import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  MapPin,
  ShieldCheck,
  Wallet,
  BookMarked,
  Users,
  ArrowRight,
} from "lucide-react";

import { prisma } from "@/utils/db";
import { isOrgAddressComplete, getOrgKycBaselineStatus } from "@/lib/booking/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Org = {
  id: string;
  isBusinessAssociate: boolean;
  skipPayment: boolean;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
};

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  done: boolean;
}

/**
 * OnboardingChecklist — a dashboard nudge that guides a new org through the
 * few things that make booking fast: profile address, baseline KYC, wallet
 * balance, a saved address, and (for BAs) a first client. Nothing here gates
 * anything — it simply disappears once every applicable item is done.
 */
export async function OnboardingChecklist({ org }: { org: Org }) {
  const [kyc, savedAddressCount, clientCount, wallet] = await Promise.all([
    getOrgKycBaselineStatus(org.id),
    // BAs keep addresses per client (no org-wide book), so count those instead.
    org.isBusinessAssociate
      ? prisma.address.count({ where: { deletedAt: null, client: { orgId: org.id } } })
      : prisma.address.count({ where: { orgId: org.id, deletedAt: null } }),
    org.isBusinessAssociate
      ? prisma.client.count({ where: { orgId: org.id, deletedAt: null } })
      : Promise.resolve(0),
    org.skipPayment
      ? Promise.resolve(null)
      : prisma.wallet.findUnique({
          where: { orgId: org.id },
          select: { balance: true },
        }),
  ]);

  const items: ChecklistItem[] = [
    {
      key: "address",
      label: "Add your contact & address details",
      description: "Used to pre-fill the sender on every booking.",
      href: "/settings/profile",
      icon: MapPin,
      done: isOrgAddressComplete(org),
    },
    {
      key: "kyc",
      label: "Upload identity documents",
      description: "PAN and Aadhaar, reused automatically on future bookings.",
      href: "/document-vault",
      icon: ShieldCheck,
      done: kyc.complete,
    },
    {
      key: "address-book",
      label: org.isBusinessAssociate
        ? "Save an address for a client"
        : "Save a delivery or pickup address",
      description: org.isBusinessAssociate
        ? "Optional. Keep each client's addresses handy for faster booking."
        : "Optional. Keep frequent addresses handy for faster booking.",
      href: org.isBusinessAssociate ? "/clients" : "/book",
      icon: BookMarked,
      done: savedAddressCount > 0,
    },
  ];

  // Wallet — only for pay-up-front orgs (deferred/skipPayment orgs never top up).
  if (!org.skipPayment) {
    items.push({
      key: "wallet",
      label: "Add wallet balance",
      description: "Top up so you can confirm bookings without interruption.",
      href: "/wallet",
      icon: Wallet,
      done: wallet != null && Number(wallet.balance) > 0,
    });
  }

  // First client — Business Associates only.
  if (org.isBusinessAssociate) {
    items.push({
      key: "client",
      label: "Add your first client",
      description: "Book on behalf of the clients you bring in.",
      href: "/clients",
      icon: Users,
      done: clientCount > 0,
    });
  }

  const doneCount = items.filter((i) => i.done).length;

  // Everything applicable is done → the nudge has served its purpose.
  if (doneCount === items.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Finish setting up</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A few quick steps to make booking effortless.
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          {doneCount} / {items.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
              item.done
                ? "border-transparent bg-muted/40"
                : "hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            {item.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            {!item.done && (
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
