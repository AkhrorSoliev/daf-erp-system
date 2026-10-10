import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
  tashkentDayRangeUtc,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import {
  UNCALLED_LEAD_AGE_MS,
  UNCALLED_LEAD_WHERE,
  autoTaskAssigneeIds,
  sourceKeyOf,
  systemDueAt,
  uncalledLeadText,
  uncalledLeadWindowOpen,
  type AutoCloseReason,
} from './task-auto-rules';
import { TaskAutoService } from './task-auto.service';
import { autoCloseTasks, createSystemTask } from './task-auto-write';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskAutoClosedPayload,
} from './task-events';
import { OPEN_STATUSES } from './task-transitions';

// ponytail: 200 leads a company an hour; a bigger backlog waits for the next run.
const LEAD_BATCH = 200;
const OPEN = [...OPEN_STATUSES];
const PROMISE_CRON_HOUR = 9;

/**
 * The hourly run of the automatic tasks (spec §7, §9.6), 08:00–18:00
 * Monday–Saturday (Tashkent):
 *  - «Qo'ng'iroqsiz lid»: a task for each NEW lead nobody called for 24 hours,
 *    only for leads created since `Company.uncalledLeadTasksFrom` (ADR-0080);
 *  - a sweep that closes what events do not: a lead's task once the lead is
 *    called, no longer NEW, archived or converted (a section archived with its
 *    leads sends no event), and the lead/callback/promise tasks of an archived
 *    student;
 *  - a retry of today's «Buzilgan va'da» tasks the 09:00 event failed to make,
 *    so a transient failure never loses one (admins no longer get the list).
 * Each step of each company fails alone.
 */
