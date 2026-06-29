// app/arena-dashboard/business-associates/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Wallet, Users, FileText, Truck } from "lucide-react";
import { prisma } from "@/utils/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import OrgAvatar from "@/components/business-assoicates/OrgAvatar";
import PlanBadge from "@/components/business-assoicates/PlanBadge";
import RecentQuotesTable from "@/components/business-assoicates/detail-page/RecentQuotesTable";
import RecentClientsTable from "@/components/business-assoicates/detail-page/RecentClientsTable";
import OrgSettingsCard from "@/components/business-assoicates/detail-page/OrgSettingCard";
import StatCard from "@/components/business-assoicates/detail-page/StatCard";
 

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BusinessAssociateDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

  const org = await prisma.org.findFirst({
    where: { id, deletedAt: null },
    include: {
      wallet: true,
      _count: {
        select: {
          clients: true,
          quotes: true,
          shipments: true,
          kycDocuments: true,
        },
      },
    },
  });

  if (!org) {
    notFound();
  }

  const [recentClients, recentQuotes] = await Promise.all([
    prisma.client.findMany({
      where: { orgId: org.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.quote.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const contactDetails = [
    { icon: Mail, label: "Email", value: org.email },
    { icon: Phone, label: "Phone", value: org.phone },
  ].filter((item) => item.value);

  const addressParts = [
    org.addressLine1,
    org.city,
    org.state,
    org.postalCode,
    org.country,
  ].filter(Boolean);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/arena-dashboard/business-associates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Business Associates
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <OrgAvatar name={org.name} logoUrl={org.logoUrl} className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {org.name}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {org.slug}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <PlanBadge plan={org.plan} />
          {org.isBusinessAssociate ? (
            <Badge variant="secondary">Business Associate</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Standard organisation
            </Badge>
          )}
          {org.skipPayment && <Badge variant="outline">Skip Payment</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Users} label="Clients" value={org._count.clients} />
        <StatCard icon={FileText} label="Quotes" value={org._count.quotes} />
        <StatCard icon={Truck} label="Shipments" value={org._count.shipments} />
        <StatCard
          icon={Wallet}
          label="Wallet balance"
          value={`₹${(org.wallet?.balance.toNumber() ?? 0).toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OrgSettingsCard
            orgId={org.id}
            orgName={org.name}
            initialMarkupPercent={org.markupPercent.toNumber()}
            initialIsBusinessAssociate={org.isBusinessAssociate}
            initialSkipPayment={org.skipPayment}
          />

          <RecentQuotesTable quotes={recentQuotes} />

          <RecentClientsTable clients={recentClients} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact details</CardTitle>
              <CardDescription>As provided during onboarding.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {org.contactName && (
                <p className="font-medium">{org.contactName}</p>
              )}
              {contactDetails.length === 0 && addressParts.length === 0 ? (
                <p className="text-muted-foreground">
                  No contact details on file.
                </p>
              ) : (
                <>
                  {contactDetails.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="flex items-start gap-2 text-muted-foreground"
                    >
                      <Icon className="mt-0.5 h-4 w-4" />
                      <span>{value}</span>
                    </div>
                  ))}
                  {addressParts.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4" />
                      <span>{addressParts.join(", ")}</span>
                    </div>
                  )}
                </>
              )}
              {org.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Notes
                    </p>
                    <p className="text-muted-foreground">{org.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Org ID</span>
                <span className="font-mono text-xs">{org.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clerk Org ID</span>
                <span className="font-mono text-xs">{org.clerkOrgId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">KYC documents</span>
                <span>{org._count.kycDocuments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Joined</span>
                <span>{formatDate(org.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last updated</span>
                <span>{formatDate(org.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}