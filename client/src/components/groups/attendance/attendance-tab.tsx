"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { AttendanceCycleDashboard } from "./attendance-cycle-dashboard";
import { AttendanceForm } from "./attendance-form";
import type { GroupData } from "@/hooks/use-edit-group";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

const STATUS_LABELS: Record<string, string> = {
  FORMING: msg("Shakllanmoqda"),
  PAUSED: msg("To'xtatilgan"),
  COMPLETED: msg("Tugallangan"),
  CANCELLED: msg("Bekor qilingan"),
  ARCHIVED: msg("Arxivlangan"),
};

/** Set when this tab pushed the form's history entry, so «orqaga» can pop it. */
const PUSHED_KEY = "attendance-form-pushed";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AttendanceTabProps {
  group: GroupData;
}

/**
 * The calendar and, when a date is picked, the register for that date. The
 * picked date lives in the URL (`?sana=`), so the browser's, the phone's and
 * Telegram's «orqaga» step from the register back to the calendar instead of
 * leaving the group, and a reload keeps the place.
 */
export function AttendanceTab({ group }: AttendanceTabProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawDate = searchParams.get("sana");
  const selectedDate = rawDate && DATE_RE.test(rawDate) ? rawDate : null;

  const urlWith = useCallback(
    (date: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (date) params.set("sana", date);
      else params.delete("sana");
      const qs = params.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [pathname, searchParams],
  );

  const handleDateSelect = (date: string) => {
    try {
      sessionStorage.setItem(PUSHED_KEY, date);
    } catch {
      // No storage: «orqaga» then replaces the entry, which is still correct.
    }
    router.push(urlWith(date), { scroll: false });
  };

  const handleBack = useCallback(() => {
    let pushedHere = false;
    try {
      pushedHere = sessionStorage.getItem(PUSHED_KEY) === selectedDate;
      sessionStorage.removeItem(PUSHED_KEY);
    } catch {
      pushedHere = false;
    }
    // Pop our own entry when we made it; a form opened by a link has none.
    if (pushedHere) router.back();
    else router.replace(urlWith(null), { scroll: false });
  }, [router, urlWith, selectedDate]);

  // Guruh faol bo'lmasa davomat olish mumkin emas
  if (group.statusEnum !== "ACTIVE") {
    const label = STATUS_LABELS[group.statusEnum];
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
        <Info className="size-4 shrink-0" />
        {t("Guruh faol emas ({status}). Davomat olish mumkin emas.", {
          status: label ? t(label) : group.statusEnum,
        })}
      </div>
    );
  }

  if (selectedDate) {
    return (
      <AttendanceForm
        group={group}
        date={selectedDate}
        onBack={handleBack}
        onSaved={handleBack}
      />
    );
  }

  return (
    <AttendanceCycleDashboard
      group={group}
      onSelectDate={handleDateSelect}
    />
  );
}
