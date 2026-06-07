// components/onboarding/OnboardingForm.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
 
import { useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { checkSlugAvailability, createOrgAction } from "@/actions/onboarding/onboarding.action";

export function OnboardingForm() {
  const router = useRouter();
  const { setActive } = useOrganizationList();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const debouncedSlug = useDebounce(slug, 400);

  // Auto-generate slug from company name
  function handleNameChange(value: string) {
    setName(value);
    if (!slugManuallyEdited) {
      const generated = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 32);
      setSlug(generated);
    }
  }

  // Check slug availability when debounced value changes
  useEffect(() => {
    if (!debouncedSlug || debouncedSlug.length < 2) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    checkSlugAvailability(debouncedSlug).then(({ available }) => {
      setSlugStatus(available ? "available" : "taken");
    });
  }, [debouncedSlug]);

function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);

  startTransition(async () => {
    try {
      const result = await createOrgAction({ name, slug });

      if (!result.success) {
        setError(result.message);
        return;
      }

      // Immediately switch the user's active organization
      if (setActive && result.organizationId) {
        await setActive({
          organization: result.organizationId,
        });
      }

      router.push(result.redirectUrl);
      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        "Something went wrong while creating your workspace. Please try again."
      );
    }
  });
}

  const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length >= 2;
  const canSubmit =
    name.length >= 2 &&
    slugValid &&
    slugStatus === "available" &&
    !isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Company name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Company name</Label>
        <Input
          id="name"
          placeholder="Acme Logistics Pvt Ltd"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={isPending}
          required
        />
      </div>

      {/* Workspace slug */}
      <div className="space-y-1.5">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex items-center gap-0 rounded-md border focus-within:ring-2 focus-within:ring-ring overflow-hidden">
          <span className="bg-muted px-3 py-2 text-sm text-muted-foreground border-r select-none">
            univendor.com/
          </span>
          <div className="relative flex-1">
            <Input
              id="slug"
              className="border-0 rounded-none focus-visible:ring-0 pr-8"
              placeholder="acme-logistics"
              value={slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 32)
                );
              }}
              disabled={isPending}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {slugStatus === "checking" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {slugStatus === "available" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {slugStatus === "taken" && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {slugStatus === "taken"
            ? "This slug is already taken. Try another."
            : "Lowercase letters, numbers, and hyphens only."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating workspace...
          </>
        ) : (
          "Create workspace"
        )}
      </Button>
    </form>
  );
}