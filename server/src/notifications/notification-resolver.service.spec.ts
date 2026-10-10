import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationResolverService } from './notification-resolver.service';
import { NotificationsGateway } from './notifications.gateway';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskEventTask } from '../tasks/task-events';

const LESSON_KEYS = (day: string) => [
  `LESSON_STARTED:${day}`,
  `ATTENDANCE_ADMIN_ALERT:${day}`,
  `ATTENDANCE_TEACHER_WARNING:${day}`,
  `ATTENDANCE_MISSING_TEACHER:${day}`,
  `ATTENDANCE_MISSING_ADMIN:${day}`,
];

const task = (status: TaskEventTask['status']): TaskEventTask => ({
  id: 't1',
  companyId: 1,
  title: 'Banner',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status,
  participants: [{ userId: 40, role: 'ASSIGNEE' }],
});

const OPEN = { actionRequired: true, resolvedAt: null };

describe('NotificationResolverService', () => {
  let resolver: NotificationResolverService;
  let prisma: any;
  let gateway: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 7 },
          { id: 'n2', userId: 7 },
          { id: 'n3', userId: 8 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null) },
      paymentPromise: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    gateway = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        NotificationResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    resolver = mod.get(NotificationResolverService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const whereOf = (call = 0) =>
    prisma.notification.findMany.mock.calls[call][0].where;

  it("a saved register closes that group's lesson alerts of that day, for every recipient", async () => {
    await resolver.onAttendanceCompleted({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        relatedEntityType: 'Group',
        relatedEntityId: 'g1',
        groupKey: { in: LESSON_KEYS('2026-10-10') },
        ...OPEN,
      },
      select: { id: true, userId: true },
    });
    const update = prisma.notification.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: { in: ['n1', 'n2', 'n3'] },
      resolvedAt: null,
    });
    expect(update.data.resolvedAt).toBeInstanceOf(Date);
    const at = update.data.resolvedAt.toISOString();
    expect(gateway.sendToUser).toHaveBeenCalledWith(7, {
      type: 'notification.resolved',
      ids: ['n1', 'n2'],
      resolvedAt: at,
    });
    expect(gateway.sendToUser).toHaveBeenCalledWith(8, {
      type: 'notification.resolved',
      ids: ['n3'],
      resolvedAt: at,
    });
  });

  it('writes nothing and tells nobody when nothing is open', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await resolver.onAttendanceCompleted({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });

  it('tells nobody when the write changed no row (another resolver got there first)', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const closed = await resolver.resolve({ companyId: 1, taskId: 't1' });
    expect(prisma.notification.updateMany).toHaveBeenCalledTimes(1);
    expect(gateway.sendToUser).not.toHaveBeenCalled();
    expect(closed).toBe(0);
  });

  it('answers with the number of rows it changed', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    expect(await resolver.resolve({ companyId: 1, taskId: 't1' })).toBe(2);
  });

  it('a QR scan, a cancellation and a move (by its original day) close the same alerts', async () => {
    await resolver.onStudentRecorded({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    await resolver.onLessonCancelled({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-11',
    });
    await resolver.onLessonMoved({
      companyId: 1,
      groupId: 'g1',
      originalDate: '2026-10-12',
    });
    expect(whereOf(0).groupKey).toEqual({ in: LESSON_KEYS('2026-10-10') });
    expect(whereOf(1).groupKey).toEqual({ in: LESSON_KEYS('2026-10-11') });
    expect(whereOf(2).groupKey).toEqual({ in: LESSON_KEYS('2026-10-12') });
  });

  it("an answered «Dars bo'ldimi?» also closes the notices of its closed task", async () => {
    prisma.unmarkedLesson.findUnique.mockResolvedValue({
      task: { id: 't9', companyId: 1, status: 'DONE' },
    });
    await resolver.onLessonHeld({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.unmarkedLesson.findUnique).toHaveBeenCalledWith({
      where: {
        groupId_date: {
          groupId: 'g1',
          date: new Date('2026-10-10T00:00:00.000Z'),
        },
      },
      select: { task: { select: { id: true, companyId: true, status: true } } },
    });
    expect(whereOf(1)).toEqual({ companyId: 1, taskId: 't9', ...OPEN });
  });

  it('leaves a lesson task that is still open alone', async () => {
    prisma.unmarkedLesson.findUnique.mockResolvedValue({
      task: { id: 't9', companyId: 1, status: 'IN_PROGRESS' },
    });
    await resolver.onLessonNotHeld({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it("a question closed with no answer (its day lost its lesson, its group went) closes the day's alerts and its task's notices", async () => {
    prisma.unmarkedLesson.findUnique.mockResolvedValue({
      task: { id: 't9', companyId: 1, status: 'DONE' },
    });
    await resolver.onLessonClosed({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-09',
    });
    expect(whereOf(0).groupKey).toEqual({ in: LESSON_KEYS('2026-10-09') });
    expect(whereOf(1)).toEqual({ companyId: 1, taskId: 't9', ...OPEN });
  });

  it('a done or cancelled task closes all its notices; one still open does not', async () => {
    await resolver.onTaskStatus({ task: task('IN_PROGRESS') });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    await resolver.onTaskStatus({ task: task('DONE') });
    await resolver.onTaskCancelled({ task: task('CANCELLED') });
    expect(whereOf(0)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
    expect(whereOf(1)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
  });

  describe('a system task that was just claimed', () => {
    // The first administrator to act takes the task and the others' copies go
    // (`claimSystemTask`); the event carries the participants after the claim.
    const claimed = (over: Partial<TaskEventTask> = {}): TaskEventTask => ({
      ...task('IN_PROGRESS'),
      kind: 'LESSON_QUESTION',
      authorId: null,
      participants: [
        { userId: 40, role: 'ASSIGNEE' },
        { userId: 41, role: 'WATCHER' },
      ],
      ...over,
    });

    it("closes the notices of everyone who is no longer on it, and keeps the claimer's and the watchers'", async () => {
      await resolver.onTaskStatus({ task: claimed() });

      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(whereOf()).toEqual({
        companyId: 1,
        taskId: 't1',
        userId: { notIn: [40, 41] },
        ...OPEN,
      });
      expect(gateway.sendToUser).toHaveBeenCalledWith(7, {
        type: 'notification.resolved',
        ids: ['n1', 'n2'],
        resolvedAt: expect.any(String),
      });
    });

    it('keeps the notices of an author the task has', async () => {
      await resolver.onTaskStatus({ task: claimed({ authorId: 30 }) });

      expect(whereOf().userId).toEqual({ notIn: [40, 41, 30] });
    });

    it('reads nothing for a manual task, whose assignees are changed through UNASSIGNED', async () => {
      await resolver.onTaskStatus({ task: task('IN_PROGRESS') });

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it('never turns an empty participant list into "everyone"', async () => {
      await resolver.onTaskStatus({ task: claimed({ participants: [] }) });

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it("closes all the notices, not just the losers', once the task is done", async () => {
      await resolver.onTaskStatus({ task: claimed({ status: 'DONE' }) });

      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(whereOf()).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
    });
  });

  it("a deleted group closes all its lesson alerts, whatever the day, and tells each recipient's bells", async () => {
    await resolver.onGroupDeleted({ companyId: 1, groupId: 'g1' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        relatedEntityType: 'Group',
        relatedEntityId: 'g1',
        type: {
          in: [
            'LESSON_STARTED',
            'ATTENDANCE_ADMIN_ALERT',
            'ATTENDANCE_TEACHER_WARNING',
            'ATTENDANCE_MISSING_TEACHER',
            'ATTENDANCE_MISSING_ADMIN',
          ],
        },
        ...OPEN,
      },
      select: { id: true, userId: true },
    });
    expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
    expect(gateway.sendToUser).toHaveBeenCalledWith(8, {
      type: 'notification.resolved',
      ids: ['n3'],
      resolvedAt: expect.any(String),
    });
  });

  it('a deleted group with nothing open, or nothing changed, tells nobody', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await resolver.onGroupDeleted({ companyId: 1, groupId: 'g1' });

    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });

  it('a review answer ends the review request; accepting closes the rest too', async () => {
    await resolver.onTaskReviewed({ task: task('IN_PROGRESS') });
    expect(whereOf(0)).toEqual({
      companyId: 1,
      taskId: 't1',
      type: 'TASK_REVIEW',
      ...OPEN,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    await resolver.onTaskReviewed({ task: task('DONE') });
    expect(whereOf(2)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
  });

  it("closes a removed assignee's notices of that task only", async () => {
    await resolver.onTaskUnassigned({ task: task('NEW'), userIds: [40, 41] });
    expect(whereOf()).toEqual({
      companyId: 1,
      taskId: 't1',
      userId: { in: [40, 41] },
      ...OPEN,
    });
  });

  it('a payment that clears the debt closes the overdue-promise alert; one that leaves debt does not', async () => {
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: -5000,
    });
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: null,
    });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: 0,
    });
    expect(whereOf()).toEqual({
      companyId: 1,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'Student',
      relatedEntityId: '10001',
      ...OPEN,
    });
  });

  describe('the 09:00 broken-promise list', () => {
    // The cron flipped these promises at 09:00 Tashkent on 10.10 (04:00 UTC).
    const MORNING = new Date('2026-10-10T04:00:00.000Z');
    const DAY = {
      gte: new Date('2026-10-09T19:00:00.000Z'),
      lt: new Date('2026-10-10T19:00:00.000Z'),
    };
    const LIST = {
      companyId: 1,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'BrokenPromises',
    };
    // By default a payment that leaves debt, so the legacy per-student rule
    // stays out of the way and only the list rule runs.
    const paid = (studentBalance: number | null = -5_000) =>
      resolver.onPaymentReceived({
        companyId: 1,
        studentId: 10001,
        studentBalance,
      });

    it('closes the list for every recipient when the last listed student pays', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(-300);

      expect(prisma.paymentPromise.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          studentId: 10001,
          status: 'BROKEN',
          reminderFiredAt: { not: null },
        },
        select: { branchId: true, reminderFiredAt: true },
      });
      expect(prisma.paymentPromise.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 1,
          branchId: 3,
          status: 'BROKEN',
          reminderFiredAt: DAY,
          student: { balance: { lte: -MIN_ALERT_DEBT } },
        },
        select: { id: true },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
      expect(whereOf()).toEqual({
        ...LIST,
        relatedEntityId: '3',
        createdAt: DAY,
        ...OPEN,
      });
      expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('leaves the list open while another listed student still owes', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);
      prisma.paymentPromise.findFirst.mockResolvedValue({ id: 'p2' });

      await paid();

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('counts a student as owing only from MIN_ALERT_DEBT (a smaller debt was never listed)', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(-MIN_ALERT_DEBT + 1);

      const { student } =
        prisma.paymentPromise.findFirst.mock.calls[0][0].where;
      expect(MIN_ALERT_DEBT).toBe(1_000);
      expect(student).toEqual({ balance: { lte: -1_000 } });
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    });

    it("the 'all' key is the promises with no branch", async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: null, reminderFiredAt: MORNING },
      ]);

      await paid();

      expect(prisma.paymentPromise.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ companyId: 1, branchId: null }),
      );
      expect(whereOf().relatedEntityId).toBe('all');
    });

    it('asks once per list: one branch, one Tashkent day; another day or branch is another list', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        // 00:30 and 23:59 Tashkent on 10.10 — the same day, though two UTC days
        { branchId: 3, reminderFiredAt: new Date('2026-10-09T19:30:00.000Z') },
        { branchId: 3, reminderFiredAt: new Date('2026-10-10T18:59:00.000Z') },
        { branchId: 3, reminderFiredAt: new Date('2026-10-03T04:00:00.000Z') },
        { branchId: 4, reminderFiredAt: MORNING },
      ]);

      await paid();

      expect(prisma.paymentPromise.findFirst).toHaveBeenCalledTimes(3);
      expect(prisma.notification.findMany).toHaveBeenCalledTimes(3);
      expect(
        prisma.notification.findMany.mock.calls.map(
          (c: any) => c[0].where.relatedEntityId,
        ),
      ).toEqual(['3', '3', '4']);
    });

    it('a student with no broken promise closes no list', async () => {
      await paid();

      expect(prisma.paymentPromise.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    });

    it('a legacy per-student row still closes when the debt is cleared, beside the list', async () => {
      prisma.paymentPromise.findMany.mockResolvedValue([
        { branchId: 3, reminderFiredAt: MORNING },
      ]);

      await paid(0);

      expect(whereOf(0)).toEqual({
        companyId: 1,
        type: 'PAYMENT_PROMISE_OVERDUE',
        relatedEntityType: 'Student',
        relatedEntityId: '10001',
        ...OPEN,
      });
      expect(whereOf(1).relatedEntityType).toBe('BrokenPromises');
    });

    it('a failing lookup is logged and never thrown', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      prisma.paymentPromise.findMany.mockRejectedValue(new Error('db down'));

      await expect(paid()).resolves.toBeUndefined();
    });

    describe('a newer list of the branch', () => {
      const sent = (branchId: number | null) =>
        resolver.onPromiseListSent({
          companyId: 1,
          branchId,
          promiseIds: ['a'],
        });

      beforeEach(() => {
        jest.useFakeTimers({ now: MORNING });
      });

      it("closes the branch's older open lists and never this morning's", async () => {
        await sent(3);

        expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
        expect(whereOf()).toEqual({
          ...LIST,
          relatedEntityId: '3',
          // before today's Tashkent start, so the rows of this very run stay
          createdAt: { lt: DAY.gte },
          ...OPEN,
        });
        expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
      });

      it('leaves another branch alone; no branch is the key all', async () => {
        await sent(null);

        expect(whereOf().relatedEntityId).toBe('all');
      });

      it('draws the day line at Tashkent midnight, not the process clock', async () => {
        jest.setSystemTime(new Date('2026-10-09T20:30:00.000Z')); // 01:30 on 10.10

        await sent(3);

        expect(whereOf().createdAt).toEqual({ lt: DAY.gte });
      });

      it('writes nothing when the branch has no older list open', async () => {
        prisma.notification.findMany.mockResolvedValue([]);

        await sent(3);

        expect(prisma.notification.updateMany).not.toHaveBeenCalled();
        expect(gateway.sendToUser).not.toHaveBeenCalled();
      });
    });
  });

  it('never throws out of a listener', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    prisma.notification.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      resolver.onAttendanceCompleted({
        companyId: 1,
        groupId: 'g1',
        date: '2026-10-10',
      }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the write fails either', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    prisma.notification.updateMany.mockRejectedValue(new Error('db down'));
    await expect(
      resolver.resolve({ companyId: 1, taskId: 't1' }),
    ).resolves.toBe(0);
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });
});
