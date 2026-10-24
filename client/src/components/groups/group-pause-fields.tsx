"use client";

import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { useT } from "@/i18n/context";
import {
  tomorrow,
  today,
  type GroupPauseInfo,
  type PauseChoice,
  type PauseMode,
} from "./group-pause-rules";

interface Props {
  mode: PauseMode;
  choice: PauseChoice;
  onChange: (choice: PauseChoice) => void;
  /** The pause the group is in now, when resuming. */
  pause?: GroupPauseInfo | null;
  disabled?: boolean;
}

/**
 * The restart day, asked where a group is paused and where it is opened
 * (ADR-0119, §1a–1b). A pause takes a day or "noma'lum"; a resume takes the
 * day and offers the one said before. The server decides what is valid.
 */
export function GroupPauseFields({ mode, choice, onChange, pause, disabled }: Props) {
  const t = useT();
  const said = pause?.resumeOn ?? pause?.plannedResumeOn ?? null;

  if (mode === "pause") {
    return (
      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
        <span className="text-sm font-medium">
          {t("Darslar qachondan qayta boshlanadi?")}{" "}
          <span className="text-destructive">*</span>
        </span>
        <DatePicker
          value={choice.day}
          onChange={(day) => onChange({ day, unknown: false })}
          minDate={tomorrow()}
          placeholder={t("Sanani tanlang")}
          disabled={disabled || choice.unknown}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={choice.unknown}
            onCheckedChange={(v) =>
              onChange({ day: v === true ? undefined : choice.day, unknown: v === true })
            }
            disabled={disabled}
          />
          {t("Hozircha noma'lum")}
        </label>
        <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/70">
          {t("Pauza davomida o'tmagan darslar puli o'quvchilarga har kecha avtomatik qaytariladi. O'quvchilarga xabar yuboriladi.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
      <span className="text-sm font-medium">
        {t("Darslar qaysi kundan boshlanadi?")}{" "}
        <span className="text-destructive">*</span>
      </span>
      {said ? (
        <p className="text-xs text-muted-foreground">
          {t("Oldindan belgilangan sana: {day}. Shu kundanmi?", {
            day: format(new Date(`${said}T00:00:00`), "dd.MM.yyyy"),
          })}
        </p>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {t("Sana belgilanmagan — avval sanani tanlang.")}
        </p>
      )}
      <DatePicker
        value={choice.day}
        onChange={(day) => onChange({ day, unknown: false })}
        minDate={today()}
        placeholder={t("Sanani tanlang")}
        disabled={disabled}
      />
      <p className="text-[11px] leading-relaxed text-blue-800/80 dark:text-blue-300/70">
        {t("Keyingi kun tanlansa, guruh o'sha kuni o'zi ochiladi. Oylik to'lov shu kundan hisoblanadi.")}
      </p>
    </div>
  );
}
