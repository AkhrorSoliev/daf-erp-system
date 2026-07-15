import * as React from "react";
import { cn } from "@/lib/utils";
import { TILE_TONE, type LumioTone } from "./tones";

const SIZE = {
  sm: "size-9 rounded-md text-lg",
  md: "size-10 rounded-md text-xl",
  lg: "size-12 rounded-card text-2xl",
};

export interface IconTileProps {
  icon: React.ReactNode;
  tone?: LumioTone;
  size?: keyof typeof SIZE;
  className?: string;
}

// Soft tinted rounded square holding a Phosphor glyph — the leading marker on
// list rows and stat blocks.
export function IconTile({
  icon,
  tone = "grape",
  size = "md",
  className,
}: IconTileProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        SIZE[size],
        TILE_TONE[tone],
        className,
      )}
    >
      {icon}
    </span>
  );
}
