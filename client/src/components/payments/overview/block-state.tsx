"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A block's place while its request runs. */
export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-36 rounded-xl", className)} />;
}

/** A block whose request failed: its title, what happened and a retry. The rest of the page stays. */
export function BlockError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}
