import type { Prisma, UnmarkedLessonStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { lessonKey } from './forfeited-lessons';

export interface UnmarkedLessonInfo {
  id: string;
  status: UnmarkedLessonStatus;
  /** The teacher is paid for this lesson whatever is answered (backfill or re-asked). */
  teacherPayExempt: boolean;
  /** The times the lesson really ran (a move can carry its own), as recorded when the question opened. */
  lessonStartTime: string;
  lessonEndTime: string;
  claimedBy: { id: number; firstName: string; lastName: string } | null;
}

/** What the schedule and the group calendar draw for each asked lesson. */
export async function loadUnmarkedLessonInfos(
  db: Pick<PrismaService, 'unmarkedLesson' | 'user'>,
  where: Prisma.UnmarkedLessonWhereInput,
): Promise<Map<string, UnmarkedLessonInfo>> {
  const rows = await db.unmarkedLesson.findMany({
    where,
    select: {
      id: true,
      groupId: true,
      date: true,
      status: true,
      teacherPayExempt: true,
      lessonStartTime: true,
      lessonEndTime: true,
      claimedById: true,
    },
  });
  const claimerIds = [
    ...new Set(
      rows.map((r) => r.claimedById).filter((id): id is number => id !== null),
    ),
  ];
  const claimers = claimerIds.length
    ? await db.user.findMany({
        where: { id: { in: claimerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const byId = new Map(claimers.map((u) => [u.id, u]));
  return new Map(
    rows.map((r) => [
      lessonKey(r.groupId, r.date),
      {
        id: r.id,
        status: r.status,
        teacherPayExempt: r.teacherPayExempt,
        lessonStartTime: r.lessonStartTime,
        lessonEndTime: r.lessonEndTime,
        claimedBy:
          r.claimedById !== null ? (byId.get(r.claimedById) ?? null) : null,
      },
    ]),
  );
}
