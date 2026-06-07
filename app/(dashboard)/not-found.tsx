import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileSearch } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <FileSearch className="h-10 w-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This page doesn't exist or you don't have access to it.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}