import { Settings } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your account and preferences.
        </p>
      </div>

      {/* Profile */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Profile</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" defaultValue="Admin" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="arena@cargo.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company">Company Name</Label>
            <Input id="company" defaultValue="Arena Cargo And Logistics" />
          </div>
          <Button disabled className="mt-2">
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Carrier API Keys</CardTitle>
          <CardDescription>
            Credentials used to fetch live rates from carriers
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aramex-key">Aramex API Key</Label>
            <Input id="aramex-key" type="password" placeholder="••••••••••••••••" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skart-key">Skart API Key</Label>
            <Input id="skart-key" type="password" placeholder="••••••••••••••••" />
          </div>
          <p className="text-xs text-slate-400">
            Keys are stored server-side as environment variables.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}