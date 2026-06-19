"use client";

export default function Error({
  error,
}: {
  error: Error;
}) {
  return (
    <div className="rounded-lg border p-6">
      <h2 className="font-semibold">
        Failed to load clients
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        {error.message}
      </p>
    </div>
  );
}