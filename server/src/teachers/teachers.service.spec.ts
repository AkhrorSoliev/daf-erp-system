import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('TeachersService — status methods', () => {
  let service: TeachersService;
  let prisma: any;
  let redis: any;
  let statusHistoryService: any;

  const mockTeacher = {
    id: 1,
    firstName: 'Test',
    lastName: 'Teacher',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    photo: null,
    roles: [{ roleId: 4 }],
  };

  // `assertCallerMayTouchTeacher` reads the CALLER through the same
  // `user.findFirst` mock. A CEO caller spans every branch, so the cases below
  // exercise the status/delete logic rather than the confinement — which has
  // its own spec.
  const mockCeoCaller = {
    id: 2,
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        // Answers by id rather than by call order: the guard now runs AFTER
        // each method's own existence check, so the sequence differs per
        // method and an order-based mock would encode that ordering.
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.id === mockCeoCaller.id ? mockCeoCaller : mockTeacher,
            ),
          ),
        update: jest.fn().mockResolvedValue({
          ...mockTeacher,
          roles: [{ role: { id: 4, name: 'Teacher' } }],
          branches: [],
          company: { id: 1001, name: 'Test' },
          groupTeachers: [],
        }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: StatusHistoryService, useValue: statusHistoryService },
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

    service = module.get(TeachersService);
  });

  describe('changeStatus', () => {
    it('sets Redis block key when status is SUSPENDED', async () => {
      await service.changeStatus(
        1,
        { status: 'SUSPENDED' as any, reason: 'test' },
        2,
        1001,
      );

      expect(redis.set).toHaveBeenCalledWith('user:blocked:1', '1');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('sets Redis block key when status is TERMINATED', async () => {
      await service.changeStatus(1, { status: 'TERMINATED' as any }, 2, 1001);

      expect(redis.set).toHaveBeenCalledWith('user:blocked:1', '1');
    });

    it('removes Redis block key when status is ACTIVE', async () => {
      // Keep answering by id — this test only needs the TEACHER to start
      // SUSPENDED; blanket-overriding the mock would also make the caller
      // lookup return a teacher with no `role` shape.
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id === mockCeoCaller.id
            ? mockCeoCaller
            : { ...mockTeacher, status: 'SUSPENDED' },
        ),
      );

      await service.changeStatus(1, { status: 'ACTIVE' as any }, 2, 1001);

      expect(redis.del).toHaveBeenCalledWith('user:blocked:1');
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('does NOT touch Redis for INACTIVE status', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2, 1001);

      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('calls statusHistoryService with entityType "User"', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2, 1001);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'User' }),
      );
    });

    it('throws NotFoundException when teacher not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(999, { status: 'INACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives teacher, removes from groups, sets Redis block key', async () => {
      await service.delete(1, 2, 1001);

      expect(prisma.groupTeacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teacherId: 1 } }),
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
            deletedById: 2,
          }),
        }),
      );

      expect(redis.set).toHaveBeenCalledWith('user:blocked:1', '1');
    });

    it('throws NotFoundException when teacher not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.delete(999, 1, 1001)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2, 1001);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('delete scopes lookup to companyId', async () => {
      await service.delete(1, 2, 1001);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });
});
