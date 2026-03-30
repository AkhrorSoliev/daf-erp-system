import { Test, TestingModule } from '@nestjs/testing';
import { StatusCascadeService } from './status-cascade.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StatusCascadeService', () => {
  let service: StatusCascadeService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      group: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      enrollment: { updateMany: jest.fn().mockResolvedValue({ count: 5 }) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusCascadeService,
        { provide: PrismaService, useValue: prisma },
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

    it('COMPLETED: completes enrollments (not drops)', async () => {
      const results = await service.cascade('Group', 'group-1', 'COMPLETED', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );

      expect(results[0]).toMatchObject({ entity: 'Enrollment', toStatus: 'COMPLETED' });
    });

    it('PAUSED: no cascade', async () => {
      const results = await service.cascade('Group', 'group-1', 'PAUSED', 1);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
      expect(results).toHaveLength(0);
    });
  });

  // ─── Student cascades ──────────────────────────────
  describe('Student cascades', () => {
    it('ARCHIVED: drops active enrollments', async () => {
      const results = await service.cascade('Student', '100', 'ARCHIVED', 1);

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 100 }),
          data: expect.objectContaining({ status: 'DROPPED' }),
        }),
      );

      expect(results).toHaveLength(1);
    });

    it('EXPELLED: drops active enrollments', async () => {
      const results = await service.cascade('Student', '100', 'EXPELLED', 1);
      expect(prisma.enrollment.updateMany).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('INACTIVE: no cascade', async () => {
      const results = await service.cascade('Student', '100', 'INACTIVE', 1);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
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
