import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockExamSectionsService } from './mock-exam-sections.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('MockExamSectionsService', () => {
  let service: MockExamSectionsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      mockExamSection: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      mockExam: { count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamSectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(MockExamSectionsService);
  });

  describe('list', () => {
    it('returns sections with exam counts, in display order', async () => {
      prisma.mockExamSection.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'IELTS',
          color: '#3b82f6',
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { exams: 4 },
        },
      ]);

      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 's1', examCount: 4 });
      expect(prisma.mockExamSection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { order: 'asc' } }),
      );
    });
  });

  describe('create', () => {
    it('rejects an empty name', async () => {
      await expect(service.create({ name: '  ' }, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('appends to the end and records history', async () => {
      prisma.mockExamSection.aggregate.mockResolvedValue({
        _max: { order: 2 },
      });
      prisma.mockExamSection.create.mockResolvedValue({
        id: 's9',
        name: 'IELTS',
        color: '#3b82f6',
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        { name: 'IELTS', color: '#3b82f6' },
        1001,
        1,
      );

      expect(prisma.mockExamSection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'IELTS',
          color: '#3b82f6',
          order: 3,
          createdById: 1,
        }),
      });
      expect(result.examCount).toBe(0);
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'MockExamSection',
          entityId: 's9',
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFound for a missing section', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue(null);
      await expect(service.update('x', { name: 'Y' }, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when no fields provided', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({
        id: 's1',
        name: 'Old',
        color: null,
      });
      await expect(service.update('s1', {}, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('renames the section and records history', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({
        id: 's1',
        name: 'Old',
        color: null,
      });
      prisma.mockExamSection.update.mockResolvedValue({
        id: 's1',
        name: 'New',
        color: null,
        order: 0,
      });

      const result = await service.update('s1', { name: 'New' }, 1001, 1);

      expect(result).toMatchObject({ id: 's1', name: 'New' });
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses to delete a section that still has exams', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({
        id: 's1',
        name: 'IELTS',
        color: null,
      });
      prisma.mockExam.count.mockResolvedValue(3);
      await expect(service.remove('s1', 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('soft-deletes an empty section', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({
        id: 's1',
        name: 'IELTS',
        color: null,
      });
      prisma.mockExam.count.mockResolvedValue(0);

      const result = await service.remove('s1', 1001, 1);

      expect(result.message).toBeDefined();
      expect(prisma.mockExamSection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('rejects an unknown section id', async () => {
      prisma.mockExamSection.findMany.mockResolvedValue([{ id: 's1' }]);
      await expect(service.reorder({ sectionIds: ['other'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when not all sections are provided', async () => {
      prisma.mockExamSection.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
      ]);
      await expect(service.reorder({ sectionIds: ['s1'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('renumbers the sections inside a transaction', async () => {
      prisma.mockExamSection.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
      ]);
      await service.reorder({ sectionIds: ['s2', 's1'] });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
