"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PaymentReportCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change: number;
  valueColor?: string;
  tooltip?: string;
  onClick?: () => void;
}

export function PaymentReportCard({
  icon: Icon,
  label,
  value,
  change,
  valueColor,
  tooltip,
  onClick,
}: PaymentReportCardProps) {
  const isUp = change > 0;
  const isDown = change < 0;
  const changeColor = isUp
    ? "text-green-600 dark:text-green-400"
    : isDown
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const cardContent = (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-xl border bg-card p-5 text-left transition-all hover:shadow-md hover:border-primary/30 cursor-pointer w-full h-full"
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className="size-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold leading-tight", valueColor)}>
        {value}
      </p>
      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <TrendIcon className={cn("size-4 shrink-0", changeColor)} />
        <span className={cn("text-sm font-medium", changeColor)}>
          {isUp ? "+" : ""}
          {change}%
        </span>
        <span className="text-xs text-muted-foreground">
          o&apos;tgan oyga nisbatan
        </span>
      </div>
    </button>
  );

  if (!tooltip) return cardContent;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
