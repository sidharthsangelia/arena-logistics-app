import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Settings reads nothing from the database, so this only covers the route chunk
 * arriving, and it also stops the (tenant) dashboard fallback from standing in
 * for this route.
 *
 * Every heading, card title and field label on this screen is static copy, so it
 * is rendered for real. Only the input boxes — the one place a value lands — are
 * skeletons.
 */
export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and preferences.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Profile</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" />
            <Field label="Email" />
          </div>
          <Field label="Company Name" />
          <Skeleton className="mt-2 h-9 w-32 rounded-md" />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Carrier API Keys</CardTitle>
          <CardDescription>
            Credentials used to fetch live rates from carriers
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 space-y-4">
          <Field label="Aramex API Key" />
          <Field label="Skart API Key" />
          <p className="text-xs text-muted-foreground">
            Keys are stored server-side as environment variables.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label }: { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
