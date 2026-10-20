import type { RecurrenceFreq, TaskRecurrenceBadge, TaskRecurrenceView } from "@/hooks/use-tasks";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";

/** The page's `t`; without it the texts read in Uzbek as written. */
type Translate = (source: string, params?: Params) => string;

/**
 * The server's numbering, 1 = dushanba … 6 = shanba; Sunday is never a run day.
 * `every` is the one-day badge as a whole text: in ru the word for «every» agrees with the day.
 */
export const WEEKDAYS: { id: number; short: string; name: string; every: string }[] = [
  { id: 1, short: msg("Du"), name: msg("dushanba"), every: msg("Har dushanba") },
  { id: 2, short: msg("Se"), name: msg("seshanba"), every: msg("Har seshanba") },
  { id: 3, short: msg("Cho"), name: msg("chorshanba"), every: msg("Har chorshanba") },
  { id: 4, short: msg("Pa"), name: msg("payshanba"), every: msg("Har payshanba") },
  { id: 5, short: msg("Ju"), name: msg("juma"), every: msg("Har juma") },
  { id: 6, short: msg("Sh"), name: msg("shanba"), every: msg("Har shanba") },
];

export type RecurrenceChoice = "NONE" | RecurrenceFreq;
// «Takrorlanmaydi», not «Yo'q»: the dictionary's «Yo'q» is a plain «No».
export const RECURRENCE_CHOICES: { id: RecurrenceChoice; label: string }[] = [
  { id: "NONE", label: msg("Takrorlanmaydi") },
  { id: "DAILY", label: msg("Har kuni") },
  { id: "WEEKLY", label: msg("Har hafta") },
  { id: "MONTHLY", label: msg("Har oy") },
];

export interface RecurrenceForm { freq: RecurrenceChoice; weekdays: number[]; dayOfMonth: number; time: string }
const DEFAULT_TIME = "18:00";
export const EMPTY_RECURRENCE: RecurrenceForm = { freq: "NONE", weekdays: [1], dayOfMonth: 1, time: DEFAULT_TIME };

/** The card badge (spec screen 1): «Har kuni», «Har dushanba», «Har oyning 5-sanasi». */
export function recurrenceBadge(r: TaskRecurrenceBadge, t: Translate = interpolate): string {
  if (r.freq === "DAILY") return t("Har kuni");
  if (r.freq === "MONTHLY") return t("Har oyning {day}-sanasi", { day: String(r.dayOfMonth) });
  const days = WEEKDAYS.filter((d) => r.weekdays.includes(d.id));
  const [first, second] = days;
  if (days.length === 1) return t(first.every);
  if (days.length === 2) return t("Har {first} va {second}", { first: t(first.name), second: t(second.name) });
  return t("Har hafta: {days}", { days: days.map((d) => t(d.short)).join(", ") });
}

/** The sheet's line: «Har dushanba, 10:00». */
export const recurrenceLine = (r: TaskRecurrenceBadge & { dueTime: string }, t: Translate = interpolate) => `${recurrenceBadge(r, t)}, ${r.dueTime}`;

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

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

/** What «Saqlash» sends: only what changed, so a save that touches only the assignees never moves `nextRunDate`. */
export function changes(rule: TaskRecurrenceView, form: RecurrenceForm, assigneeIds: number[]) {
  const body: Record<string, unknown> = {};
  const schedule = recurrencePayload(form);
  if (JSON.stringify(schedule) !== JSON.stringify(recurrencePayload(formFromRule(rule)))) body.schedule = schedule;
  if (!sameIds(assigneeIds, rule.assignees.map((a) => a.id))) body.assigneeIds = assigneeIds;
  return body;
}
