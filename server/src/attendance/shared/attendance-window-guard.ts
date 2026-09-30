import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ENDED_REFUSAL,
  TEACHER_ENDED_REFUSAL,
  newAttendanceWindow,
  tashkentClock,
  windowRefusal,
} from './attendance-window';

/**
 * The ONE door check for taking attendance (spec 2026-09-29 §3.1): the lesson's
 * window is open AND «Dars bo'ldimi?» has not been asked for it. A manual save
 * (only for a NEW register), a QR session start and every QR scan all call
 * this, so the three can never drift apart.
 *
 * The lesson-end sweep opens its question in a Serializable transaction that
 * reads attendance; a save reads the question in one that writes attendance,
 * so the two cannot both succeed for the same lesson. Pass the transaction
 * client there, `PrismaService` elsewhere.
 *
 * `times` are the lesson's as `validateLessonDate` reads them from the
 * database — every caller, a QR scan included, passes them. A caller who
 * knows it is teacher-only passes `teacherOnly`: an ended lesson then reads
 * `TEACHER_ENDED_REFUSAL`; the other texts are the same for everyone.
 */
export async function assertAttendanceWindowOpen(
  db: Pick<Prisma.TransactionClient, 'unmarkedLesson'>,
  a: {
    groupId: string;
    date: string;
    parsedDate: Date;
    times: {
      startTime: string | null;
      endTime: string | null;
      /** The company's lead (`validateLessonDate`). */
      opensMinutesBefore: number;
    };
    teacherOnly?: boolean;
  },
): Promise<void> {
  const ended = a.teacherOnly ? TEACHER_ENDED_REFUSAL : ENDED_REFUSAL;
  const { todayStr, nowMinutes } = tashkentClock();
  const refusal = windowRefusal(
    newAttendanceWindow({
      date: a.date,
      todayStr,
      nowMinutes,
      startTime: a.times.startTime,
      endTime: a.times.endTime,
      opensMinutesBefore: a.times.opensMinutesBefore,
    }),
    {
      date: a.date,
      todayStr,
      startTime: a.times.startTime,
      opensMinutesBefore: a.times.opensMinutesBefore,
    },
  );
  if (refusal) {
    throw new BadRequestException(refusal === ENDED_REFUSAL ? ended : refusal);
  }

  const asked = await db.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: a.groupId, date: a.parsedDate } },
    select: { id: true },
  });
  if (asked) throw new BadRequestException(ended);
}
