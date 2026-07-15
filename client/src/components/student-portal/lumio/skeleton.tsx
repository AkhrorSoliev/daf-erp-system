import * as React from "react";
import { cn } from "@/lib/utils";

// Sunk pulsing placeholder block.
export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-card bg-sunk", className)}
      {...rest}
    />
  );
}

// A few skeleton cards mimicking the home dashboard shape — the default
// page-level loading state (skeletons over spinners, per project rule).
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
