import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'unmarkedLesson'>;

/** The calendar day of a `@db.Date` value, which is stored as UTC midnight. */
function utcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** `"<groupId>:YYYY-MM-DD"` — the key every lock and its callers agree on. */
export function lessonKey(groupId: string, date: Date): string {
  return `${groupId}:${utcDay(date).toISOString().slice(0, 10)}`;
}

/**
 * ADR-0054: a lesson nobody marked before it ended earns its teacher
 * nothing — unless the CEO exempted it. True when the lesson has an
 * `UnmarkedLesson` row that is not exempt, whatever the row's status.
 */
export async function isLessonPayForfeited(
  db: Db,
  groupId: string,
  lessonDate: Date,
): Promise<boolean> {
  const row = await db.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId, date: utcDay(lessonDate) } },
    select: { teacherPayExempt: true },
  });
  return row !== null && !row.teacherPayExempt;
}

/** `lessonKey`s of the forfeited lessons whose day is in `[from, toExclusive)`. */
export async function loadForfeitedLessonKeys(
  db: Db,
  params: { companyId: number; from: Date; toExclusive: Date },
): Promise<Set<string>> {
  const rows = await db.unmarkedLesson.findMany({
    where: {
      companyId: params.companyId,
      teacherPayExempt: false,
      date: { gte: params.from, lt: params.toExclusive },
    },
    select: { groupId: true, date: true },
  });
  return new Set(rows.map((r) => lessonKey(r.groupId, r.date)));
}
