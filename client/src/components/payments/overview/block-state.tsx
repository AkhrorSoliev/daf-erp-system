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
      <p role="alert" className="text-sm text-muted-foreground">
        Ma&apos;lumotni yuklab bo&apos;lmadi
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

/** One labelled figure inside a card: «avans berilgan … so'm». */
export function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
