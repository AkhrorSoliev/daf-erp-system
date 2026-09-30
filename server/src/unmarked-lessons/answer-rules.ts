import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma, UnmarkedLesson } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'unmarkedLesson' | 'user'>;

/** The lesson still waiting for «Dars bo'ldimi?», or 404. */
export async function findPendingUnmarkedLesson(
  db: Pick<Prisma.TransactionClient, 'unmarkedLesson'>,
  args: { groupId: string; date: Date; companyId: number },
): Promise<UnmarkedLesson> {
  const row = await db.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
  });
  if (!row || row.companyId !== args.companyId || row.status !== 'PENDING') {
    throw new NotFoundException('Javob kutilayotgan dars topilmadi');
  }
  return row;
}

/**
 * A cancellation or a move away takes the day off the timetable — the rule
 * `endedLessonsOn` applies: a day another live move lands on is still a
 * lesson. Read inside the caller's Serializable transaction, so a cancel or
 * move committed after the caller's earlier reads either shows up here or
 * conflicts with it.
 */
export async function lessonDayTakenAway(
  db: Pick<Prisma.TransactionClient, 'lessonCancellation' | 'lessonReschedule'>,
  groupId: string,
  date: Date,
): Promise<'CANCELLED' | 'MOVED' | null> {
  const cancelled = await db.lessonCancellation.findFirst({
    where: { groupId, date, deletedAt: null },
    select: { id: true },
  });
  if (cancelled) return 'CANCELLED';
  const moves = await db.lessonReschedule.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [{ originalDate: date }, { newDate: date }],
    },
    select: { originalDate: true, newDate: true },
  });
  const away = moves.some((m) => m.originalDate.getTime() === date.getTime());
  const here = moves.some((m) => m.newDate.getTime() === date.getTime());
  return away && !here ? 'MOVED' : null;
}

/**
 * Once an administrator has taken the lesson's task, the other
 * administrators leave it to them; directors and the CEO can always answer
 * (spec §3.3). The roles come from the caller's token — this only ever
 * narrows who may act, it grants nothing.
 */
export async function assertMayAnswer(
  db: Db,
  row: { claimedById: number | null },
  userId: number,
  roles: string[],
): Promise<void> {
  if (row.claimedById === null || row.claimedById === userId) return;
  if (roles.includes('CEO') || roles.includes('Branch Director')) return;
  const holder = await db.user.findUnique({
    where: { id: row.claimedById },
    select: { firstName: true, lastName: true },
  });
  throw new ConflictException(
    holder
      ? `Bu darsga ${holder.firstName} ${holder.lastName} javob bermoqda`
      : 'Bu darsga boshqa administrator javob bermoqda',
  );
}
