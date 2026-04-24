import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DepartureReasonsService } from './departure-reasons.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('DepartureReasonsService', () => {
  let service: DepartureReasonsService;
  let prisma: any;
  let entityHistory: any;

  beforeEach(async () => {
    prisma = {
      departureReason: {
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
        DepartureReasonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistory },
      ],
    }).compile();

    service = module.get(DepartureReasonsService);
  });

  describe('findAll', () => {
    it('scopes to company and excludes soft-deleted, ordered by name', async () => {
      prisma.departureReason.findMany.mockResolvedValueOnce([
        { id: 'a', name: 'Bosh sabab', createdAt: new Date() },
      ]);
      const result = await service.findAll(1);
      expect(prisma.departureReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1, deletedAt: null },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('creates a reason, records history, returns entity', async () => {
      prisma.departureReason.findFirst.mockResolvedValueOnce(null);
      const created = { id: 'r1', name: 'Moliya', companyId: 1 };
      prisma.departureReason.create.mockResolvedValueOnce(created);

      const result = await service.create({ name: 'Moliya' }, 1, 10001);

      expect(prisma.departureReason.create).toHaveBeenCalledWith({
        data: { name: 'Moliya', companyId: 1 },
      });
      expect(entityHistory.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'DepartureReason',
          entityId: 'r1',
          changedById: 10001,
          companyId: 1,
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws ConflictException when name already exists in company', async () => {
      prisma.departureReason.findFirst.mockResolvedValueOnce({ id: 'x' });
      await expect(
        service.create({ name: 'Moliya' }, 1, 10001),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when name is whitespace', async () => {
      await expect(service.create({ name: '   ' }, 1, 10001)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('trims the name before saving', async () => {
      prisma.departureReason.findFirst.mockResolvedValueOnce(null);
      prisma.departureReason.create.mockResolvedValueOnce({ id: 'r1' });
      await service.create({ name: '  Moliya  ' }, 1, 10001);
      expect(prisma.departureReason.create).toHaveBeenCalledWith({
        data: { name: 'Moliya', companyId: 1 },
      });
    });
  });

  describe('update', () => {
    it('throws NotFound when the id is not in company', async () => {
      prisma.departureReason.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.update('missing', { name: 'x' }, 1, 10001),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Conflict when renaming to an existing name', async () => {
      prisma.departureReason.findFirst
        .mockResolvedValueOnce({ id: 'r1', name: 'Old', companyId: 1 })
        .mockResolvedValueOnce({ id: 'r2' });
      await expect(
        service.update('r1', { name: 'New' }, 1, 10001),
      ).rejects.toThrow(ConflictException);
    });

    it('updates name, records update history', async () => {
      const existing = { id: 'r1', name: 'Old', companyId: 1 };
      const updated = { id: 'r1', name: 'New', companyId: 1 };
      prisma.departureReason.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      prisma.departureReason.update.mockResolvedValueOnce(updated);

      const result = await service.update('r1', { name: 'New' }, 1, 10001);
      expect(prisma.departureReason.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'New' },
      });
      expect(entityHistory.recordUpdate).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('throws NotFound when id is missing or wrong company', async () => {
      prisma.departureReason.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('x', 1, 10001)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes and records history', async () => {
      const existing = { id: 'r1', name: 'x', companyId: 1 };
      prisma.departureReason.findFirst.mockResolvedValueOnce(existing);
      prisma.departureReason.update.mockResolvedValueOnce({ ...existing });

      const result = await service.remove('r1', 1, 10001);
      expect(prisma.departureReason.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({
            deletedById: 10001,
          }),
        }),
      );
      expect(entityHistory.recordDelete).toHaveBeenCalled();
      expect(result).toEqual({ message: "Sabab o'chirildi" });
    });
  });
});
