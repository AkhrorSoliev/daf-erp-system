/**
 * Opens «Dars bo'ldimi?» for past lessons nobody marked since the monthly
 * model began (spec 2026-09-29 §9, Q11). They predate the rule, so they open
 * EXEMPT: answered «Bo'ldi», the teacher is paid as before.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/open-unmarked-lessons.ts \
 *     [--from=2026-09-01] [--expect=<N>] [--apply]
 *
 * Two steps. First the dry run (no --apply): the connection is read-only (the
 * script checks that it took effect and stops otherwise) and it lists every
 * lesson it would open, with the group and branch ids, and the count N. Then
 * the same command with `--apply --expect=<N>`: it scans again and aborts
 * BEFORE writing if the count differs, so what was reviewed is what is
 * written. `--apply` without `--expect` is refused, as is any unknown flag.
 *
 * Only ACTIVE groups are asked, like the live sweep: a group's calendar keeps
 * drawing lesson days after the group closed (nothing records the closing
 * date), and those days were never lessons. A lesson day is what the group
 * calendar calls one otherwise (schedule history, the group's own branch's
 * holidays, cancellations and moves included) — the same `getLessonCalendar`
 * the admin panel draws.
 *
 * A lesson that fails is logged and skipped; the run goes on, ends with a
 * non-zero exit code, and can be repeated (lessons already opened are skipped).
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { HolidaysService } from '../src/holidays/holidays.service';
import { AttendanceReadService } from '../src/attendance/attendance-read.service';
import { EntityHistoryService } from '../src/common/entity-history/entity-history.service';
import {
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from '../src/unmarked-lessons/lesson-task';
import { HOLIDAY_LOOKAHEAD_DAYS } from '../src/unmarked-lessons/reask-holidays';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  tashkentClock,
} from '../src/attendance/shared/attendance-window';
import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../src/common/date/tashkent';
import { printHeader } from './lib/check-cli';
import { parseOpenUnmarkedArgs, UsageError } from './lib/open-unmarked-args';

const EXEMPT_REASON = 'Qoida kuchga kirishidan oldingi dars (ADR-0054)';
/** Under the pool's default of 10 connections. */
const GROUPS_AT_A_TIME = 8;
const PROGRESS_EVERY = 100;

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

