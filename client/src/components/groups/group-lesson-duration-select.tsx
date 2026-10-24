"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/context";

interface GroupLessonDurationSelectProps {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  defaultLessonMinutes: number | null;
}

export function GroupLessonDurationSelect({
  value,
  onChange,
  defaultLessonMinutes,
}: GroupLessonDurationSelectProps) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label>{t("Dars davomiyligi")}</Label>
      <Select
        value={value ? String(value) : "default"}
        onValueChange={(v) => {
          onChange(v === "default" ? undefined : Number(v));
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-(--radix-select-trigger-width)"
        >
          <SelectItem value="default">
            {t("Kurs bo'yicha ({n} daq)", { n: defaultLessonMinutes ?? 90 })}
          </SelectItem>
          <SelectItem value="60">{t("60 daqiqa (1 soat)")}</SelectItem>
          <SelectItem value="90">{t("90 daqiqa (1.5 soat)")}</SelectItem>
          <SelectItem value="120">{t("120 daqiqa (2 soat)")}</SelectItem>
          <SelectItem value="150">{t("150 daqiqa (2.5 soat)")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
