"use client";

import { ReactNode } from "react";
import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  tooltip?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Height of the chart body area; defaults to 240px. */
  bodyHeightClass?: string;
}

export function ChartCard({
  title,
  subtitle,
  tooltip,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "Ma'lumot topilmadi",
  headerAction,
  children,
  className,
  bodyHeightClass = "h-[240px]",
}: Props) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-base">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Tushuntirish"
                  className="text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-line">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {headerAction}
      </div>
      <div className={bodyHeightClass}>
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