function monthsBetween(
  fromStr: string,
  toStr: string,
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(fromStr.slice(0, 4));
  let m = Number(fromStr.slice(5, 7));
  const endY = Number(toStr.slice(0, 4));
  const endM = Number(toStr.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function main() {
  // Refuse a bad command line before anything connects.
  const {
    apply: APPLY,
    from: FROM,
    expect,
  } = parseOpenUnmarkedArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(url);

  const prisma = new PrismaService();
  try {
    printHeader(
      `«Dars bo'ldimi?» for past unmarked lessons — ${APPLY ? 'APPLY' : 'DRY RUN'}`,
    );
    if (!APPLY) {
      const [ro] = await prisma.$queryRaw<
        { default_transaction_read_only: string }[]
      >`SHOW default_transaction_read_only`;
      if (ro?.default_transaction_read_only !== 'on') {
        throw new Error('Read-only connection was not established — stopping');
      }
    }

    // getLessonCalendar only needs buildHolidayDateSet, which only reads prisma.
    const holidays = new HolidaysService(
      prisma,
      null as never,
      null as never,
      null as never,
    );
    const read = new AttendanceReadService(prisma, holidays);
    const history = new EntityHistoryService(prisma, new EventEmitter2());
    const { todayStr } = tashkentClock();
    const today = utcMidnightFromDateStr(todayStr);

    // ACTIVE only, like the live sweep. A closed group's calendar still draws
    // a lesson day for every scheduled weekday after it closed.
    const groups = await prisma.group.findMany({
      where: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        companyId: true,
        branchId: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
      orderBy: { name: 'asc' },
    });
    const skippedGroups = await prisma.group.count({
      where: { deletedAt: null, statusEnum: { not: GroupStatus.ACTIVE } },
    });

    // The calendar costs about seven queries a group, so groups are read a few
    // at a time: one by one, a remote database makes this run for minutes.
    const months = monthsBetween(FROM, todayStr);
    const unmarkedDays = async (group: (typeof groups)[number]) => {
      const days: string[] = [];
      for (const { year, month } of months) {
        const { cells } = await read.getLessonCalendar(
          group.id,
          month,
          year,
          group.companyId,
        );
        for (const c of cells) {
          const live = c.type === 'regular' || c.type === 'rescheduledTo';
          if (
            live &&
            !c.hasAttendance &&
            !c.unmarked &&
            c.date >= FROM &&
            c.date < todayStr
          ) {
            days.push(c.date);
          }
        }
      }
      return days;
    };
    const found: { group: (typeof groups)[number]; date: string }[] = [];
    for (let i = 0; i < groups.length; i += GROUPS_AT_A_TIME) {
      const batch = groups.slice(i, i + GROUPS_AT_A_TIME);
      const days = await Promise.all(batch.map(unmarkedDays));
      batch.forEach((group, k) => {
        for (const date of days[k]) found.push({ group, date });
      });
    }

    // A calendar cell carries no times. A lesson moved onto a day keeps the
    // move's own times when it set any — the rule the live sweep applies
    // (`endedLessonsOn`) — so read them here instead of using the group's.
    const moves = found.length
      ? await prisma.lessonReschedule.findMany({
          where: {
            deletedAt: null,
            groupId: { in: [...new Set(found.map((f) => f.group.id))] },
            newDate: { gte: utcMidnightFromDateStr(FROM), lt: today },
          },
          select: {
            groupId: true,
            newDate: true,
            newLessonStartTime: true,
            newLessonEndTime: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const moveOn = new Map(
      moves.map((m) => [
        `${m.groupId}:${m.newDate.toISOString().slice(0, 10)}`,
        m,
      ]),
    );
    const timesOf = (f: (typeof found)[number]) => {
      const move = moveOn.get(`${f.group.id}:${f.date}`);
      return {
        startTime:
          move?.newLessonStartTime ?? f.group.lessonStartTime ?? DAY_START_TIME,
        endTime:
          move?.newLessonEndTime ?? f.group.lessonEndTime ?? DAY_END_TIME,
      };
    };

    for (const f of found) {
      const { startTime, endTime } = timesOf(f);
      console.log(
        `${f.group.id}\tbranch ${f.group.branchId}\t${f.group.name}\t${f.date}\t${startTime}–${endTime}`,
      );
    }
    console.log(
      `\n${found.length} lesson(s) ${APPLY ? 'to open' : 'would be opened'} (from ${FROM}).`,
    );
    console.log(
      `Skipped ${skippedGroups} group(s) that are not ACTIVE (closed groups are not asked).`,
    );

    // What was reviewed is what gets written: a scan that differs from the
    // dry run's count stops here, before any write.
    if (expect !== null && found.length !== expect) {
      throw new UsageError(
        `Scan found ${found.length} lesson(s) but --expect=${expect}. Nothing was written; review a fresh dry run and pass its count.`,
      );
    }
    if (found.length === 0) return;

    // Every task is due on the next working day of its lesson's OWN branch,
    // as the live sweep does. Read in the dry run too: it only reads, and it
    // proves the holiday lookup works before anything is applied.
    const dueAtByBranch = new Map<number, Date>();
    for (const branchId of new Set(found.map((f) => f.group.branchId))) {
      const branchHolidays = await holidays.buildHolidayDateSet(
        today,
        utcMidnightFromDateStr(
          addDaysToDateStr(todayStr, HOLIDAY_LOOKAHEAD_DAYS),
        ),
        branchId,
      );
      const dueDay = nextWorkingDay(todayStr, branchHolidays);
      dueAtByBranch.set(branchId, taskDueAt(dueDay));
      console.log(`Branch ${branchId}: tasks due ${dueDay} 10:00.`);
    }
    if (!APPLY) return;

    let opened = 0;
    let alreadyHandled = 0;
    let failed = 0;
    for (const [i, f] of found.entries()) {
      const date = utcMidnightFromDateStr(f.date);
      const { startTime, endTime } = timesOf(f);
      const dueAt = dueAtByBranch.get(f.group.branchId)!;
      try {
        // Serializable, like the live sweep: a register saved at the same
        // moment reads the question in its own Serializable transaction, so a
        // lesson is never both marked and asked.
        const wrote = await prisma.$transaction(
          async (tx) => {
            const marked = await tx.attendance.findFirst({
              where: { groupId: f.group.id, date },
              select: { id: true },
            });
            const asked = await tx.unmarkedLesson.findUnique({
              where: { groupId_date: { groupId: f.group.id, date } },
              select: { id: true },
            });
            if (marked || asked) return false;
            const taskCommentId = await createLessonTask(tx, {
              companyId: f.group.companyId,
              branchId: f.group.branchId,
              groupId: f.group.id,
              groupName: f.group.name,
              dateStr: f.date,
              startTime,
              endTime,
              dueAt,
            });
            await tx.unmarkedLesson.create({
              data: {
                companyId: f.group.companyId,
                branchId: f.group.branchId,
                groupId: f.group.id,
                date,
                lessonStartTime: startTime,
                lessonEndTime: endTime,
                teacherPayExempt: true,
                exemptReason: EXEMPT_REASON,
                taskCommentId,
              },
            });
            // The group's history says the question was asked, as `openOne` does.
            await history.recordCreate({
              entityType: 'Group',
              entityId: f.group.id,
              newValues: {
                action: 'DAVOMAT_OLINMADI',
                sana: f.date,
                vaqt: `${startTime}–${endTime}`,
              },
              companyId: f.group.companyId,
              tx,
            });
            return true;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10_000,
            timeout: 15_000,
          },
        );
        if (wrote) opened += 1;
        else alreadyHandled += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `FAILED ${f.group.id} ${f.date}: ${err instanceof Error ? err.message : err}`,
        );
      }
      if ((i + 1) % PROGRESS_EVERY === 0) {
        console.log(
          `… ${i + 1}/${found.length} (opened ${opened}, failed ${failed})`,
        );
      }
    }
    console.log(
      `Opened ${opened}. Already marked or asked meanwhile: ${alreadyHandled}. Failed: ${failed}.`,
    );
    if (failed > 0) {
      console.error(
        `${failed} lesson(s) failed — repeat the same command to retry them (lessons already opened are skipped).`,
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof UsageError ? err.message : err);
  process.exitCode = 1;
});
