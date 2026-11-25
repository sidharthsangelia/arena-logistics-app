import Link from "next/link";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
            <p className="text-sm text-muted-foreground">
              This page does not exist or has moved. Check the link, or head back to
              your dashboard.
            </p>
          </div>

          {/* "/" lands each user on their own dashboard: the proxy sends Arena
              staff on to /arena-dashboard. */}
          <Button asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
