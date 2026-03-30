import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';

describe('TeachersService — status methods', () => {
  let service: TeachersService;
  let prisma: any;
  let redis: any;
  let statusHistoryService: any;

  const mockTeacher = {
    id: 1,
    name: 'Test Teacher',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    photo: null,
    roles: [{ roleId: 4 }],
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(mockTeacher),
        update: jest.fn().mockResolvedValue({ ...mockTeacher, roles: [{ role: { id: 4, name: 'Teacher' } }], branches: [], company: { id: 1001, name: 'Test' }, groupTeachers: [] }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
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
        { provide: StatusHistoryService, useValue: statusHistoryService },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  describe('changeStatus', () => {
    it('sets Redis block key when status is SUSPENDED', async () => {
      await service.changeStatus(1, { status: 'SUSPENDED' as any, reason: 'test' }, 2);

      expect(redis.set).toHaveBeenCalledWith('user:blocked:1', '1');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('sets Redis block key when status is TERMINATED', async () => {
      await service.changeStatus(1, { status: 'TERMINATED' as any }, 2);

      expect(redis.set).toHaveBeenCalledWith('user:blocked:1', '1');
    });

    it('removes Redis block key when status is ACTIVE', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockTeacher, status: 'SUSPENDED' });

      await service.changeStatus(1, { status: 'ACTIVE' as any }, 2);

      expect(redis.del).toHaveBeenCalledWith('user:blocked:1');
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('does NOT touch Redis for INACTIVE status', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2);

      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('calls statusHistoryService with entityType "User"', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'User' }),
      );
    });

    it('throws NotFoundException when teacher not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(999, { status: 'INACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives teacher + sets Redis block key', async () => {
      await service.delete(1, 2);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'ARCHIVED' }),
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

      await expect(service.delete(999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
