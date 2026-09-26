import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusCascadeService } from './status-cascade.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';
import { EnrollmentBillingService } from '../../billing/enrollment-billing.service';
import { MonthlyChargeService } from '../../billing/monthly-charge.service';

const EARLIER = new Date('2026-08-01T09:00:00.000Z');

/** An enrollment of group `group-1` with every field the cascade reads. */
const row = (
  id: string,
  studentId: number,
  status: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  studentId,
  groupId: 'group-1',
  status,
  deletedAt: null as Date | null,
  statusChangedAt: EARLIER,
  statusChangedById: 3,
  statusChangeReason: 'earlier change',
  student: {
    firstName: `Ism${studentId}`,
    lastName: `Familiya${studentId}`,
  },
  group: {
    name: '#014',
    companyId: 1001,
    branchId: 1,
    courseId: 'course-1',
    course: { paymentModel: 'LESSON_PACK' },
  },
  ...extra,
});

/** An enrollment of `group-2`, which is in another branch and course. */
const otherGroupRow = (id: string, studentId: number, status: string) =>
  row(id, studentId, status, {
    groupId: 'group-2',
    group: {
      name: '#020',
      companyId: 1001,
      branchId: 2,
      courseId: 'course-2',
      course: { paymentModel: 'LESSON_PACK' },
    },
  });

/** The `where` fields the fake below understands. */
interface FakeWhere {
  groupId?: string;
  studentId?: number;
  deletedAt?: Date | null;
  status?: string | { in: string[] };
  group?: { branchId?: number; courseId?: string };
}