@Injectable()
export class TaskAutoLeadsService {
  private readonly logger = new Logger(TaskAutoLeadsService.name);
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private taskAuto: TaskAutoService,
  ) {}

  @Cron('0 0 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run(new Date());
    } finally {
      this.running = false;
    }
  }

  async run(now: Date): Promise<{ created: number; closed: number }> {
    const total = { created: 0, closed: 0 };
    if (!uncalledLeadWindowOpen(now)) return total;
    const companies = await this.prisma.company.findMany({
      select: { id: true, uncalledLeadTasksFrom: true },
    });
    for (const c of companies) {
      const leads = await this.guard(c.id, 'uncalled leads', () =>
        this.leadTasks(c.id, c.uncalledLeadTasksFrom, now),
      );
      total.created += leads.created;
      total.closed += leads.closed;
      total.closed += (
        await this.guard(c.id, 'archived students', async () => ({
          created: 0,
          closed: await this.closeArchivedStudents(c.id),
        }))
      ).closed;
      await this.guard(c.id, 'broken promises', async () => {
        await this.retryBrokenPromises(c.id, now);
        return { created: 0, closed: 0 };
      });
    }
    return total;
  }

  private async guard(
    companyId: number,
    what: string,
    fn: () => Promise<{ created: number; closed: number }>,
  ): Promise<{ created: number; closed: number }> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(
        `${what} of company ${companyId} failed: ${(err as Error).message}`,
      );
      return { created: 0, closed: 0 };
    }
  }

  private async leadTasks(companyId: number, since: Date, now: Date) {
    const tasks = await this.prisma.task.findMany({
      where: { companyId, kind: 'UNCALLED_LEAD' },
      select: { entityId: true, status: true },
    });
    const withEntity = tasks.filter(
      (t): t is typeof t & { entityId: string } => t.entityId !== null,
    );
    const openLeadIds = withEntity
      .filter((t) => OPEN.includes(t.status))
      .map((t) => t.entityId);
    // A lead is tasked once, ever: one called (task closed) and then un-marked
    // does not open a fresh task.
    // ponytail: grows with every tasked lead (Prisma's ~32k parameter limit);
    // past that, narrow it to tasks created since `since`.
    const taskedLeadIds = [...new Set(withEntity.map((t) => t.entityId))];
    return {
      closed: await this.closeResolved(companyId, openLeadIds),
      created: await this.openTasks(companyId, since, now, taskedLeadIds),
    };
  }

  private async closeResolved(
    companyId: number,
    openLeadIds: string[],
  ): Promise<number> {
    if (openLeadIds.length === 0) return 0;
    const live = new Set(
      (
        await this.prisma.lead.findMany({
          where: { id: { in: openLeadIds }, companyId, ...UNCALLED_LEAD_WHERE },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    const gone = openLeadIds.filter((id) => !live.has(id));
    return this.closeAndTell(
      companyId,
      { sourceKey: { in: gone.map((id) => sourceKeyOf('UNCALLED_LEAD', id)) } },
      'LEAD_GONE',
      gone.length,
    );
  }

  /** The tasks of an archived student (events never reach a card archived with no payment or call). */
  private async closeArchivedStudents(companyId: number): Promise<number> {
    const open = await this.prisma.task.findMany({
      where: {
        companyId,
        kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] },
        status: { in: OPEN },
        entityType: 'Student',
      },
      select: { entityId: true },
    });
    const ids = [...new Set(open.map((t) => Number(t.entityId ?? NaN)))].filter(
      Number.isInteger,
    );
    if (ids.length === 0) return 0;
    const archived = await this.prisma.student.findMany({
      where: { id: { in: ids }, companyId, deletedAt: { not: null } },
      select: { id: true },
    });
    return this.closeAndTell(
      companyId,
      {
        kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] },
        entityType: 'Student',
        entityId: { in: archived.map((s) => String(s.id)) },
      },
      'STUDENT_GONE',
      archived.length,
    );
  }

  private async closeAndTell(
    companyId: number,
    where: Parameters<typeof autoCloseTasks>[1],
    reason: AutoCloseReason,
    candidates: number,
  ): Promise<number> {
    if (candidates === 0) return 0;
    const closed = await autoCloseTasks(
      this.prisma,
      { companyId, ...where },
      reason,
    );
    for (const task of closed) {
      this.emitter.emit(TASK_EVENTS.AUTO_CLOSED, {
        task,
        reason,
      } satisfies TaskAutoClosedPayload);
    }
    return closed.length;
  }

  private async openTasks(
    companyId: number,
    since: Date,
    now: Date,
    taskedLeadIds: string[],
  ): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      where: {
        companyId,
        ...UNCALLED_LEAD_WHERE,
        createdAt: {
          gte: since,
          lt: new Date(now.getTime() - UNCALLED_LEAD_AGE_MS),
        },
        // Before `take`: leads that already have a task must never starve newer ones.
        ...(taskedLeadIds.length > 0 ? { id: { notIn: taskedLeadIds } } : {}),
      },
      select: { id: true, firstName: true, lastName: true, branchId: true },
      orderBy: { createdAt: 'asc' },
      take: LEAD_BATCH,
    });
    // Per branch once: who takes it and when it is due.
    const perBranch = new Map<
      number | null,
      { assigneeIds: number[]; dueAt: Date }
    >();
    let made = 0;
    for (const lead of leads) {
      // One bad lead must not stop the rest of the batch.
      try {
        if (await this.openTask(companyId, lead, now, perBranch)) made++;
      } catch (err) {
        this.logger.error(
          `uncalled lead ${lead.id}: task failed: ${(err as Error).message}`,
        );
      }
    }
    return made;
  }

  private async openTask(
    companyId: number,
    lead: {
      id: string;
      firstName: string;
      lastName: string;
      branchId: number | null;
    },
    now: Date,
    perBranch: Map<number | null, { assigneeIds: number[]; dueAt: Date }>,
  ): Promise<boolean> {
    let branch = perBranch.get(lead.branchId);
    if (!branch) {
      const holidays = await buildHolidayDateSet(
        this.prisma,
        now,
        new Date(now.getTime() + 14 * 864e5),
        lead.branchId,
      );
      branch = {
        assigneeIds: await autoTaskAssigneeIds(
          this.prisma,
          companyId,
          lead.branchId,
        ),
        dueAt: systemDueAt(tashkentDateStr(now), holidays, now),
      };
      perBranch.set(lead.branchId, branch);
    }
    const task = await createSystemTask(this.prisma, {
      companyId,
      branchId: lead.branchId,
      kind: 'UNCALLED_LEAD',
      ...uncalledLeadText({
        name: `${lead.lastName} ${lead.firstName}`.trim(),
      }),
      dueAt: branch.dueAt,
      entityId: lead.id,
      sourceKey: sourceKeyOf('UNCALLED_LEAD', lead.id),
      assigneeIds: branch.assigneeIds,
    });
    if (!task) return false;
    this.emitter.emit(TASK_EVENTS.ASSIGNED, {
      task,
      actorId: null,
      userIds: branch.assigneeIds,
      created: true,
    } satisfies TaskAssignedPayload);
    return true;
  }

  /**
   * Promises the 09:00 cron broke TODAY (Tashkent) whose student still owes
   * the alert threshold. `onPromisesBroken` makes ONE task per student, so
   * "already handled" is judged per student: one with a BROKEN_PROMISE task
   * open, created today or closed today (an old task that was open at 09:00
   * made the event skip them, and its closing since must not hand them a
   * fresh task) is left alone. `onPromisesBroken` is the writer, so the rules
   * (latest promise, ladder, due) stay in one place.
   */
  private async retryBrokenPromises(
    companyId: number,
    now: Date,
  ): Promise<void> {
    // The promise cron runs at 09:00 and flips the statuses a moment before it
    // emits: the retry starts at 10:00.
    if (this.tashkentHour(now) === PROMISE_CRON_HOUR) return;
    const today = tashkentDateStr(now);
    const promises = await this.prisma.paymentPromise.findMany({
      where: {
        companyId,
        status: 'BROKEN',
        reminderFiredAt: tashkentDayRangeUtc(today),
        student: { deletedAt: null, balance: { lte: -MIN_ALERT_DEBT } },
      },
      select: { id: true, branchId: true, studentId: true },
    });
    if (promises.length === 0) return;
    const todayStart = tashkentDayStartUtc(today);
    const handled = new Set(
      (
        await this.prisma.task.findMany({
          where: {
            companyId,
            kind: 'BROKEN_PROMISE',
            entityType: 'Student',
            entityId: {
              in: [...new Set(promises.map((p) => String(p.studentId)))],
            },
            OR: [
              { status: { in: OPEN } },
              { createdAt: { gte: todayStart } },
              { closedAt: { gte: todayStart } },
            ],
          },
          select: { entityId: true },
        })
      ).map((t) => t.entityId),
    );
    const byBranch = new Map<number | null, string[]>();
    for (const p of promises) {
      if (handled.has(String(p.studentId))) continue;
      byBranch.set(p.branchId, [...(byBranch.get(p.branchId) ?? []), p.id]);
    }
    for (const [branchId, promiseIds] of byBranch) {
      await this.taskAuto.onPromisesBroken(
        { companyId, branchId, promiseIds },
        now,
      );
    }
  }

  private tashkentHour(now: Date): number {
    return new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
  }
}
