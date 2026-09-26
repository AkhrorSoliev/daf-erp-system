"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One closed-by-default block under the months table ("Batafsil"). The
 * statement leads with the answer; everything that explains it in depth
 * waits here until someone asks.
 */
export function StatementSection({
  title,
  count,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  title: string;
  count?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        {title}
        {count !== undefined && count > 0 && (
          <span className="font-normal text-muted-foreground">({count})</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
