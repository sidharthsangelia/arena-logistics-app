"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

export default function ClientsSearch() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const value = searchParams.get("q") ?? "";

  return (
    <Input
      placeholder="Search clients..."
      defaultValue={value}
      className="w-[280px]"
      onChange={(e) => {
        const params = new URLSearchParams(
          searchParams.toString(),
        );

        const query = e.target.value;

        if (query) {
          params.set("q", query);
        } else {
          params.delete("q");
        }

        params.delete("page");

        router.replace(`/clients?${params.toString()}`);
      }}
    />
  );
}