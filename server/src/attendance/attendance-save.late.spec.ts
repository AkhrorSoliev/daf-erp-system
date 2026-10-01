import { Test } from '@nestjs/testing';
import {
  BadRequestException,
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
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import type { SaveAttendanceDto } from './dto/save-attendance.dto';
import { ENDED_REFUSAL } from './shared/attendance-window';

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
  let history: { recordCreate: jest.Mock };
  let admission: { forLesson: jest.Mock };
  // Read only by the form's register (`save`).
  let validation: { validateLessonDate: jest.Mock };

  // The history row's teacher-pay line.
  const payNote = () =>
    history.recordCreate.mock.calls[0][0].newValues.ustozHaqi;

  beforeEach(async () => {
    tx = {
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      attendance: {
        count: jest.fn().mockResolvedValue(0),
        // The form's register reads the rows already there (none).
        findMany: jest.fn().mockResolvedValue([]),
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
      // Departed students' months that gave the day back (none by default).
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findFirst: jest.fn().mockResolvedValue(null) },
      lessonReschedule: {
        findMany: jest.fn().mockResolvedValue([]),
        // A live move landing on the day (none by default).
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // The group's weekdays, read inside the transaction: 28.09 is a Monday.
      group: {
        findUnique: jest.fn().mockResolvedValue({
          exactDays: ['monday', 'wednesday', 'friday'],
          scheduleSnapshots: [],
        }),
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
      // The name of a student contract 3.2 refuses.
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Aziz', lastName: 'Karimov' }),
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
    // Contract 3.2: everybody admitted unless a test says otherwise.
    admission = { forLesson: jest.fn().mockResolvedValue(new Map()) };
    validation = {
      validateLessonDate: jest.fn().mockResolvedValue({
        parsedDate: lessonDay,
        effectiveStartTime: '16:00',
        effectiveEndTime: '17:30',
        opensMinutesBefore: 10,
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttendanceSaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonBillingService, useValue: billing },
        { provide: LessonAdmissionService, useValue: admission },
        { provide: EventEmitter2, useValue: emitter },
        { provide: AttendanceValidationService, useValue: validation },
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
    history = module.get(EntityHistoryService);
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

  it("writes the register as sent: «Bo'ldi» records no late minutes (ADR-0048)", async () => {
    await service.saveLate(
      'g1',
      '2026-09-28',
      {
        entries: [
          { studentId: 10001, status: 'LATE' },
          { studentId: 10002, status: 'PRESENT' },
        ],
      },
      3,
      ['Administrator'],
      1,
    );
    expect(
      tx.attendance.upsert.mock.calls.map((c: any) => c[0].create),
    ).toEqual([
      expect.objectContaining({ status: 'LATE', lateMinutes: null }),
      expect.objectContaining({ status: 'PRESENT', lateMinutes: null }),
    ]);
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

  it('does not bill a departed student for a day their departure gave back', async () => {
    // A trial lesson (3.5) or a quality claim returned his whole month: the
    // teacher must not be paid for it from that month, CEO exemption or not.
    prisma.group.findFirst.mockResolvedValue({
      id: 'g1',
      name: '#014',
      branchId: 2,
      course: { paymentModel: 'MONTHLY' },
    });
    tx.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      { enrollmentId: 'e2' },
    ]);
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(tx.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith({
      where: {
        enrollmentId: { in: ['e2'] },
        periodYear: 2026,
        periodMonth: 9,
        status: 'CHARGED',
        frozenOutDates: { has: '2026-09-28' },
      },
      select: { enrollmentId: true },
    });
    // He stays on the register …
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    // … but only the active student is billed.
    expect(billing.processAttendanceBilling).toHaveBeenCalledTimes(1);
    expect(billing.processAttendanceBilling).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ enrollmentId: 'e1', studentId: 10001 }),
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

  it('refuses a day the calendar does not have with 400', async () => {
    await expect(
      service.saveLate(
        'g1',
        '2026-13-45',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow("Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting");
    expect(prisma.group.findFirst).not.toHaveBeenCalled();
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

  // CEO 30.09 (D2): contract 3.2 holds in «Bo'ldi» too. Whether the rule
  // applies to the day is `forLesson`'s business (mocked here); 10001 is the
  // month's 2nd lesson's unpaid student.
  describe('contract 3.2 (D2)', () => {
    const NOT_PAID =
      "Aziz Karimov to'lov qilmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi";
    const late = (register: SaveAttendanceDto['entries']) =>
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries: register },
        3,
        ['Administrator'],
        1,
      );

    beforeEach(() => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10001,
            {
              admitted: false,
              reason: 'NOT_PAID',
              shortfall: 69231,
              paidThrough: null,
            },
          ],
        ]),
      );
    });

    it.each(['PRESENT', 'LATE', 'ABSENT'] as const)(
      'refuses him marked %s, by name, before anything is written',
      async (status) => {
        await expect(
          late([{ studentId: 10001, status }, entries[1]]),
        ).rejects.toThrow(NOT_PAID);
        expect(tx.student.findUnique).toHaveBeenCalledWith({
          where: { id: 10001 },
          select: { firstName: true, lastName: true },
        });
        expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
        expect(tx.attendance.upsert).not.toHaveBeenCalled();
      },
    );

    it('takes him EXCUSED with the rest of the register', async () => {
      await late([{ studentId: 10001, status: 'EXCUSED' }, entries[1]]);
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
      // His name is read only to refuse him.
      expect(tx.student.findUnique).not.toHaveBeenCalled();
    });

    it('takes the rest of the register without him', async () => {
      await late([entries[1]]);
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(1);
      expect(tx.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ studentId: 10002 }),
        }),
      );
    });

    it('with a CEO exemption the others accrue and he does not', async () => {
      // A monthly course bills the departed 10002 too.
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        name: '#014',
        branchId: 2,
        course: { paymentModel: 'MONTHLY' },
      });
      prisma.user.findFirst.mockResolvedValue({ id: 1 });
      await service.saveLate(
        'g1',
        '2026-09-28',
        {
          entries: [{ studentId: 10002, status: 'PRESENT' }],
          teacherPayExempt: true,
          exemptReason: "Akkaunt yo'q edi",
        },
        1,
        ['CEO'],
        1,
      );
      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ teacherPayExempt: true }),
        }),
      );
      expect(billing.processAttendanceBilling).toHaveBeenCalledTimes(1);
      expect(billing.processAttendanceBilling).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ studentId: 10002, newStatus: 'PRESENT' }),
      );
    });

    it('admits him once he has paid, judged inside the transaction', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([
          [
            10001,
            { admitted: true, reason: 'PAID', shortfall: 0, paidThrough: null },
          ],
        ]),
      );
      await late(entries);
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
      // Over the roster of THAT day (the departed 10002 included), read with
      // the transaction's client.
      expect(admission.forLesson).toHaveBeenCalledWith(
        { groupId: 'g1', lessonDay: '2026-09-28', studentIds: [10001, 10002] },
        tx,
      );
    });
  });

  // After the end no role opens a new register in the form (ADR-0054, D1);
  // the same lesson goes through «Bo'ldi».
  describe('a new register after the lesson ended', () => {
    beforeEach(() => {
      // 18:00 Tashkent; the lesson ran 16:00–17:30.
      jest.useFakeTimers({
        now: new Date('2026-09-28T13:00:00.000Z'),
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
    });
    afterEach(() => jest.useRealTimers());

    it.each(['CEO', 'Branch Director', 'Administrator'])(
      "is refused for %s with the «Dars bo'ldimi?» text",
      async (role) => {
        await expect(
          service.save('g1', '2026-09-28', { entries }, 3, [role], 1),
        ).rejects.toMatchObject({ message: ENDED_REFUSAL });
        expect(tx.attendance.upsert).not.toHaveBeenCalled();
      },
    );

    it("is refused for a teacher with the teacher's own text", async () => {
      await expect(
        service.save('g1', '2026-09-28', { entries }, 3, ['Teacher'], 1),
      ).rejects.toMatchObject({
        message:
          "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini administrator belgilaydi.",
      });
      expect(tx.attendance.upsert).not.toHaveBeenCalled();
    });

    it("goes through «Bo'ldi» instead", async () => {
      await expect(
        service.saveLate(
          'g1',
          '2026-09-28',
          { entries },
          3,
          ['Administrator'],
          1,
        ),
      ).resolves.toMatchObject({ count: 2 });
    });
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

  // A cancellation or move committed after the question opened: «Bo'ldi»
  // would refund an EXCUSED student twice (monthly) or bill a cancelled
  // lesson (pack).
  it('refuses a lesson cancelled since the question opened', async () => {
    tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'x1' });
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow("Bu dars bekor qilingan — davomat kiritib bo'lmaydi");
    expect(tx.lessonCancellation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'g1', date: lessonDay, deletedAt: null },
      }),
    );
    expect(tx.attendance.upsert).not.toHaveBeenCalled();
    expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
  });

  it('refuses a lesson moved to another day since the question opened', async () => {
    tx.lessonReschedule.findMany.mockResolvedValue([
      {
        originalDate: lessonDay,
        newDate: new Date('2026-10-02T00:00:00.000Z'),
      },
    ]);
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow(
      "Bu sana boshqa kunga ko'chirilgan — davomatni yangi sanada oling",
    );
    expect(tx.attendance.upsert).not.toHaveBeenCalled();
  });

  // The move that made the day a lesson day was deleted or re-dated and its
  // question outlived it: a register would bill a lesson the timetable never
  // had, while the moved lesson is asked about on its own day.
  describe('a day with no lesson on the timetable', () => {
    // 28.09 is a Monday; the group meets on Tuesdays now.
    const tuesdays = (scheduleSnapshots: object[] = []) =>
      tx.group.findUnique.mockResolvedValue({
        exactDays: ['tuesday'],
        scheduleSnapshots,
      });

    beforeEach(() => tuesdays());

    it('is refused with 400', async () => {
      const answer = service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      );
      await expect(answer).rejects.toBeInstanceOf(BadRequestException);
      await expect(answer).rejects.toThrow('Bu kunda dars rejalashtirilmagan');
      // The weekdays and their history are read inside the transaction.
      expect(tx.group.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          select: expect.objectContaining({
            exactDays: true,
            scheduleSnapshots: expect.anything(),
          }),
        }),
      );
      expect(tx.lessonReschedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 'g1', newDate: lessonDay, deletedAt: null },
        }),
      );
      expect(tx.attendance.upsert).not.toHaveBeenCalled();
      expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
    });

    // Mondays until 29.09, Tuesdays since: the group calendar still shows
    // 28.09 as a lesson (the schedule in force that day), and so must «Bo'ldi».
    it('takes the register on a weekday the group met on that day', async () => {
      tuesdays([
        {
          exactDays: ['monday', 'wednesday', 'friday'],
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: new Date('2026-09-29T07:00:00.000Z'),
        },
        {
          exactDays: ['tuesday'],
          validFrom: new Date('2026-09-29T07:00:00.000Z'),
          validTo: null,
        },
      ]);
      await service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      );
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    });

    // The recorded history starts after the lesson: that day's weekdays are
    // unknown, and the guard refuses only a day it knows had no lesson.
    it('takes the register on a day before the recorded schedule history', async () => {
      tuesdays([
        {
          exactDays: ['tuesday'],
          validFrom: new Date('2026-09-29T07:00:00.000Z'),
          validTo: null,
        },
      ]);
      await service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      );
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    });

    it('takes the register when a live move lands on it', async () => {
      tx.lessonReschedule.findFirst.mockResolvedValue({ id: 'r1' });
      await service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      );
      expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    });
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
    expect(payNote()).toBe('yoziladi (CEO istisnosi)');
  });

  it('keeps a pre-rule lesson exempt', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({
      ...pending,
      teacherPayExempt: true,
      exemptReason: 'Qoida kuchga kirishidan oldingi dars (ADR-0054)',
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
    // The CEO never touched it: the history names the row's own reason.
    expect(payNote()).toBe(
      'yoziladi (Qoida kuchga kirishidan oldingi dars (ADR-0054))',
    );
  });

  it('records that a forfeited lesson pays nothing', async () => {
    await service.saveLate(
      'g1',
      '2026-09-28',
      { entries },
      3,
      ['Administrator'],
      1,
    );
    expect(payNote()).toBe('yozilmaydi');
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

  // The sweep adds a Serializable writer at :00/:30; losing to it is a 409.
  it('answers a transaction conflict with 409, anything else unchanged', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toThrow(
      new ConflictException(
        "Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring",
      ),
    );

    const boom = new Error('boom');
    prisma.$transaction.mockRejectedValueOnce(boom);
    await expect(
      service.saveLate(
        'g1',
        '2026-09-28',
        { entries },
        3,
        ['Administrator'],
        1,
      ),
    ).rejects.toBe(boom);
  });
});
