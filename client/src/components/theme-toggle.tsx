"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

const themeOrder = ["light", "dark", "system"] as const;

const themeIcon: Record<string, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const themeLabel: Record<string, string> = {
  light: msg("Yorug' rejim — qorong'iga o'tish"),
  dark: msg("Qorong'i rejim — tizim rejimiga o'tish"),
  system: msg("Tizim rejimi — yorug'iga o'tish"),
};

export function ThemeToggle() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="size-9 rounded-md bg-muted" />
    );
  }

  const current = theme ?? "system";
  const labelSource = themeLabel[current] ?? themeLabel.system;
  const label = t(labelSource);
  const Icon = themeIcon[current] ?? Monitor;
  const nextTheme =
    themeOrder[(themeOrder.indexOf(current as (typeof themeOrder)[number]) + 1) % themeOrder.length];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setTheme(nextTheme)}
          aria-label={label}
          className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
