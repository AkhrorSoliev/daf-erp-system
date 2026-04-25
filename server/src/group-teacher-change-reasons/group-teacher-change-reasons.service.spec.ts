import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GroupTeacherChangeReasonsService } from './group-teacher-change-reasons.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('GroupTeacherChangeReasonsService', () => {
  let service: GroupTeacherChangeReasonsService;
  let prisma: any;
  let entityHistory: any;

  beforeEach(async () => {
    prisma = {
      groupTeacherChangeReason: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    entityHistory = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordUpdate: jest.fn().mockResolvedValue(undefined),
      recordDelete: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordRestore: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupTeacherChangeReasonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();

    service = module.get(GroupTeacherChangeReasonsService);
  });

  describe('findAll', () => {
    it('scopes to company, excludes soft-deleted, orders by name', async () => {
      prisma.groupTeacherChangeReason.findMany.mockResolvedValueOnce([
        { id: 'a', name: 'Ishdan ketdi', createdAt: new Date() },
      ]);
      const result = await service.findAll(1001);
      expect(prisma.groupTeacherChangeReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1001, deletedAt: null },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('creates a reason and records history', async () => {
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce(null);
      const created = { id: 'r1', name: 'Ishdan ketdi', companyId: 1001 };
      prisma.groupTeacherChangeReason.create.mockResolvedValueOnce(created);

      const result = await service.create(
        { name: 'Ishdan ketdi' },
        1001,
        10001,
      );

      expect(prisma.groupTeacherChangeReason.create).toHaveBeenCalledWith({
        data: { name: 'Ishdan ketdi', companyId: 1001 },
      });
      expect(entityHistory.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'GroupTeacherChangeReason',
          entityId: 'r1',
          changedById: 10001,
          companyId: 1001,
        }),
      );
      expect(result).toEqual(created);
    });

    it('rejects blank name', async () => {
      await expect(service.create({ name: '  ' }, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects duplicate name per company', async () => {
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce({
        id: 'x',
      });
      await expect(service.create({ name: 'Sabab' }, 1001, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFound when missing', async () => {
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.update('missing', { name: 'X' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates and records history', async () => {
      const existing = { id: 'r1', name: 'Old', companyId: 1001 };
      prisma.groupTeacherChangeReason.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null); // no clash
      const updated = { id: 'r1', name: 'New', companyId: 1001 };
      prisma.groupTeacherChangeReason.update.mockResolvedValueOnce(updated);

      const result = await service.update('r1', { name: 'New' }, 1001, 10001);

      expect(prisma.groupTeacherChangeReason.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'New' },
      });
      expect(entityHistory.recordUpdate).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('soft-deletes and records history', async () => {
      const existing = { id: 'r1', name: 'X', companyId: 1001 };
      prisma.groupTeacherChangeReason.findFirst.mockResolvedValueOnce(existing);
      prisma.groupTeacherChangeReason.update.mockResolvedValueOnce({
        ...existing,
        deletedAt: new Date(),
      });

      const result = await service.remove('r1', 1001, 10001);

      expect(prisma.groupTeacherChangeReason.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: 10001,
        }),
      });
      expect(entityHistory.recordDelete).toHaveBeenCalled();
      expect(result).toEqual({ message: "Sabab o'chirildi" });
    });
  });
});
