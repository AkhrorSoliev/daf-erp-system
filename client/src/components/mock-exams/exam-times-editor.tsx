"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { useT } from "@/i18n/context";

interface ExamTimesEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  minTime?: string;
  maxTime?: string;
}

/**
 * Edits the list of exam time slots ("HH:mm") offered on the exam date.
 * The first time is the primary session; adding a second (or more) makes
 * the bot ask each participant to pick one. Shared by the create + edit
 * drawers.
 */
export function ExamTimesEditor({
  value,
  onChange,
  minTime,
  maxTime,
}: ExamTimesEditorProps) {
  const t = useT();
  const times = value ?? [];

  const setAt = (i: number, time: string) => {
    const next = [...times];
    next[i] = time;
    onChange(next);
  };
  const removeAt = (i: number) =>
    onChange(times.filter((_, idx) => idx !== i));
  const add = () => onChange([...times, "14:00"]);

  return (
    <div className="space-y-2">
      {times.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Vaqt qo'shilmagan.")}
        </p>
      )}
      {times.map((time, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <TimePicker
              value={time}
              onChange={(v) => setAt(i, v)}
              minTime={minTime}
              maxTime={maxTime}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeAt(i)}
            disabled={times.length === 1}
            title={
              times.length === 1
                ? t("Kamida 1 ta vaqt qoldiring")
                : t("O'chirish")
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" />
        {t("Vaqt qo'shish")}
      </Button>
    </div>
  );
}
