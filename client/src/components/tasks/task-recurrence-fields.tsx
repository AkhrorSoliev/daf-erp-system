"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { RECURRENCE_CHOICES, WEEKDAYS, type RecurrenceChoice, type RecurrenceForm } from "@/lib/task-recurrence-rules";

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** «Takrorlanish»: how often, which days, what time. `allowNone` = false in the sheet's editor (a rule is stopped there, not set to «Takrorlanmaydi»). */
export function TaskRecurrenceFields({ value, onChange, allowNone = true }: { value: RecurrenceForm; onChange: (f: RecurrenceForm) => void; allowNone?: boolean }) {
  const t = useT();
  const choices = allowNone ? RECURRENCE_CHOICES : RECURRENCE_CHOICES.filter((c) => c.id !== "NONE");
  const toggleDay = (id: number) =>
    onChange({ ...value, weekdays: value.weekdays.includes(id) ? value.weekdays.filter((d) => d !== id) : [...value.weekdays, id] });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Select value={value.freq} onValueChange={(v) => onChange({ ...value, freq: v as RecurrenceChoice })}>
          <SelectTrigger className="w-40" aria-label={t("Takrorlanish")}><SelectValue /></SelectTrigger>
          <SelectContent>{choices.map((c) => <SelectItem key={c.id} value={c.id}>{t(c.label)}</SelectItem>)}</SelectContent>
        </Select>
        {value.freq === "MONTHLY" && (
          <Select value={String(value.dayOfMonth)} onValueChange={(v) => onChange({ ...value, dayOfMonth: Number(v) })}>
            <SelectTrigger className="w-28" aria-label={t("Oy kuni")}><SelectValue /></SelectTrigger>
            <SelectContent>{MONTH_DAYS.map((d) => <SelectItem key={d} value={String(d)}>{t("{n}-sana", { n: d })}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {value.freq !== "NONE" && <TimePicker value={value.time} onChange={(time) => onChange({ ...value, time })} minTime="08:00" maxTime="22:00" className="w-28" />}
      </div>
      {value.freq === "WEEKLY" && (
        <div role="group" aria-label={t("Hafta kunlari")} className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={value.weekdays.includes(d.id)}
              onClick={() => toggleDay(d.id)}
              className={cn("rounded-md border px-2.5 py-1 text-xs", value.weekdays.includes(d.id) ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground")}
            >
              {t(d.short)}
            </button>
          ))}
        </div>
      )}
      {value.freq === "MONTHLY" && <p className="text-xs text-muted-foreground">{t("29–31-sanalar tanlanmaydi: ular har oyda bo'lmaydi.")}</p>}
      {value.freq !== "NONE" && <p className="text-xs text-muted-foreground">{t("Yakshanba yoki bayramga tushsa, keyingi ish kuniga suriladi. Oldingisi bajarilmagan bo'lsa, yangisi berilmaydi.")}</p>}
    </div>
  );
}
