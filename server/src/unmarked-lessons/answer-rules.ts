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
