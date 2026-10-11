import type { RecurrenceFreq, TaskRecurrenceBadge } from "@/hooks/use-tasks";

/** The server's numbering, 1 = dushanba … 6 = shanba; Sunday is never a run day. */
export const WEEKDAYS: { id: number; short: string; name: string }[] = [
  { id: 1, short: "Du", name: "dushanba" },
  { id: 2, short: "Se", name: "seshanba" },
  { id: 3, short: "Cho", name: "chorshanba" },
  { id: 4, short: "Pa", name: "payshanba" },
  { id: 5, short: "Ju", name: "juma" },
  { id: 6, short: "Sh", name: "shanba" },
];

export type RecurrenceChoice = "NONE" | RecurrenceFreq;
export const RECURRENCE_CHOICES: { id: RecurrenceChoice; label: string }[] = [
  { id: "NONE", label: "Yo'q" },
  { id: "DAILY", label: "Har kuni" },
  { id: "WEEKLY", label: "Har hafta" },
  { id: "MONTHLY", label: "Har oy" },
];

export interface RecurrenceForm { freq: RecurrenceChoice; weekdays: number[]; dayOfMonth: number; time: string }
const DEFAULT_TIME = "18:00";
export const EMPTY_RECURRENCE: RecurrenceForm = { freq: "NONE", weekdays: [1], dayOfMonth: 1, time: DEFAULT_TIME };

/** The card badge (spec screen 1): «Har kuni», «Har dushanba», «Har oyning 5-sanasi». */
export function recurrenceBadge(r: TaskRecurrenceBadge): string {
  if (r.freq === "DAILY") return "Har kuni";
  if (r.freq === "MONTHLY") return `Har oyning ${r.dayOfMonth}-sanasi`;
  const days = WEEKDAYS.filter((d) => r.weekdays.includes(d.id));
  if (days.length === 1) return `Har ${days[0].name}`;
  if (days.length === 2) return `Har ${days[0].name} va ${days[1].name}`;
  return `Har hafta: ${days.map((d) => d.short).join(", ")}`;
}

/** The sheet's line: «Har dushanba, 10:00». */
export const recurrenceLine = (r: TaskRecurrenceBadge & { dueTime: string }) => `${recurrenceBadge(r)}, ${r.dueTime}`;

/** `POST /tasks` → `recurrence`, and `PATCH …/recurrences/:id` → `schedule`; undefined = a one-off task. */
export function recurrencePayload(f: RecurrenceForm): { freq: RecurrenceFreq; weekdays?: number[]; dayOfMonth?: number; dueTime: string } | undefined {
  if (f.freq === "NONE") return undefined;
  const dueTime = f.time || DEFAULT_TIME;
  if (f.freq === "WEEKLY") return { freq: "WEEKLY", weekdays: [...f.weekdays].sort((a, b) => a - b), dueTime };
  if (f.freq === "MONTHLY") return { freq: "MONTHLY", dayOfMonth: f.dayOfMonth, dueTime };
  return { freq: "DAILY", dueTime };
}

export const recurrenceFormReady = (f: RecurrenceForm) => f.freq !== "WEEKLY" || f.weekdays.length > 0;

export function formFromRule(r: TaskRecurrenceBadge & { dueTime: string }): RecurrenceForm {
  return { freq: r.freq, weekdays: r.weekdays.length ? r.weekdays : [1], dayOfMonth: r.dayOfMonth ?? 1, time: r.dueTime };
}

/** `YYYY-MM-DD` (a Tashkent day from the server) → «19.10». */
export const dayMonth = (dateStr: string) => `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;
