import {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';

/**
 * When online payment for one mock registration closes.
 *
 * CEO, 2026-09-25: a mock exam has a set date and time, and money is accepted
 * until that time. Only those who paid sit the exam. So the cutoff is the start
 * of the participant's own slot (`examTime`, chosen in the bot), in Tashkent
 * time.
 *
 * - The participant chose no slot, or the slot is not `HH:MM`: the exam's
 *   earliest slot.
 * - The exam has a date but no slots: the end of the exam day.
 * - The exam has no date: no cutoff. The exam status still limits payment
 *   (`PAYABLE_EXAM_STATUSES`).
 *
 * The day is read in Tashkent, so a date stored at UTC midnight (the exam form)
 * and one stored at Tashkent midnight give the same day.
 */
export function mockPaymentCutoff(args: {
  examDate: Date | null;
  examTimes: readonly string[];
  participantExamTime: string | null;
}): Date | null {
  if (!args.examDate) return null;
  const day = tashkentDateStr(args.examDate);

  const minutes =
    minutesOf(args.participantExamTime) ?? earliestSlot(args.examTimes);
  if (minutes === null) return tashkentDayStartUtc(addDaysToDateStr(day, 1));
  return new Date(tashkentDayStartUtc(day).getTime() + minutes * 60_000);
}

/** Whether a payment may still start at `now`. No cutoff means open. */
export function isMockPaymentOpen(cutoff: Date | null, now: Date): boolean {
  return cutoff === null || now.getTime() < cutoff.getTime();
}

/** `30.09.2026, 09:00` in Tashkent time, for messages to participants. */
export function formatMockPaymentCutoff(cutoff: Date): string {
  const t = new Date(cutoff.getTime() + TASHKENT_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}, ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
  );
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(slot: string | null | undefined): number | null {
  const m = slot ? HH_MM.exec(slot.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function earliestSlot(slots: readonly string[]): number | null {
  const valid = slots
    .map((s) => minutesOf(s))
    .filter((m): m is number => m !== null);
  return valid.length > 0 ? Math.min(...valid) : null;
}