// Stands in for the enrollment tables of a Prisma client or a transaction. It
// applies the `where` fields the cascade filters on — and refuses any other —
// so which enrollments were closed is read back from the rows, not from the
// shape of the query.
const makeTx = (rows: ReturnType<typeof row>[]) => {
  const stateLog: Record<string, unknown>[] = [];
  const matches = (e: ReturnType<typeof row>, where: FakeWhere) => {
    for (const key of Object.keys(where)) {
      if (
        !['groupId', 'studentId', 'deletedAt', 'status', 'group'].includes(key)
      ) {
        throw new Error(`fake tx: unsupported where.${key}`);
      }
    }
    const group = where.group ?? {};
    for (const key of Object.keys(group)) {
      if (key !== 'branchId' && key !== 'courseId') {
        throw new Error(`fake tx: unsupported where.group.${key}`);
      }
      if (e.group[key] !== group[key]) return false;
    }
    const status = where.status;
    const statusOk =
      status === undefined ||
      (typeof status === 'string'
        ? e.status === status
        : status.in.includes(e.status));
    return (
      (where.groupId === undefined || e.groupId === where.groupId) &&
      (where.studentId === undefined || e.studentId === where.studentId) &&
      (where.deletedAt === undefined || e.deletedAt === where.deletedAt) &&
      statusOk
    );
  };
  const tx = {
    enrollment: {
      findMany: jest.fn(({ where }: { where: FakeWhere }) =>
        Promise.resolve(rows.filter((e) => matches(e, where))),
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: FakeWhere; data: object }) => {
          const hit = rows.filter((e) => matches(e, where));
          hit.forEach((e) => Object.assign(e, data));
          return Promise.resolve({ count: hit.length });
        },
      ),
      count: jest.fn(({ where }: { where: FakeWhere }) =>
        Promise.resolve(rows.filter((e) => matches(e, where)).length),
      ),
    },
    enrollmentStateLog: {
      createMany: jest.fn(({ data }: { data: Record<string, unknown>[] }) => {
        stateLog.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
  };
  const byId = (id: string) => rows.find((r) => r.id === id)!;
  return { tx, byId, stateLog };
};

describe('StatusCascadeService', () => {
  let service: StatusCascadeService;
  let prisma: any;
  let entityHistoryService: any;
  let enrollmentBillingService: any;
  let monthlyChargeService: any;

  const mockEnrollmentWithStudent = [
    {
      id: 'enr-1',
      groupId: 'group-1',
      group: {
        name: '#001',
        companyId: 1001,
        course: { paymentModel: 'MONTHLY' },
      },
      student: { firstName: 'Ali', lastName: 'Valiyev' },
    },
  ];

  beforeEach(async () => {
    prisma = {
      group: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      enrollment: {
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      room: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      statusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
      },
      enrollmentStateLog: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    entityHistoryService = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordUpdate: jest.fn().mockResolvedValue(undefined),
      recordDelete: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordRestore: jest.fn().mockResolvedValue(undefined),
    };

    enrollmentBillingService = {
      refundPrepaidToBalance: jest
        .fn()
        .mockResolvedValue({ refunded: 0, lessons: 0 }),
    };

    monthlyChargeService = {
      reverseChargeForDeparture: jest.fn().mockResolvedValue(null),
      restoreChargeForReturn: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusCascadeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        {
          provide: EnrollmentBillingService,
          useValue: enrollmentBillingService,
        },
        { provide: MonthlyChargeService, useValue: monthlyChargeService },
      ],
    }).compile();

    service = module.get(StatusCascadeService);
  });

  // ─── Branch cascades ───────────────────────────────
  describe('Branch cascades', () => {
    it('CLOSED: cancels groups, drops enrollments, archives rooms', async () => {
      const results = await service.cascade('Branch', '1', 'CLOSED', 1);

      expect(prisma.group.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 1 }),
          data: expect.objectContaining({
            statusEnum: 'CANCELLED',
            isActive: false,
          }),
        }),
      );

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DROPPED' }),
        }),
      );

      expect(prisma.room.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ branchId: 1 }),
          data: expect.objectContaining({ status: 'ARCHIVED' }),
        }),
      );

      expect(results).toHaveLength(3);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entity: 'Group', toStatus: 'CANCELLED' }),
          expect.objectContaining({
            entity: 'Enrollment',
            toStatus: 'DROPPED',
          }),
          expect.objectContaining({ entity: 'Room', toStatus: 'ARCHIVED' }),
        ]),
      );
    });

    it('ARCHIVED: same cascade as CLOSED', async () => {
      await service.cascade('Branch', '1', 'ARCHIVED', 1);

      expect(prisma.group.updateMany).toHaveBeenCalled();
      expect(prisma.enrollment.updateMany).toHaveBeenCalled();
      expect(prisma.room.updateMany).toHaveBeenCalled();
    });

    it('INACTIVE: pauses active groups only, no enrollment/room cascade', async () => {
      const results = await service.cascade('Branch', '1', 'INACTIVE', 1);

      expect(prisma.group.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusEnum: 'PAUSED' }),
        }),
      );

      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(prisma.room.updateMany).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('ACTIVE: no cascade', async () => {
      const results = await service.cascade('Branch', '1', 'ACTIVE', 1);

      expect(prisma.group.updateMany).not.toHaveBeenCalled();
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(prisma.room.updateMany).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
  });

  // ─── Course cascades ───────────────────────────────
  describe('Course cascades', () => {
    it('ARCHIVED: cancels groups and drops enrollments', async () => {
      const results = await service.cascade(
        'Course',
        'course-1',
        'ARCHIVED',
        1,
      );

      expect(prisma.group.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ courseId: 'course-1' }),
          data: expect.objectContaining({ statusEnum: 'CANCELLED' }),
        }),
      );

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DROPPED' }),
        }),
      );

      expect(results).toHaveLength(2);
    });

    it('ACTIVE: no cascade', async () => {
      const results = await service.cascade('Course', 'course-1', 'ACTIVE', 1);
      expect(results).toHaveLength(0);
    });
  });

  // ─── Group cascades ────────────────────────────────
  describe('Group cascades', () => {
    it('CANCELLED: drops active enrollments', async () => {
      const results = await service.cascade('Group', 'group-1', 'CANCELLED', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ groupId: 'group-1' }),
          data: expect.objectContaining({ status: 'DROPPED' }),
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entity: 'Enrollment',
        toStatus: 'DROPPED',
      });
    });

    it('CANCELLED: logs each transition at the moment stamped on the enrollment', async () => {
      prisma.enrollment.findMany.mockResolvedValue(mockEnrollmentWithStudent);

      await service.cascade('Group', 'group-1', 'CANCELLED', 1);

      const { statusChangedAt } =
        prisma.enrollment.updateMany.mock.calls[0][0].data;
      const [logged] =
        prisma.enrollmentStateLog.createMany.mock.calls[0][0].data;
      expect(statusChangedAt).toBeInstanceOf(Date);
      // Same instant: a report replaying the log agrees with the row.
      expect(logged.transitionAt).toBe(statusChangedAt);
    });

    it('COMPLETED: completes enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([]);

      const results = await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity: 'Enrollment',
            toStatus: 'COMPLETED',
          }),
        ]),
      );
    });

    it('COMPLETED: auto-graduates students with no remaining active enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        row('enr-100', 100, 'COMPLETED'),
        row('enr-101', 101, 'COMPLETED'),
      ]);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.student.findFirst.mockResolvedValue({
        id: 100,
        status: 'ACTIVE',
        companyId: 1,
      });

      const results = await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'GRADUATED',
            isActive: false,
          }),
        }),
      );

      expect(prisma.statusHistory.create).toHaveBeenCalled();

      // Student entity history ham yozilishi kerak
      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          oldValues: { status: 'ACTIVE' },
          newValues: expect.objectContaining({ status: 'GRADUATED' }),
        }),
      );

      const graduatedResults = results.filter(
        (r) => r.entity === 'Student' && r.toStatus === 'GRADUATED',
      );
      expect(graduatedResults.length).toBeGreaterThanOrEqual(1);
    });

    it('COMPLETED: does NOT graduate students who have other active enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        row('enr-100', 100, 'COMPLETED'),
      ]);
      prisma.enrollment.count.mockResolvedValue(2);

      await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.statusHistory.create).not.toHaveBeenCalled();
      expect(entityHistoryService.recordStatusChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({ status: 'GRADUATED' }),
        }),
      );
    });

    it('PAUSED: no cascade', async () => {
      const results = await service.cascade('Group', 'group-1', 'PAUSED', 1);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
  });

  // ─── Closing a group, branch or course ────────────
  describe('closing a group, branch or course', () => {
    // Group 1 with every kind of enrollment, and group 2 (another branch and
    // course) with open enrollments of its own.
    const closingFixture = () =>
      makeTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
        row('enr-dropped', 103, 'DROPPED'),
        row('enr-completed', 105, 'COMPLETED'),
        row('enr-archived', 106, 'FROZEN', { deletedAt: EARLIER }),
        otherGroupRow('enr-other-active', 107, 'ACTIVE'),
        otherGroupRow('enr-other-frozen', 108, 'FROZEN'),
      ]);

    const expectUntouched = (store: ReturnType<typeof makeTx>) => {
      expect(store.byId('enr-dropped')).toMatchObject({
        status: 'DROPPED',
        statusChangedAt: EARLIER,
      });
      expect(store.byId('enr-completed').status).toBe('COMPLETED');
      expect(store.byId('enr-archived').status).toBe('FROZEN');
      expect(store.byId('enr-other-active').status).toBe('ACTIVE');
      expect(store.byId('enr-other-frozen').status).toBe('FROZEN');
    };

    it("Group CANCELLED drops the group's ACTIVE and FROZEN enrollments, and no one else's", async () => {
      const store = closingFixture();
      Object.assign(prisma, store.tx);

      await service.cascade('Group', 'group-1', 'CANCELLED', 7);

      for (const id of ['enr-active', 'enr-frozen']) {
        expect(store.byId(id)).toMatchObject({
          status: 'DROPPED',
          statusChangedById: 7,
        });
      }
      expectUntouched(store);
      expect(
        store.stateLog.map((l) => [l.enrollmentId, l.status]).sort(),
      ).toEqual([
        ['enr-active', 'DROPPED'],
        ['enr-frozen', 'DROPPED'],
      ]);
    });

    it('Group COMPLETED completes its ACTIVE enrollments and drops its FROZEN ones', async () => {
      const store = closingFixture();
      Object.assign(prisma, store.tx);

      await service.cascade('Group', 'group-1', 'COMPLETED', 7);

      expect(store.byId('enr-active')).toMatchObject({
        status: 'COMPLETED',
        statusChangedById: 7,
      });
      expect(store.byId('enr-frozen')).toMatchObject({
        status: 'DROPPED',
        statusChangedById: 7,
      });
      expectUntouched(store);
      expect(
        store.stateLog.map((l) => [l.enrollmentId, l.status]).sort(),
      ).toEqual([
        ['enr-active', 'COMPLETED'],
        ['enr-frozen', 'DROPPED'],
      ]);
    });

    it('Group COMPLETED never graduates a student whose enrollment was frozen', async () => {
      const store = makeTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);
      Object.assign(prisma, store.tx);
      // Both are ACTIVE students with no other group — the frozen one came
      // back while the group was paused, which leaves the enrollment FROZEN.
      prisma.student.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, status: 'ACTIVE', companyId: 1001 }),
      );

      await service.cascade('Group', 'group-1', 'COMPLETED', 7);

      expect(
        prisma.student.update.mock.calls.map(([arg]: any) => arg.where.id),
      ).toEqual([101]);
    });

    it.each([
      ['Branch', '1', 'CLOSED'],
      ['Branch', '1', 'ARCHIVED'],
      ['Course', 'course-1', 'ARCHIVED'],
    ])(
      "%s %s → %s drops the ACTIVE and FROZEN enrollments of its groups, and no one else's",
      async (entityType, entityId, newStatus) => {
        const store = closingFixture();
        Object.assign(prisma, store.tx);

        await service.cascade(entityType, entityId, newStatus, 7);

        for (const id of ['enr-active', 'enr-frozen']) {
          expect(store.byId(id)).toMatchObject({
            status: 'DROPPED',
            statusChangedById: 7,
          });
        }
        expectUntouched(store);
      },
    );

    it.each([
      ['Group', 'group-1', 'CANCELLED', "Guruh to'xtatildi"],
      ['Branch', '1', 'CLOSED', 'Filial yopildi'],
      ['Branch', '1', 'ARCHIVED', 'Filial arxivlandi'],
      ['Course', 'course-1', 'ARCHIVED', 'Kurs arxivlandi'],
    ])(
      '%s %s → %s writes each removal to the student and to the group',
      async (entityType, entityId, newStatus, sabab) => {
        const store = makeTx([
          row('enr-active', 101, 'ACTIVE'),
          row('enr-frozen', 102, 'FROZEN'),
        ]);
        Object.assign(prisma, store.tx);

        await service.cascade(entityType, entityId, newStatus, 7);

        const written = entityHistoryService.recordDelete.mock.calls.map(
          ([p]: [Record<string, unknown>]) => p,
        );
        expect(written).toHaveLength(4);
        for (const studentId of [101, 102]) {
          expect(written).toContainEqual({
            entityType: 'Student',
            entityId: studentId,
            oldValues: {
              guruh: '#014',
              guruhId: 'group-1',
              action: 'GURUHDAN_CHIQARILDI',
              sabab,
            },
            changedById: 7,
            companyId: 1001,
          });
          expect(written).toContainEqual({
            entityType: 'Group',
            entityId: 'group-1',
            oldValues: {
              action: 'OQUVCHI_CHIQARILDI',
              oquvchi: `Ism${studentId} Familiya${studentId}`,
              oquvchiId: studentId,
              sabab,
            },
            changedById: 7,
            companyId: 1001,
          });
        }
      },
    );

    it.each([
      ['Group', 'group-1', 'CANCELLED'],
      ['Group', 'group-1', 'COMPLETED'],
      ['Branch', '1', 'CLOSED'],
      ['Course', 'course-1', 'ARCHIVED'],
    ])(
      "%s %s → %s gives a FROZEN enrollment's unused money back like any other closure",
      async (entityType, entityId, newStatus) => {
        const store = makeTx([row('enr-frozen', 102, 'FROZEN')]);
        Object.assign(prisma, store.tx);

        await service.cascade(entityType, entityId, newStatus, 7);

        expect(
          enrollmentBillingService.refundPrepaidToBalance,
        ).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            enrollmentId: 'enr-frozen',
            performedById: 7,
          }),
        );
        expect(
          monthlyChargeService.reverseChargeForDeparture,
        ).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            enrollmentId: 'enr-frozen',
            companyId: 1001,
            performedById: 7,
          }),
        );
      },
    );

    it('Group COMPLETED writes each completion to the student alone, and each frozen removal to the student and the group', async () => {
      const store = makeTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
      ]);
      Object.assign(prisma, store.tx);

      await service.cascade('Group', 'group-1', 'COMPLETED', 7);

      // No `status` key: the 'entity.status.changed' listeners read it as the
      // student's own status and would post a system comment and a Telegram
      // digest line for a change the student never had.
      expect(
        entityHistoryService.recordStatusChange.mock.calls.map(([p]: any) => p),
      ).toEqual([
        {
          entityType: 'Student',
          entityId: 101,
          oldValues: { statusEnum: 'ACTIVE' },
          newValues: {
            statusEnum: 'COMPLETED',
            guruhId: 'group-1',
            action: 'GURUH_TUGALLANDI',
            sabab: '«#014» guruhi tugallandi',
          },
          changedById: 7,
          companyId: 1001,
        },
      ]);
      expect(
        entityHistoryService.recordDelete.mock.calls.map(([p]: any) => [
          p.entityType,
          p.entityId,
          p.oldValues.sabab,
        ]),
      ).toEqual([
        ['Student', 102, "Guruh tugallandi, o'quvchi muzlatilgan edi"],
        ['Group', 'group-1', "Guruh tugallandi, o'quvchi muzlatilgan edi"],
      ]);
    });
  });

  // ─── Student cascades ──────────────────────────────
  describe('Student cascades', () => {
    beforeEach(() => {
      prisma.enrollment.findMany.mockResolvedValue(mockEnrollmentWithStudent);
    });

    it('FROZEN: freezes ACTIVE enrollments and records group history', async () => {
      const results = await service.cascade('Student', '100', 'FROZEN', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 100, status: 'ACTIVE' }),
          data: expect.objectContaining({ status: 'FROZEN' }),
        }),
      );

      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
          oldValues: expect.objectContaining({
            action: 'OQUVCHI_MUZLATILDI',
            oquvchi: 'Ali Valiyev',
            oquvchiId: 100,
          }),
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entity: 'Enrollment',
        toStatus: 'FROZEN',
      });
    });

    it('ACTIVE: restores FROZEN enrollments and records group history (add)', async () => {
      const results = await service.cascade('Student', '100', 'ACTIVE', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 100,
            status: 'FROZEN',
            group: expect.objectContaining({ statusEnum: 'ACTIVE' }),
          }),
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );

      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          newValues: expect.objectContaining({ action: 'OQUVCHI_QAYTDI' }),
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        entity: 'Enrollment',
        toStatus: 'ACTIVE',
      });
    });

    it('EXPELLED: drops ACTIVE+FROZEN enrollments and records group history (delete)', async () => {
      const results = await service.cascade('Student', '100', 'EXPELLED', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['ACTIVE', 'FROZEN'] },
          }),
          data: expect.objectContaining({ status: 'DROPPED' }),
        }),
      );

      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          oldValues: expect.objectContaining({ action: 'OQUVCHI_CHETLATILDI' }),
        }),
      );

      expect(results).toHaveLength(1);
    });

    it('ARCHIVED: drops ACTIVE+FROZEN enrollments and records group history (delete)', async () => {
      await service.cascade('Student', '100', 'ARCHIVED', 1);

      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          oldValues: expect.objectContaining({ action: 'OQUVCHI_OCHIRILDI' }),
        }),
      );
    });

    it('GRADUATED: no cascade, no group history', async () => {
      const results = await service.cascade('Student', '100', 'GRADUATED', 1);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(entityHistoryService.recordCreate).not.toHaveBeenCalled();
      expect(entityHistoryService.recordDelete).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });

    it('does not record group history when no enrollments affected', async () => {
      prisma.enrollment.findMany.mockResolvedValue([]);
      prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });

      const results = await service.cascade('Student', '100', 'FROZEN', 1);

      expect(entityHistoryService.recordDelete).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
  });

  // ─── Prepaid refund on enrollment close ────────────
  describe('prepaid refund on enrollment close', () => {
    beforeEach(() => {
      prisma.enrollment.findMany.mockResolvedValue(mockEnrollmentWithStudent);
    });

    it('EXPELLED: refunds unused prepaid before dropping enrollments', async () => {
      await service.cascade('Student', '100', 'EXPELLED', 42);

      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalledWith(
        prisma, // tx from the mocked $transaction
        expect.objectContaining({ enrollmentId: 'enr-1', performedById: 42 }),
      );
      // Refund must happen BEFORE the status flip
      const refundOrder =
        enrollmentBillingService.refundPrepaidToBalance.mock
          .invocationCallOrder[0];
      const updateOrder =
        prisma.enrollment.updateMany.mock.invocationCallOrder[0];
      expect(refundOrder).toBeLessThan(updateOrder);
    });

    it('ARCHIVED (student): refunds unused prepaid', async () => {
      await service.cascade('Student', '100', 'ARCHIVED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalled();
    });

    it('Group CANCELLED: refunds unused prepaid', async () => {
      await service.cascade('Group', 'group-1', 'CANCELLED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ enrollmentId: 'enr-1' }),
      );
    });

    it('Group COMPLETED: refunds unused prepaid', async () => {
      await service.cascade('Group', 'group-1', 'COMPLETED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalled();
    });

    it('EXPELLED: also reverses the MONTHLY-model departure charge (paymentModel-agnostic wiring)', async () => {
      await service.cascade('Student', '100', 'EXPELLED', 42);

      expect(
        monthlyChargeService.reverseChargeForDeparture,
      ).toHaveBeenCalledWith(
        prisma, // tx from the mocked $transaction
        expect.objectContaining({
          enrollmentId: 'enr-1',
          companyId: 1001, // mockEnrollmentWithStudent's group.companyId
          performedById: 42,
        }),
      );
    });

    it('Group CANCELLED: also reverses the MONTHLY-model departure charge', async () => {
      await service.cascade('Group', 'group-1', 'CANCELLED', 1);
      expect(
        monthlyChargeService.reverseChargeForDeparture,
      ).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ enrollmentId: 'enr-1' }),
      );
    });

    it('no departure-reversal calls when no enrollments match', async () => {
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.cascade('Student', '100', 'EXPELLED', 1);
      expect(
        monthlyChargeService.reverseChargeForDeparture,
      ).not.toHaveBeenCalled();
    });

    it('bitta yozilishning muvaffaqiyatsizligi qolganlarini to`xtatmaydi', async () => {
      // Round-3 finding: try/catch'siz sikl BIRINCHI xatoda butun cascade'ni
      // to'xtatib qo'yardi — oldingi iteratsiyalar allaqachon commit qilingan
      // (pul qaytarilgan), lekin `enrollment.updateMany` (DROPPED/COMPLETED
      // flip) hech qachon yetib bormas edi.
      const twoEnrollments = [
        {
          id: 'enr-1',
          groupId: 'group-1',
          group: { companyId: 1001 },
          student: { firstName: 'Ali', lastName: 'Valiyev' },
        },
        {
          id: 'enr-2',
          groupId: 'group-1',
          group: { companyId: 1001 },
          student: { firstName: 'Vali', lastName: 'Aliyev' },
        },
      ];
      prisma.enrollment.findMany.mockResolvedValue(twoEnrollments);
      enrollmentBillingService.refundPrepaidToBalance
        .mockRejectedValueOnce(new Error('DB vaqtincha ishlamadi'))
        .mockResolvedValue({ refunded: 0, lessons: 0 });
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.cascade('Student', '100', 'EXPELLED', 1);

      // Ikkinchi yozilish uchun ham urinib ko'rilgan — sikl birinchidan
      // keyin to'xtamagan.
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalledTimes(2);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenNthCalledWith(
        1,
        prisma,
        expect.objectContaining({ enrollmentId: 'enr-1' }),
      );
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenNthCalledWith(
        2,
        prisma,
        expect.objectContaining({ enrollmentId: 'enr-2' }),
      );
      // Xatolik jurnalga yozildi — jim yutilmadi.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('enr-1'),
        expect.any(Error),
      );
      // ENG MUHIMI: bulk status-flip hali ham ishga tushdi — sikl to'liq
      // aylanib chiqdi, birinchi xato uni to'xtatmadi.
      expect(prisma.enrollment.updateMany).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('butun partiya BITTA "bugun"ga qarab baholanadi (tun yarmi bo`linishi)', async () => {
      // Round-3 finding: `today` har bir iteratsiyada QAYTA hisoblanmasligi
      // kerak — bo'lmasa uzoq (yuzlab yozilishli) cascade tun yarmidan
      // o'tib ketganda, kechroq iteratsiyalar `departureDate`ni noto'g'ri
      // "backdated" deb rad etardi.
      const twoEnrollments = [
        {
          id: 'enr-1',
          groupId: 'group-1',
          group: { companyId: 1001 },
          student: { firstName: 'Ali', lastName: 'Valiyev' },
        },
        {
          id: 'enr-2',
          groupId: 'group-1',
          group: { companyId: 1001 },
          student: { firstName: 'Vali', lastName: 'Aliyev' },
        },
      ];
      prisma.enrollment.findMany.mockResolvedValue(twoEnrollments);

      await service.cascade('Student', '100', 'EXPELLED', 1);

      expect(
        monthlyChargeService.reverseChargeForDeparture,
      ).toHaveBeenCalledTimes(2);
      const calls = (
        monthlyChargeService.reverseChargeForDeparture as jest.Mock
      ).mock.calls;
      const todayValues = calls.map(([, params]: any) => params.today);
      expect(todayValues[0]).toBeDefined();
      expect(todayValues[0]).toBe(todayValues[1]);
    });

    it('Branch CLOSED: refunds unused prepaid', async () => {
      await service.cascade('Branch', '1', 'CLOSED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalled();
    });

    it('Course ARCHIVED: refunds unused prepaid', async () => {
      await service.cascade('Course', 'course-1', 'ARCHIVED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalled();
    });

    it('FROZEN: does NOT refund (freeze refund handled upstream with admin override)', async () => {
      await service.cascade('Student', '100', 'FROZEN', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).not.toHaveBeenCalled();
    });

    it('ACTIVE (unfreeze): does NOT refund', async () => {
      await service.cascade('Student', '100', 'ACTIVE', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).not.toHaveBeenCalled();
    });

    it('no refund calls when no enrollments match', async () => {
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.cascade('Student', '100', 'EXPELLED', 1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).not.toHaveBeenCalled();
    });
  });

  // ─── Task 1B: recharge on unfreeze return ──────────
  describe('FROZEN -> ACTIVE: restoreChargeForReturn wiring', () => {
    beforeEach(() => {
      prisma.enrollment.findMany.mockResolvedValue(mockEnrollmentWithStudent);
    });

    it('MONTHLY yozilish uchun restoreChargeForReturn chaqiriladi', async () => {
      await service.cascade('Student', '100', 'ACTIVE', 42);

      expect(monthlyChargeService.restoreChargeForReturn).toHaveBeenCalledWith(
        prisma, // tx from the mocked $transaction
        expect.objectContaining({
          enrollmentId: 'enr-1',
          companyId: 1001, // mockEnrollmentWithStudent's group.companyId
          performedById: 42,
        }),
      );
    });

    it('LESSON_PACK yozilish uchun restoreChargeForReturn UMUMAN chaqirilmaydi', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'enr-2',
          groupId: 'group-2',
          group: {
            companyId: 1001,
            course: { paymentModel: 'LESSON_PACK' },
          },
          student: { firstName: 'Vali', lastName: 'Aliyev' },
        },
      ]);

      await service.cascade('Student', '100', 'ACTIVE', 1);

      expect(
        monthlyChargeService.restoreChargeForReturn,
      ).not.toHaveBeenCalled();
    });

    it('boshqa (DROPPED/COMPLETED) kaskadlarda chaqirilmaydi', async () => {
      await service.cascade('Student', '100', 'EXPELLED', 1);

      expect(
        monthlyChargeService.restoreChargeForReturn,
      ).not.toHaveBeenCalled();
    });

    it('bitta yozilishning muvaffaqiyatsizligi qolganlarini to`xtatmaydi', async () => {
      const twoEnrollments = [
        {
          id: 'enr-1',
          groupId: 'group-1',
          group: { companyId: 1001, course: { paymentModel: 'MONTHLY' } },
          student: { firstName: 'Ali', lastName: 'Valiyev' },
        },
        {
          id: 'enr-2',
          groupId: 'group-1',
          group: { companyId: 1001, course: { paymentModel: 'MONTHLY' } },
          student: { firstName: 'Vali', lastName: 'Aliyev' },
        },
      ];
      prisma.enrollment.findMany.mockResolvedValue(twoEnrollments);
      monthlyChargeService.restoreChargeForReturn
        .mockRejectedValueOnce(new Error('DB vaqtincha ishlamadi'))
        .mockResolvedValue(null);
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      await service.cascade('Student', '100', 'ACTIVE', 1);

      expect(monthlyChargeService.restoreChargeForReturn).toHaveBeenCalledTimes(
        2,
      );
      expect(prisma.enrollment.updateMany).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('butun partiya BITTA "bugun"ga qarab baholanadi (tun yarmi bo`linishi)', async () => {
      const twoEnrollments = [
        {
          id: 'enr-1',
          groupId: 'group-1',
          group: { companyId: 1001, course: { paymentModel: 'MONTHLY' } },
          student: { firstName: 'Ali', lastName: 'Valiyev' },
        },
        {
          id: 'enr-2',
          groupId: 'group-1',
          group: { companyId: 1001, course: { paymentModel: 'MONTHLY' } },
          student: { firstName: 'Vali', lastName: 'Aliyev' },
        },
      ];
      prisma.enrollment.findMany.mockResolvedValue(twoEnrollments);

      await service.cascade('Student', '100', 'ACTIVE', 1);

      expect(monthlyChargeService.restoreChargeForReturn).toHaveBeenCalledTimes(
        2,
      );
      const calls = (monthlyChargeService.restoreChargeForReturn as jest.Mock)
        .mock.calls;
      const todayValues = calls.map(([, params]: any) => params.today);
      expect(todayValues[0]).toBeDefined();
      expect(todayValues[0]).toBe(todayValues[1]);
    });
  });

  // ─── Group deletion (on the caller's transaction) ──
  describe('cascadeGroupDeletion', () => {
    // 10:00 UTC is 15:00 in Tashkent — the same calendar day, 2026-09-25.
    const DELETED_AT = new Date('2026-09-25T10:00:00.000Z');
    const params = {
      groupId: 'group-1',
      userId: 7,
      at: DELETED_AT,
    };

    const groupWithEveryKindOfEnrollment = () =>
      makeTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-frozen', 102, 'FROZEN'),
        row('enr-dropped', 103, 'DROPPED'),
        row('enr-transferred', 104, 'TRANSFERRED'),
        row('enr-completed', 105, 'COMPLETED'),
        row('enr-archived', 106, 'ACTIVE', { deletedAt: EARLIER }),
        row('enr-other-group', 107, 'ACTIVE', { groupId: 'group-2' }),
      ]);

    it("closes the group's ACTIVE and FROZEN enrollments as DROPPED, and nothing else", async () => {
      const { tx, byId } = groupWithEveryKindOfEnrollment();

      const result = await service.cascadeGroupDeletion(tx as any, params);

      expect(result).toEqual({ count: 2 });
      for (const id of ['enr-active', 'enr-frozen']) {
        expect(byId(id)).toMatchObject({
          status: 'DROPPED',
          statusChangedAt: DELETED_AT,
          statusChangedById: 7,
          statusChangeReason: "Guruh o'chirildi",
        });
      }
      // Already closed, archived, or another group's: untouched.
      expect(byId('enr-dropped')).toMatchObject({
        status: 'DROPPED',
        statusChangedAt: EARLIER,
        statusChangeReason: 'earlier change',
      });
      expect(byId('enr-transferred').status).toBe('TRANSFERRED');
      expect(byId('enr-completed').status).toBe('COMPLETED');
      expect(byId('enr-archived')).toMatchObject({
        status: 'ACTIVE',
        statusChangedAt: EARLIER,
      });
      expect(byId('enr-other-group')).toMatchObject({
        status: 'ACTIVE',
        statusChangedAt: EARLIER,
      });
    });

    it('writes one DROPPED state-log row per closed enrollment, at the deletion instant', async () => {
      const { tx, stateLog } = groupWithEveryKindOfEnrollment();

      await service.cascadeGroupDeletion(tx as any, params);

      expect(stateLog).toHaveLength(2);
      expect(stateLog).toEqual(
        expect.arrayContaining(
          ['enr-active', 'enr-frozen'].map((enrollmentId) => ({
            enrollmentId,
            status: 'DROPPED',
            transitionAt: DELETED_AT,
            reason: "Guruh o'chirildi",
            changedById: 7,
          })),
        ),
      );
    });

    it("returns each closed enrollment's unused money on the caller's transaction", async () => {
      const { tx } = groupWithEveryKindOfEnrollment();

      await service.cascadeGroupDeletion(tx as any, params);

      // No transaction of its own: a refund that commits while the deletion
      // rolls back is the half-done state this path exists to prevent.
      expect(prisma.$transaction).not.toHaveBeenCalled();

      const refunds = enrollmentBillingService.refundPrepaidToBalance.mock
        .calls as [unknown, { enrollmentId: string; performedById: number }][];
      expect(refunds.map(([client]) => client === tx)).toEqual([true, true]);
      expect(refunds.map(([, p]) => [p.enrollmentId, p.performedById])).toEqual(
        expect.arrayContaining([
          ['enr-active', 7],
          ['enr-frozen', 7],
        ]),
      );
      expect(refunds).toHaveLength(2);

      const departures = monthlyChargeService.reverseChargeForDeparture.mock
        .calls as [unknown, Record<string, unknown>][];
      expect(departures.map(([client]) => client === tx)).toEqual([true, true]);
      expect(departures.map(([, p]) => p)).toEqual(
        expect.arrayContaining(
          ['enr-active', 'enr-frozen'].map((enrollmentId) =>
            expect.objectContaining({
              enrollmentId,
              departureDate: DELETED_AT,
              today: '2026-09-25',
              companyId: 1001,
              performedById: 7,
            }),
          ),
        ),
      );
      expect(departures).toHaveLength(2);
    });

    it('lets a failed refund abort the deletion instead of logging and moving on', async () => {
      const { tx } = groupWithEveryKindOfEnrollment();
      enrollmentBillingService.refundPrepaidToBalance
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('lock timeout'));

      await expect(
        service.cascadeGroupDeletion(tx as any, params),
      ).rejects.toThrow('lock timeout');
    });

    it('records the removal on each student and on the group, inside the transaction', async () => {
      const { tx } = groupWithEveryKindOfEnrollment();

      await service.cascadeGroupDeletion(tx as any, params);

      const written = entityHistoryService.recordDelete.mock.calls.map(
        ([p]: [Record<string, unknown>]) => p,
      );
      expect(written).toHaveLength(4);
      expect(written.every((p: { tx: unknown }) => p.tx === tx)).toBe(true);
      expect(written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityType: 'Student',
            entityId: 101,
            oldValues: {
              guruh: '#014',
              guruhId: 'group-1',
              action: 'GURUHDAN_CHIQARILDI',
              sabab: "Guruh o'chirildi",
            },
            changedById: 7,
            companyId: 1001,
          }),
          expect.objectContaining({
            entityType: 'Student',
            entityId: 102,
            oldValues: expect.objectContaining({
              action: 'GURUHDAN_CHIQARILDI',
            }),
          }),
          expect.objectContaining({
            entityType: 'Group',
            entityId: 'group-1',
            oldValues: {
              action: 'OQUVCHI_CHIQARILDI',
              oquvchi: 'Ism101 Familiya101',
              oquvchiId: 101,
              sabab: "Guruh o'chirildi",
            },
            changedById: 7,
            companyId: 1001,
          }),
          expect.objectContaining({
            entityType: 'Group',
            entityId: 'group-1',
            oldValues: expect.objectContaining({ oquvchiId: 102 }),
          }),
        ]),
      );
    });

    it('changes nothing for enrollments it already closed when run again', async () => {
      const { tx, byId, stateLog } = makeTx([
        row('enr-active', 101, 'ACTIVE'),
        row('enr-dropped', 103, 'DROPPED'),
      ]);
      await service.cascadeGroupDeletion(tx as any, params);

      const again = await service.cascadeGroupDeletion(tx as any, {
        ...params,
        at: new Date('2026-09-25T11:00:00.000Z'),
      });

      expect(again).toEqual({ count: 0 });
      expect(byId('enr-active').statusChangedAt).toEqual(DELETED_AT);
      expect(stateLog).toHaveLength(1);
      expect(
        enrollmentBillingService.refundPrepaidToBalance,
      ).toHaveBeenCalledTimes(1);
      expect(
        monthlyChargeService.reverseChargeForDeparture,
      ).toHaveBeenCalledTimes(1);
      expect(entityHistoryService.recordDelete).toHaveBeenCalledTimes(2);
    });

    it("adds the admin's reason after the fixed words wherever the removal is recorded", async () => {
      const { tx, byId, stateLog } = groupWithEveryKindOfEnrollment();
      const why = "Guruh o'chirildi: Guruh yig'ilmadi";

      await service.cascadeGroupDeletion(tx as any, {
        ...params,
        note: "Guruh yig'ilmadi",
      });

      expect(byId('enr-active').statusChangeReason).toBe(why);
      expect(byId('enr-frozen').statusChangeReason).toBe(why);
      expect(stateLog.map((r) => r.reason)).toEqual([why, why]);
      const sabab = entityHistoryService.recordDelete.mock.calls.map(
        ([p]: [{ oldValues: { sabab: string } }]) => p.oldValues.sabab,
      );
      expect(sabab).toEqual([why, why, why, why]);
      const refundReasons =
        enrollmentBillingService.refundPrepaidToBalance.mock.calls.map(
          ([, p]: [unknown, { reason?: string }]) => p.reason,
        );
      expect(refundReasons).toEqual([
        `Qoldiq oldindan to'langan darslar balansga qaytarildi (${why})`,
        `Qoldiq oldindan to'langan darslar balansga qaytarildi (${why})`,
      ]);
      const departureReasons =
        monthlyChargeService.reverseChargeForDeparture.mock.calls.map(
          ([, p]: [unknown, { reason: string }]) => p.reason,
        );
      expect(departureReasons).toEqual([why, why]);
    });
  });

  // ─── Result filtering ──────────────────────────────
  describe('result filtering', () => {
    it('filters out results with count: 0', async () => {
      prisma.group.updateMany.mockResolvedValue({ count: 0 });
      prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
      prisma.room.updateMany.mockResolvedValue({ count: 0 });

      const results = await service.cascade('Branch', '1', 'CLOSED', 1);
      expect(results).toHaveLength(0);
    });
  });

  // ─── Audit fields ──────────────────────────────────
  describe('audit fields', () => {
    it('sets statusChangedAt, statusChangedById, statusChangeReason on all updates', async () => {
      await service.cascade('Branch', '1', 'CLOSED', 42);

      for (const mock of [
        prisma.group.updateMany,
        prisma.enrollment.updateMany,
        prisma.room.updateMany,
      ]) {
        const call = mock.mock.calls[0][0];
        expect(call.data).toHaveProperty('statusChangedAt');
        expect(call.data.statusChangedById).toBe(42);
        expect(call.data.statusChangeReason).toContain('Branch');
        expect(call.data.statusChangeReason).toContain('CLOSED');
      }
    });
  });
});
