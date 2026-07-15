"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// Lumio bottom sheet — shadcn Sheet (auto-themed via the `.lumio` remap) with a
// rounded top edge and a grab handle. Content scrolls internally when tall.
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "lumio mx-auto max-h-[85dvh] gap-0 rounded-t-[28px] border-line bg-surface p-0 sm:max-w-[560px]",
          className,
        )}
      >
        <span
          aria-hidden
          className="mx-auto mt-3 h-1.5 w-11 shrink-0 rounded-full bg-line-strong"
        />
        {title ? (
          <SheetHeader className="px-5 pb-1 pt-3">
            <SheetTitle className="font-display text-xl font-extrabold text-ink-900">
              {title}
            </SheetTitle>
          </SheetHeader>
        ) : null}
        <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
