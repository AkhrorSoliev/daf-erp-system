import { Test, TestingModule } from '@nestjs/testing';
import { StatusCascadeService } from './status-cascade.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';

describe('StatusCascadeService', () => {
  let service: StatusCascadeService;
  let prisma: any;
  let entityHistoryService: any;

  const mockEnrollmentWithStudent = [
    {
      groupId: 'group-1',
      group: { companyId: 1001 },
      student: { firstName: 'Ali', lastName: 'Valiyev' },
    },
  ];

  beforeEach(async () => {
    prisma = {
      group: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      enrollment: {
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      statusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
      },
    };

    entityHistoryService = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordUpdate: jest.fn().mockResolvedValue(undefined),
      recordDelete: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordRestore: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusCascadeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
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
          data: expect.objectContaining({ statusEnum: 'CANCELLED', isActive: false }),
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
          expect.objectContaining({ entity: 'Enrollment', toStatus: 'DROPPED' }),
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
      const results = await service.cascade('Course', 'course-1', 'ARCHIVED', 1);

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
      expect(results[0]).toMatchObject({ entity: 'Enrollment', toStatus: 'DROPPED' });
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
          expect.objectContaining({ entity: 'Enrollment', toStatus: 'COMPLETED' }),
        ]),
      );
    });

    it('COMPLETED: auto-graduates students with no remaining active enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 100 },
        { studentId: 101 },
      ]);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.student.findFirst.mockResolvedValue({ id: 100, status: 'ACTIVE', companyId: 1 });

      const results = await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'GRADUATED', isActive: false }),
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

      const graduatedResults = results.filter(r => r.entity === 'Student' && r.toStatus === 'GRADUATED');
      expect(graduatedResults.length).toBeGreaterThanOrEqual(1);
    });

    it('COMPLETED: does NOT graduate students who have other active enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 100 }]);
      prisma.enrollment.count.mockResolvedValue(2);

      await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.student.update).not.toHaveBeenCalled();
      expect(prisma.statusHistory.create).not.toHaveBeenCalled();
      expect(entityHistoryService.recordStatusChange).not.toHaveBeenCalled();
    });

    it('PAUSED: no cascade', async () => {
      const results = await service.cascade('Group', 'group-1', 'PAUSED', 1);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
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
      expect(results[0]).toMatchObject({ entity: 'Enrollment', toStatus: 'FROZEN' });
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
      expect(results[0]).toMatchObject({ entity: 'Enrollment', toStatus: 'ACTIVE' });
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

      for (const mock of [prisma.group.updateMany, prisma.enrollment.updateMany, prisma.room.updateMany]) {
        const call = mock.mock.calls[0][0];
        expect(call.data).toHaveProperty('statusChangedAt');
        expect(call.data.statusChangedById).toBe(42);
        expect(call.data.statusChangeReason).toContain('Branch');
        expect(call.data.statusChangeReason).toContain('CLOSED');
      }
    });
  });
});
