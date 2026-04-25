import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentTransferReasonsService } from './enrollment-transfer-reasons.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('EnrollmentTransferReasonsService', () => {
  let service: EnrollmentTransferReasonsService;
  let prisma: any;
  let entityHistory: any;

  beforeEach(async () => {
    prisma = {
      enrollmentTransferReason: {
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
        EnrollmentTransferReasonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();

    service = module.get(EnrollmentTransferReasonsService);
  });

  describe('findAll', () => {
    it('scopes to company and excludes soft-deleted', async () => {
      prisma.enrollmentTransferReason.findMany.mockResolvedValueOnce([]);
      await service.findAll(1001);
      expect(prisma.enrollmentTransferReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1001, deletedAt: null },
        }),
      );
    });
  });

  describe('create', () => {
    it('creates and records history', async () => {
      prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce(null);
      const created = { id: 't1', name: 'Daraja past', companyId: 1001 };
      prisma.enrollmentTransferReason.create.mockResolvedValueOnce(created);

      const result = await service.create({ name: 'Daraja past' }, 1001, 10001);

      expect(entityHistory.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'EnrollmentTransferReason',
          entityId: 't1',
        }),
      );
      expect(result).toEqual(created);
    });

    it('rejects duplicate name', async () => {
      prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce({
        id: 'x',
      });
      await expect(service.create({ name: 'Dub' }, 1001, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects blank name', async () => {
      await expect(service.create({ name: ' ' }, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFound when missing', async () => {
      prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce(null);
      await expect(service.update('x', {}, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and records history', async () => {
      const existing = { id: 't1', name: 'X', companyId: 1001 };
      prisma.enrollmentTransferReason.findFirst.mockResolvedValueOnce(existing);
      prisma.enrollmentTransferReason.update.mockResolvedValueOnce({
        ...existing,
        deletedAt: new Date(),
      });
      const result = await service.remove('t1', 1001, 10001);
      expect(entityHistory.recordDelete).toHaveBeenCalled();
      expect(result).toEqual({ message: "Sabab o'chirildi" });
    });
  });
});
