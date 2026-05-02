import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StudentExitReasonsService } from './student-exit-reasons.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('StudentExitReasonsService', () => {
  let service: StudentExitReasonsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      studentExitReason: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentExitReasonsService,
        { provide: PrismaService, useValue: prisma },
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

    service = module.get(StudentExitReasonsService);
  });

  describe('findAll', () => {
    it('lists reasons scoped by company without filter', async () => {
      prisma.studentExitReason.findMany.mockResolvedValue([
        { id: 'r1', name: 'A', appliesTo: ['GROUP_REMOVAL'], createdAt: new Date() },
      ]);
      await service.findAll(1001);
      expect(prisma.studentExitReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 1001, deletedAt: null },
        }),
      );
    });

    it('filters by appliesTo when provided', async () => {
      prisma.studentExitReason.findMany.mockResolvedValue([]);
      await service.findAll(1001, 'FREEZE' as any);
      expect(prisma.studentExitReason.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            deletedAt: null,
            appliesTo: { has: 'FREEZE' },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('rejects empty name', async () => {
      await expect(
        service.create(
          { name: '   ', appliesTo: ['GROUP_REMOVAL'] as any },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate name in same company', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create(
          { name: 'Moliyaviy', appliesTo: ['GROUP_REMOVAL'] as any },
          1001,
          1,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('persists name + appliesTo on create', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValue(null);
      prisma.studentExitReason.create.mockResolvedValue({
        id: 'r1',
        name: 'Moliyaviy',
        appliesTo: ['GROUP_REMOVAL', 'FREEZE'],
      });

      await service.create(
        { name: 'Moliyaviy', appliesTo: ['GROUP_REMOVAL', 'FREEZE'] as any },
        1001,
        1,
      );

      expect(prisma.studentExitReason.create).toHaveBeenCalledWith({
        data: {
          name: 'Moliyaviy',
          appliesTo: ['GROUP_REMOVAL', 'FREEZE'],
          companyId: 1001,
        },
      });
    });
  });

  describe('update', () => {
    it('throws NotFound for missing or wrong-company reason', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates appliesTo independently of name', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValueOnce({
        id: 'r1',
        name: 'Moliyaviy',
        appliesTo: ['GROUP_REMOVAL'],
      });
      prisma.studentExitReason.update.mockResolvedValue({
        id: 'r1',
        name: 'Moliyaviy',
        appliesTo: ['GROUP_REMOVAL', 'FREEZE'],
      });

      await service.update(
        'r1',
        { appliesTo: ['GROUP_REMOVAL', 'FREEZE'] as any },
        1001,
        1,
      );

      expect(prisma.studentExitReason.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { appliesTo: ['GROUP_REMOVAL', 'FREEZE'] },
      });
    });
  });

  describe('remove', () => {
    it('soft-deletes the reason', async () => {
      prisma.studentExitReason.findFirst.mockResolvedValue({
        id: 'r1',
        name: 'X',
        appliesTo: ['GROUP_REMOVAL'],
      });
      await service.remove('r1', 1001, 1);
      expect(prisma.studentExitReason.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            deletedById: 1,
          }),
        }),
      );
    });
  });
});
