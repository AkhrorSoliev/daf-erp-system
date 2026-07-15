import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return chars.join("") || "?";
}

// Round avatar — photo when available, else coral initials on brand tint.
export function Avatar({ src, name, size = 48, className }: AvatarProps) {
  const style = { width: size, height: size } as React.CSSProperties;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "avatar"}
        style={style}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={style}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-coral-500 font-display font-extrabold text-white",
        className,
      )}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
    </span>
  );
}
