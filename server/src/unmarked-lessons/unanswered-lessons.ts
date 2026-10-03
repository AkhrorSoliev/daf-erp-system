import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** How many lessons the refusal names; the rest are only counted. */
const LISTED = 5;

/**
 * A group is closed only once every «Dars bo'ldimi?» question about its
 * lessons has an answer (ADR-0068). Closing it first left the question on
 * the administrators' boards for a group nobody runs any more, and the answer
 * still moves money: «Bo'lmadi → Bekor qilish» gives the lesson back to every
 * student whose month was charged for it. On 02.10.2026 #011 was completed
 * nine minutes after its question opened, with six students charged for that
 * lesson.
 *
 * `groups` is the set the caller is about to close: one group, or every group
 * a branch closing or a course archive cancels (`groupsCancelledBy`).
 */
export async function assertNoUnansweredLessons(
  db: Pick<Prisma.TransactionClient, 'unmarkedLesson'>,
  groups: Prisma.GroupWhereInput,
): Promise<void> {
  const pending = await db.unmarkedLesson.findMany({
    where: { status: 'PENDING', group: groups },
    select: { date: true, group: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { groupId: 'asc' }],
  });
  if (pending.length === 0) return;

  const listed = pending
    .slice(0, LISTED)
    .map((p) => {
      const day = p.date.toISOString().slice(0, 10);
      return `${day.slice(8, 10)}.${day.slice(5, 7)} (${p.group.name})`;
    })
    .join(', ');
  const more =
    pending.length > LISTED ? ` va yana ${pending.length - LISTED} ta` : '';
  throw new BadRequestException(
    `Avval «Dars bo'ldimi?» savoliga javob bering: ${listed}${more}. Javob berilmagan darsi bor guruhni yopib bo'lmaydi.`,
  );
}
