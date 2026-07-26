"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";

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
  const times = value ?? [];

  const setAt = (i: number, t: string) => {
    const next = [...times];
    next[i] = t;
    onChange(next);
  };
  const removeAt = (i: number) =>
    onChange(times.filter((_, idx) => idx !== i));
  const add = () => onChange([...times, "14:00"]);

  return (
    <div className="space-y-2">
      {times.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Vaqt qo&apos;shilmagan.
        </p>
      )}
      {times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <TimePicker
              value={t}
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
                ? "Kamida 1 ta vaqt qoldiring"
                : "O'chirish"
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" />
        Vaqt qo&apos;shish
      </Button>
    </div>
  );
}
