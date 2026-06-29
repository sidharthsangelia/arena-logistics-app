import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">404 Error</p>

            <h1 className="text-3xl font-bold tracking-tight">
              Page not found
            </h1>

            <p className="text-sm text-muted-foreground">
              The page you're looking for doesn't exist or may have been moved.
            </p>
          </div>

          <div className="flex gap-3">
            <Button asChild variant="default">
              <Link href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}