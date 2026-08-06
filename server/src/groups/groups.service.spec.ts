import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupsService } from './groups.service';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { STUDENT_ROSTER_ORDER_BY } from '../common/student-roster-order';

describe('GroupsService — status methods', () => {
  let service: GroupsService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockGroup = {
    id: 'group-1',
    name: 'Test-001',
    status: 2,
    statusEnum: 'FORMING',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
    branchId: 1,
    courseId: 'course-1',
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue(mockGroup),
        findUnique: jest.fn().mockResolvedValue({
          ...mockGroup,
          course: { id: 'c1', name: 'Test' },
          room: null,
          branch: { id: 1, name: 'Branch' },
          teachers: [],
          _count: { enrollments: 0 },
        }),
        update: jest.fn().mockResolvedValue({
          ...mockGroup,
          course: { id: 'c1', name: 'Test' },
          room: null,
          branch: { id: 1, name: 'Branch' },
          teachers: [],
          _count: { enrollments: 0 },
        }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { groupNumber: 0 } }),
        create: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
      course: { findFirst: jest.fn() },
      room: { findFirst: jest.fn() },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      // `findMany` backs the "teacher belongs to this group's branch" guard —
      // empty means no teacher from a foreign branch was requested.
      user: {
        findFirst: jest.fn().mockResolvedValue({ mainBranch: null, branches: [], roles: [{ role: { name: 'CEO' } }] }), count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      // Every assigned teacher already has a salary rate (the normal case).
      employeeSalaryConfig: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            (where.userId.in as number[]).map((userId) => ({ userId })),
          ),
      },
      groupTeacher: {
        // Read by `assertCallerMayTouchGroup`'s teacher branch. Group CRUD is
        // never reached by a pure teacher (@Roles excludes them), so this is
        // only here to keep the guard's lookup from throwing.
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      groupTeacherHistory: { create: jest.fn() },
      groupTeacherChangeReason: { findFirst: jest.fn() },
      statusHistory: { create: jest.fn() },
      groupScheduleSnapshot: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((arg) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const cascadeService = {
      extendGroupEndDateForHoliday: jest
        .fn()
        .mockResolvedValue({ extended: false }),
      revertGroupEndDateForHoliday: jest.fn(),
      applyHolidayImpactOnNewGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        GroupsReadService,
        GroupsWriteService,
        GroupsStatusService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide:
            require('./group-holiday-cascade.service').GroupHolidayCascadeService,
          useValue: cascadeService,
        },
      ],
    }).compile();

    service = module.get(GroupsService);
  });

  describe('changeStatus', () => {
    it('updates statusEnum and sets isActive correctly for ACTIVE', async () => {
      await service.changeStatus(
        'group-1',
        { status: 'ACTIVE' as any },
        1,
        1001,
      );

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'ACTIVE',
            isActive: true,
          }),
        }),
      );
    });

    it('sets isActive=false for PAUSED', async () => {
      prisma.group.findFirst.mockResolvedValue({
        ...mockGroup,
        statusEnum: 'ACTIVE',
      });

      await service.changeStatus(
        'group-1',
        { status: 'PAUSED' as any },
        1,
        1001,
      );

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('calls cascade after update', async () => {
      await service.changeStatus(
        'group-1',
        { status: 'ACTIVE' as any },
        1,
        1001,
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Group',
        'group-1',
        'ACTIVE',
        1,
      );
    });

    it('throws NotFoundException for missing group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus('missing', { status: 'ACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives group with ARCHIVED status and deletedAt', async () => {
      await service.delete('group-1', 1, 1001);

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('getNextName', () => {
    it('returns #001 when no groups exist', async () => {
      prisma.group.findMany.mockResolvedValue([]);

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#001' });
      // Scoped by branchId only, matching @@unique([name, branchId]); no
      // deletedAt filter so archived names are still counted.
      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: { branchId: 1, name: { startsWith: '#' } },
        select: { name: true, groupNumber: true },
      });
    });

    it('returns #004 when the highest #NNN name is #003', async () => {
      prisma.group.findMany.mockResolvedValue([
        { name: '#001', groupNumber: 1 },
        { name: '#003', groupNumber: 3 },
        { name: '#002', groupNumber: 2 },
      ]);

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#004' });
    });

    it('returns #1000 when the highest #NNN name is #999', async () => {
      prisma.group.findMany.mockResolvedValue([
        { name: '#999', groupNumber: 999 },
      ]);

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#1000' });
    });

    it('derives the number from the name even when groupNumber is NULL (legacy rows)', async () => {
      // Regression: groupNumber was added nullable with no backfill, so legacy
      // #NNN groups carry NULL. The old MAX(groupNumber) logic reset to #001
      // and collided forever; deriving from the name suffix avoids that.
      prisma.group.findMany.mockResolvedValue([
        { name: '#001', groupNumber: null },
        { name: '#005', groupNumber: null },
        { name: '#003', groupNumber: null },
      ]);

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#006' });
    });
  });

  describe('create', () => {
    const createDto = {
      courseId: 'course-1',
      branchId: 1,
      level: 'A1',
      exactDays: ['Mon', 'Wed', 'Fri'],
      lessonStartTime: '09:00',
      lessonEndTime: '10:30',
    };

    const mockCreated = (name: string, groupNumber: number) => ({
      ...mockGroup,
      name,
      groupNumber,
      course: { id: 'course-1', name: 'Deutsch' },
      room: null,
      branch: { id: 1, name: 'Branch' },
      teachers: [],
      _count: { enrollments: 0 },
    });

    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
      prisma.course.findFirst.mockResolvedValue({
        id: 'course-1',
        name: 'Deutsch',
        deletedAt: null,
      });
    });

    it('generates name in #001 format', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.group.create.mockResolvedValue(mockCreated('#001', 1));

      await service.create(createDto as any, 1001, 1);

      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '#001', groupNumber: 1 }),
        }),
      );
    });

    it('uses custom name when dto.name is provided', async () => {
      prisma.group.findMany.mockResolvedValue([{ name: '#005', groupNumber: 5 }]);
      prisma.group.create.mockResolvedValue(mockCreated('Custom Group', 6));

      await service.create(
        { ...createDto, name: 'Custom Group' } as any,
        1001,
        1,
      );

      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Custom Group' }),
        }),
      );
    });

    it('derives the next number from existing #NNN names, ignoring NULL groupNumber', async () => {
      // Regression for "Guruh nomini generatsiya qilib bo'lmadi": the branch
      // has a legacy #010 whose groupNumber is NULL. Old logic computed #001
      // and collided on @@unique([name, branchId]); now we get #011.
      prisma.group.findMany.mockResolvedValue([
        { name: '#010', groupNumber: null },
      ]);
      prisma.group.create.mockResolvedValue(mockCreated('#011', 11));

      await service.create(createDto as any, 1001, 1);

      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: { branchId: 1, name: { startsWith: '#' } },
        select: { name: true, groupNumber: true },
      });
      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '#011', groupNumber: 11 }),
        }),
      );
    });

    it('increments the number on a P2002 collision instead of repeating it', async () => {
      // Safety net for concurrent inserts: a unique-name clash must advance to
      // the next slot, not retry the same name (the old infinite-loop bug).
      prisma.group.findMany.mockResolvedValue([{ name: '#005', groupNumber: 5 }]);
      prisma.group.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce(mockCreated('#007', 7));

      await service.create(createDto as any, 1001, 1);

      expect(prisma.group.create).toHaveBeenCalledTimes(2);
      expect(prisma.group.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '#007', groupNumber: 7 }),
        }),
      );
    });

    it('throws a clear conflict (no retry) when a custom name is already taken', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.group.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({ ...createDto, name: 'Dup' } as any, 1001, 1),
      ).rejects.toThrow('allaqachon mavjud');

      // A fixed user name can't be auto-incremented — fail fast, no retries.
      expect(prisma.group.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findStudentsByGroupId — roster order', () => {
    it('orders the roster by the shared canonical order (matches Darslar/Davomat tabs)', async () => {
      // Regression: this tab used `createdAt desc` (newest enrollment first)
      // while the attendance/lesson tabs used firstName-asc, so the same group
      // showed students in two different orders. All roster queries must use
      // the one shared STUDENT_ROSTER_ORDER_BY.
      prisma.group.findFirst.mockResolvedValue({
        id: 'g1',
        companyId: 1001,
        branchId: 1,
      });
      prisma.enrollment.findMany.mockResolvedValue([]);

      // The roster is branch-gated now: a CEO spans every branch, and the
      // roles list is what routes a caller to the assignment check instead.
      await service.findStudentsByGroupId('g1', 1001, 1, ['CEO']);

      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: STUDENT_ROSTER_ORDER_BY }),
      );
    });
  });

  describe('update — teacher change history', () => {
    const existing = {
      ...mockGroup,
      course: { id: 'course-1', courseDuration: 6 },
      teachers: [],
    };

    beforeEach(() => {
      prisma.group.findFirst.mockResolvedValue(existing);
      prisma.user.count.mockImplementation(
        ({ where }: any) => where.id.in.length,
      );
      prisma.group.update.mockResolvedValue({
        ...existing,
        course: { id: 'course-1', name: 'Test', courseDuration: 6 },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [
          {
            teacher: {
              id: 2002,
              firstName: 'Jane',
              lastName: 'Smith',
            },
          },
        ],
        _count: { enrollments: 0 },
      });
    });

    it('rejects a teacher who has no salary rate yet', async () => {
      // No rate → createAccrual silently writes nothing and a rate cannot be
      // back-dated, so those lessons would earn the teacher nothing forever.
      prisma.employeeSalaryConfig.findMany.mockResolvedValueOnce([]);

      await expect(
        service.update('group-1', { teacherIds: [2002] } as any, 1, 1001),
      ).rejects.toThrow(/stavkasi belgilanmagan/);
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it("rejects a teacher who belongs to another branch", async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 2002, firstName: 'Jane', lastName: 'Smith' },
      ]);

      await expect(
        service.update('group-1', { teacherIds: [2002] } as any, 1, 1001),
      ).rejects.toThrow(/boshqa filialga tegishli/);
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('ignores a branchId sent by the client — a group cannot drift branches', async () => {
      await service.update(
        'group-1',
        { name: 'Yangi nom', branchId: 2 } as any,
        1,
        1001,
      );

      const data = prisma.group.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('branchId');
      expect(data).toEqual(expect.objectContaining({ name: 'Yangi nom' }));
    });

    it('writes GroupTeacherHistory when teachers change', async () => {
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          teacher: {
            id: 1001,
            firstName: 'John',
            lastName: 'Doe',
            status: 'ACTIVE',
            isActive: true,
            deletedAt: null,
          },
        },
      ]);

      await service.update('group-1', { teacherIds: [2002] } as any, 42, 1001);

      expect(prisma.groupTeacherHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 'group-1',
          previousTeacherIds: [1001],
          newTeacherIds: [2002],
          changeType: 'REPLACED',
          triggeredByDismissal: false,
          changedById: 42,
        }),
      });
    });

    it('sets triggeredByDismissal=true when removed teacher is terminated', async () => {
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          teacher: {
            id: 1001,
            firstName: 'Fired',
            lastName: 'Teacher',
            status: 'TERMINATED',
            isActive: false,
            deletedAt: null,
          },
        },
      ]);

      await service.update('group-1', { teacherIds: [2002] } as any, 42, 1001);

      expect(prisma.groupTeacherHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredByDismissal: true,
          changeType: 'REPLACED',
        }),
      });
    });

    it('uses ADDED when a teacher is added without removal', async () => {
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          teacher: {
            id: 1001,
            firstName: 'John',
            lastName: 'Doe',
            status: 'ACTIVE',
            isActive: true,
            deletedAt: null,
          },
        },
      ]);
      prisma.group.update.mockResolvedValueOnce({
        ...existing,
        course: { id: 'course-1', name: 'Test', courseDuration: 6 },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [
          { teacher: { id: 1001, firstName: 'John', lastName: 'Doe' } },
          { teacher: { id: 2002, firstName: 'Jane', lastName: 'Smith' } },
        ],
        _count: { enrollments: 0 },
      });

      await service.update(
        'group-1',
        { teacherIds: [1001, 2002] } as any,
        42,
        1001,
      );

      expect(prisma.groupTeacherHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changeType: 'ADDED',
          previousTeacherIds: [1001],
          newTeacherIds: [1001, 2002],
        }),
      });
    });

    it('does not write history when teacher list is unchanged', async () => {
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          teacher: {
            id: 1001,
            firstName: 'John',
            lastName: 'Doe',
            status: 'ACTIVE',
            isActive: true,
            deletedAt: null,
          },
        },
      ]);
      prisma.group.update.mockResolvedValueOnce({
        ...existing,
        course: { id: 'course-1', name: 'Test', courseDuration: 6 },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [
          { teacher: { id: 1001, firstName: 'John', lastName: 'Doe' } },
        ],
        _count: { enrollments: 0 },
      });

      await service.update('group-1', { teacherIds: [1001] } as any, 42, 1001);

      expect(prisma.groupTeacherHistory.create).not.toHaveBeenCalled();
    });

    it('writes changeReasonId when provided and valid', async () => {
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          teacher: {
            id: 1001,
            firstName: 'John',
            lastName: 'Doe',
            status: 'ACTIVE',
            isActive: true,
            deletedAt: null,
          },
        },
      ]);
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce({
        id: 'reason-1',
        name: 'Ishdan ketdi',
      });

      await service.update(
        'group-1',
        { teacherIds: [2002], changeReasonId: 'reason-1' } as any,
        42,
        1001,
      );

      expect(prisma.groupTeacherHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changeReasonId: 'reason-1',
        }),
      });
    });

    it('rejects unknown changeReasonId', async () => {
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update(
          'group-1',
          { teacherIds: [2002], changeReasonId: 'nope' } as any,
          42,
          1001,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(
        'group-1',
        { status: 'ACTIVE' as any },
        1,
        1001,
      );
      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'group-1',
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('delete scopes lookup to companyId', async () => {
      await service.delete('group-1', 1, 1001);
      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'group-1',
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('getNextName scopes the name scan to the branch', async () => {
      // A branch belongs to exactly one company, so scoping by branchId is the
      // tenant boundary here — and it matches @@unique([name, branchId]) exactly,
      // which is what makes the generated number collision-proof.
      prisma.group.findMany.mockResolvedValue([]);
      await service.getNextName(1, 1001);
      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: 1, name: { startsWith: '#' } },
        }),
      );
    });
  });

  describe('findAll — search by group name or teacher', () => {
    function whereOf() {
      return prisma.group.findMany.mock.calls[0][0].where;
    }

    it('matches a single term against the group name OR a teacher name', async () => {
      await service.findAll({ search: 'Valiyev' } as any, 1001, null);

      expect(whereOf().AND).toEqual([
        {
          OR: [
            { name: { contains: 'Valiyev', mode: 'insensitive' } },
            {
              teachers: {
                some: {
                  teacher: {
                    OR: [
                      {
                        firstName: { contains: 'Valiyev', mode: 'insensitive' },
                      },
                      {
                        lastName: { contains: 'Valiyev', mode: 'insensitive' },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ]);
      // The legacy single-key `where.name` filter must be gone.
      expect(whereOf().name).toBeUndefined();
    });

    it('splits a multi-word term so every token must match (AND of ORs)', async () => {
      await service.findAll({ search: '  Ali   Valiyev ' } as any, 1001, null);

      const and = whereOf().AND;
      expect(and).toHaveLength(2);
      expect(and[0].OR[0]).toEqual({
        name: { contains: 'Ali', mode: 'insensitive' },
      });
      expect(and[1].OR[0]).toEqual({
        name: { contains: 'Valiyev', mode: 'insensitive' },
      });
    });

    it('does not attach a search clause when search is absent or blank', async () => {
      await service.findAll({ search: '   ' } as any, 1001, null);
      expect(whereOf().AND).toBeUndefined();
      expect(whereOf().name).toBeUndefined();
    });
  });
});
