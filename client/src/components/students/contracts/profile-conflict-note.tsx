"use client";

import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import type { ProfileConflict } from "./contract-profile";

interface Props {
  conflict: ProfileConflict;
  /** The admin chose «Yangisi to'g'ri» — the profile is updated on save. */
  chosenNew: boolean;
  onKeepProfile: () => void;
  onUseNew: () => void;
  onUndo: () => void;
}

const show = (c: ProfileConflict) =>
  c.field === "phone" || c.field === "parentPhone" ? formatPhone(c.profileValue) : c.profileValue;

/** Under a customer input that disagrees with the student's profile. */
export function ProfileConflictNote({ conflict, chosenNew, onKeepProfile, onUseNew, onUndo }: Props) {
  const t = useT();
  if (chosenNew) {
    return (
      <p className="flex flex-wrap items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
        <Check className="size-3.5" />
        {t("Saqlashda profil yangilanadi (profilda: {value}).", { value: show(conflict) })}
        <button type="button" className="underline underline-offset-2" onClick={onUndo}>
          {t("Bekor qilish")}
        </button>
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t("Profilda:")} <b>{show(conflict)}</b>. {t("O'quvchidan qayta so'rang.")}
          {!conflict.writable && (
            <>
              {" "}
              {t("Raqam profilni tahrirlash orqali o'zgartiriladi.")}
            </>
          )}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onKeepProfile}>
          {t("Profildagisi to'g'ri")}
        </Button>
        {conflict.writable && (
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onUseNew}>
            {t("Yangisi to'g'ri — profilni yangilash")}
          </Button>
        )}
      </div>
    </div>
  );
}
