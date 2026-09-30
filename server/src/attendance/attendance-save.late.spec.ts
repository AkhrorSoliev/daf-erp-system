import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceSaveService } from './attendance-save.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';

const lessonDay = new Date('2026-09-28T00:00:00.000Z');
const pending = {
  id: 'u1',
  companyId: 1,
  branchId: 2,
  groupId: 'g1',
  date: lessonDay,
  status: 'PENDING',
  teacherPayExempt: false,
  exemptReason: null,
  claimedById: null,
  taskCommentId: 'c1',
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
};
const entries = [
  { studentId: 10001, status: 'PRESENT' as const },
  { studentId: 10002, status: 'ABSENT' as const },
];

describe('AttendanceSaveService.saveLate', () => {
  let service: AttendanceSaveService;
  let tx: any;
  let prisma: any;
  let billing: { processAttendanceBilling: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    tx = {
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      attendance: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(({ create }: any) =>
          Promise.resolve({
            id: `a-${create.studentId}`,
            studentId: create.studentId,
            status: create.status,
            note: null,
          }),
        ),
        update: jest.fn(),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            studentId: 10001,
            status: 'ACTIVE',
            statusChangedAt: null,
          },
          // left the day after the lesson — still on its register
          {
            id: 'e2',
            studentId: 10002,
            status: 'DROPPED',
            statusChangedAt: new Date('2026-09-29T06:00:00.000Z'),
          },
        ]),
      },
      plannedAbsence: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      commentAssignee: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ca1', seenAt: null }),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }),
      },
    };
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'g1',
          name: '#014',
          branchId: 2,
          course: { paymentModel: 'LESSON_PACK' },
        }),
        // emitAfterSave reads the group's name and teachers.
        findUnique: jest.fn().mockResolvedValue({ name: '#014', teachers: [] }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    billing = { processAttendanceBilling: jest.fn() };
    emitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AttendanceSaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonBillingService, useValue: billing },
        { provide: EventEmitter2, useValue: emitter },
        { provide: AttendanceValidationService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(AttendanceSaveService);
  });

  it('writes the register of who was there that day and answers HELD', async () => {
    const result = await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'HELD',
        decidedById: 3,
        decidedAt: expect.any(Date),
        teacherPayExempt: false,
      },
    });
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    expect(billing.processAttendanceBilling).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ enrollmentId: 'e1', studentId: 10001 }),
    );
    expect(tx.commentAssignee.update).toHaveBeenCalled(); // task taken and closed
    // the answerer holds the task, even without pressing «Ko'rdim» first
    expect(tx.unmarkedLesson.updateMany).toHaveBeenCalledWith({
      where: { taskCommentId: 'c1' },
      data: { claimedById: 3 },
    });
    expect(result.message).toBe(
      'Davomat saqlandi. Ustozga bu dars uchun haq yozilmaydi',
    );
  });

  it('records a departed student but takes no money in a lesson-pack course', async () => {
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    // Both students are on the register …
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    // … but only the active one is billed: the departed one's prepaid lessons
    // were already refunded when they left.
    expect(billing.processAttendanceBilling).toHaveBeenCalledTimes(1);
    expect(billing.processAttendanceBilling).not.toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ studentId: 10002 }),
    );
  });

  it('still bills a departed student in a monthly course', async () => {
    prisma.group.findFirst.mockResolvedValue({
      id: 'g1',
      name: '#014',
      branchId: 2,
      course: { paymentModel: 'MONTHLY' },
    });
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(billing.processAttendanceBilling).toHaveBeenCalledTimes(2);
    expect(billing.processAttendanceBilling).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ enrollmentId: 'e2', studentId: 10002 }),
    );
  });

  it('marks the row HELD before billing, so the accrual lock sees it', async () => {
    const order: string[] = [];
    tx.unmarkedLesson.update.mockImplementation(() => order.push('held'));
    billing.processAttendanceBilling.mockImplementation(() =>
      order.push('bill'),
    );
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(order[0]).toBe('held');
  });

  it('tells the teacher, and never thanks them', async () => {
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(emitter.emit).toHaveBeenCalledWith('unmarked-lesson.held', {
      companyId: 1,
      groupId: 'g1',
      groupName: '#014',
      date: '2026-09-28',
      teacherPayExempt: false,
    });
    expect(emitter.emit).not.toHaveBeenCalledWith(
      'attendance.completed',
      expect.anything(),
    );
  });

  it('needs every student of that day', async () => {
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries: [entries[0]] },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow("barcha o'quvchilarning holati belgilanishi shart");
  });

  it('refuses a lesson that is not waiting for an answer', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({
      ...pending,
      status: 'HELD',
    });
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses when a register already exists', async () => {
    tx.attendance.count.mockResolvedValue(2);
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow('Bu dars uchun davomat allaqachon olingan');
  });

  it('lets only the CEO exempt the teacher', async () => {
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries, teacherPayExempt: true, exemptReason: "Akkaunt yo'q edi" },
        3,
        ['Branch Director'],
        1,
      ),
    ).rejects.toThrow(ForbiddenException);

    prisma.user.findFirst.mockResolvedValue({ id: 1 });
    const result = await service.saveLate(
      'g1',
      '2026-09-28',
      { entries, teacherPayExempt: true, exemptReason: "Akkaunt yo'q edi" },
      1,
      ['CEO'],
      1,
    );
    expect(tx.unmarkedLesson.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'HELD',
        decidedById: 1,
        decidedAt: expect.any(Date),
        teacherPayExempt: true,
        exemptReason: "Akkaunt yo'q edi",
      },
    });
    expect(result.message).toBe('Davomat saqlandi');
  });

  it('keeps a pre-rule lesson exempt', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({
      ...pending,
      teacherPayExempt: true,
    });
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teacherPayExempt: true }),
      }),
    );
  });

  it('refuses an administrator when another holds the task', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({
      ...pending,
      claimedById: 4,
    });
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
