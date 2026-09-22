"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDavomiylik, formatKunYorligi } from "./activity-format";
import { davrniUrldanOqi } from "./use-app-activity";
import type { Davr, KunSurati } from "./types";

export function PeriodToggle({ value, onChange }: { value: Davr; onChange: (davr: Davr) => void }) {
  const options: { value: Davr; label: string }[] = [
    { value: 7, label: "7 kun" },
    { value: 30, label: "30 kun" },
  ];
  return (
    <div role="radiogroup" aria-label="Davr" className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-all",
            value === option.value && "bg-background text-foreground shadow",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressLine({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tooltip,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tooltip: string;
  valueClassName?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <div className={cn("mt-3 text-xl font-semibold whitespace-nowrap tabular-nums", valueClassName)}>
            {value}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Bir kunning tooltip matni — `DayBars` va `XaritaBolimi` heatmapida bitta manba.
 * `shugullanganMatni` — markaz sahifasida `shugullangan` = norma bo'yicha faol
 * kun, guruh tabida esa «mashq yoki 5 daqiqa radio»; bir xil so'z ikki ma'noda
 * turmasin.
 */
export function KunTooltipIchi({
  kun,
  shugullanganMatni = "Shug'ullangan kun",
}: {
  kun: KunSurati;
  shugullanganMatni?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{formatKunYorligi(kun.sana)}</span>
      {!kun.kuzatilgan ? (
        <span>Kuzatuv boshlanmagan</span>
      ) : (
        <>
          <span>{kun.shugullangan ? shugullanganMatni : kun.kirdi ? "Faqat kirgan" : "Kirmagan"}</span>
          {kun.savollar > 0 && <span>Savollar: {kun.savollar}</span>}
          {kun.faolSoniya > 0 && <span>Faol: {formatDavomiylik(kun.faolSoniya)}</span>}
          {kun.radioSoniya > 0 && <span>Radio: {formatDavomiylik(kun.radioSoniya)}</span>}
        </>
      )}
    </div>
  );
}

export function DayBars({
  kunlar,
  className,
  shugullanganMatni,
}: {
  kunlar: KunSurati[];
  className?: string;
  shugullanganMatni?: string;
}) {
  const max = Math.max(1800, ...kunlar.map((k) => k.faolSoniya));
  const tor = kunlar.length > 7;
  return (
    <div className={cn("flex h-7 items-stretch", className)}>
      {kunlar.map((kun) => {
        const bor = kun.faolSoniya > 0 || kun.shugullangan;
        return (
          <Tooltip key={kun.sana}>
            <TooltipTrigger asChild>
              <span className={cn("flex items-end", tor ? "px-px" : "px-0.5")}>
                <span
                  className={cn(
                    "rounded-sm",
                    tor ? "w-1" : "w-1.5",
                    !kun.kuzatilgan && "bg-muted/40",
                    kun.kuzatilgan && (kun.shugullangan ? "bg-primary" : kun.kirdi || kun.faolSoniya > 0 ? "bg-primary/35" : "bg-muted"),
                  )}
                  style={{ height: bor ? `${Math.max(18, (kun.faolSoniya / max) * 100)}%` : "12%" }}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <KunTooltipIchi kun={kun} shugullanganMatni={shugullanganMatni} />
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ActivityError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}

/** `?period=` — 7 standart, URL'dan olib tashlanadi (dizayn 7). */
export function usePeriodParam(): [Davr, (d: Davr) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const davr = davrniUrldanOqi(searchParams.get("period"));
  const setDavr = useCallback(
    (d: Davr) => {
      const params = new URLSearchParams(searchParams.toString());
      if (d === 7) params.delete("period");
      else params.set("period", String(d));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );
  return [davr, setDavr];
}
