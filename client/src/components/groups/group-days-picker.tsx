"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEEKDAYS = [
  { value: "monday", label: "Du" },
  { value: "tuesday", label: "Se" },
  { value: "wednesday", label: "Chor" },
  { value: "thursday", label: "Pay" },
  { value: "friday", label: "Ju" },
  { value: "saturday", label: "Sha" },
] as const;

export const ODD_DAYS = ["monday", "wednesday", "friday"];
export const EVEN_DAYS = ["tuesday", "thursday", "saturday"];
export const EVERY_DAY = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export function detectDayPreset(days: string[] | undefined): string {
  if (!days?.length) return "";
  const sorted = [...days].sort().join(",");
  if (sorted === [...ODD_DAYS].sort().join(",")) return "odd";
  if (sorted === [...EVEN_DAYS].sort().join(",")) return "even";
  if (sorted === [...EVERY_DAY].sort().join(",")) return "every";
  return "custom";
}

interface GroupDaysPickerProps {
  value: string[];
  onChange: (days: string[]) => void;
  error?: string;
  /**
   * If set, only days in this list can be selected. Presets that include
   * days outside the list are hidden, and individual day checkboxes for
   * disallowed days are shown disabled. Useful for restricting group days
   * to the parent branch's `workingDays`.
   */
  allowedDays?: string[];
  /** Custom label override (default: "Dars kunlari"). */
  label?: string;
}

export function GroupDaysPicker({
  value,
  onChange,
  error,
  allowedDays,
  label = "Dars kunlari",
}: GroupDaysPickerProps) {
  const [preset, setPreset] = useState(() => detectDayPreset(value));

  const allowedSet = allowedDays ? new Set(allowedDays) : null;
  const isPresetAllowed = (preset: readonly string[]) =>
    !allowedSet || preset.every((d) => allowedSet.has(d));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={preset}
        onValueChange={(v) => {
          setPreset(v);
          if (v === "odd") onChange(ODD_DAYS);
          else if (v === "even") onChange(EVEN_DAYS);
          else if (v === "every") onChange(EVERY_DAY);
          else if (v === "custom") onChange([]);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Kunlarni tanlang" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-(--radix-select-trigger-width)"
        >
          {isPresetAllowed(ODD_DAYS) && (
            <SelectItem value="odd">Toq kunlar (Du, Chor, Ju)</SelectItem>
          )}
          {isPresetAllowed(EVEN_DAYS) && (
            <SelectItem value="even">Juft kunlar (Se, Pay, Sha)</SelectItem>
          )}
          {isPresetAllowed(EVERY_DAY) && (
            <SelectItem value="every">Har kun (Du–Ju)</SelectItem>
          )}
          <SelectItem value="custom">Boshqa</SelectItem>
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <div className="flex flex-wrap gap-3 pt-1">
          {WEEKDAYS.map((day) => {
            const checked = value?.includes(day.value) ?? false;
            const disabled = allowedSet !== null && !allowedSet.has(day.value);
            return (
              <label
                key={day.value}
                className={`flex items-center gap-1.5 text-sm ${
                  disabled ? "text-muted-foreground/60 cursor-not-allowed" : ""
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(c) => {
                    const current = value ?? [];
                    onChange(
                      c
                        ? [...current, day.value]
                        : current.filter((d) => d !== day.value),
                    );
                  }}
                />
                {day.label}
              </label>
            );
          })}
        </div>
      )}

      {allowedSet && (
        <p className="text-xs text-muted-foreground">
          Filial faqat tanlangan kunlarda ishlaydi.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
