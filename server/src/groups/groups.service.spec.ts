import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

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
        aggregate: jest.fn().mockResolvedValue({ _max: { groupNumber: 0 } }),
        create: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
      course: { findFirst: jest.fn() },
      room: { findFirst: jest.fn() },
      user: { count: jest.fn() },
      groupTeacher: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupTeacherHistory: { create: jest.fn() },
      groupTeacherChangeReason: { findFirst: jest.fn() },
      statusHistory: { create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
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
      ],
    }).compile();

    service = module.get(GroupsService);
  });

  describe('changeStatus', () => {
    it('updates statusEnum and sets isActive correctly for ACTIVE', async () => {
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001);

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

      await service.changeStatus('group-1', { status: 'PAUSED' as any }, 1, 1001);

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('calls cascade after update', async () => {
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001);

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
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: null } });

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#001' });
      expect(prisma.group.aggregate).toHaveBeenCalledWith({
        where: {
          branchId: 1,
          name: { startsWith: '#' },
          deletedAt: null,
          companyId: 1001,
        },
        _max: { groupNumber: true },
      });
    });

    it('returns #004 when max groupNumber is 3', async () => {
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: 3 } });

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#004' });
    });

    it('returns #1000 when max groupNumber is 999', async () => {
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: 999 } });

      const result = await service.getNextName(1, 1001);

      expect(result).toEqual({ nextName: '#1000' });
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

    it('generates name in #001 format', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
      prisma.course.findFirst.mockResolvedValue({
        id: 'course-1',
        name: 'Deutsch',
        deletedAt: null,
      });
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: null } });
      prisma.group.create.mockResolvedValue({
        ...mockGroup,
        name: '#001',
        groupNumber: 1,
        course: { id: 'course-1', name: 'Deutsch' },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [],
        _count: { enrollments: 0 },
      });

      await service.create(createDto as any, 1001, 1);

      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: '#001',
            groupNumber: 1,
          }),
        }),
      );
    });

    it('uses custom name when dto.name is provided', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
      prisma.course.findFirst.mockResolvedValue({
        id: 'course-1',
        name: 'Deutsch',
        deletedAt: null,
      });
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: 5 } });
      prisma.group.create.mockResolvedValue({
        ...mockGroup,
        name: 'Custom Group',
        groupNumber: 6,
        course: { id: 'course-1', name: 'Deutsch' },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [],
        _count: { enrollments: 0 },
      });

      await service.create(
        { ...createDto, name: 'Custom Group' } as any,
        1001,
        1,
      );

      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Custom Group',
          }),
        }),
      );
    });

    it('queries aggregate with startsWith # (not level prefix)', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, deletedAt: null });
      prisma.course.findFirst.mockResolvedValue({
        id: 'course-1',
        name: 'Deutsch',
        deletedAt: null,
      });
      prisma.group.aggregate.mockResolvedValue({ _max: { groupNumber: 10 } });
      prisma.group.create.mockResolvedValue({
        ...mockGroup,
        name: '#011',
        groupNumber: 11,
        course: { id: 'course-1', name: 'Deutsch' },
        room: null,
        branch: { id: 1, name: 'Branch' },
        teachers: [],
        _count: { enrollments: 0 },
      });

      await service.create(createDto as any, 1001, 1);

      expect(prisma.group.aggregate).toHaveBeenCalledWith({
        where: {
          branchId: 1,
          name: { startsWith: '#' },
          deletedAt: null,
          companyId: 1001,
        },
        _max: { groupNumber: true },
      });
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

      await service.update('group-1', { teacherIds: [1001, 2002] } as any, 42, 1001);

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
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1, 1001);
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

    it('getNextName scopes aggregate to companyId', async () => {
      await service.getNextName(1, 1001);
      expect(prisma.group.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            branchId: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });
});
