import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockExamStatus } from '@prisma/client';
import { MockExamSubjectsService } from './mock-exam-subjects.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('MockExamSubjectsService', () => {
  let service: MockExamSubjectsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      mockExam: { findFirst: jest.fn() },
      mockExamSubject: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamSubjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = mod.get(MockExamSubjectsService);
  });

  describe('create', () => {
    it('throws NotFound when exam is missing', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);
      await expect(
        service.create('e1', { name: 'Reading', maxScore: 30 }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects subject creation in GRADING status', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
      });
      await expect(
        service.create('e1', { name: 'Reading', maxScore: 30 }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('appends to the end and records history', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamSubject.aggregate.mockResolvedValue({
        _max: { order: 1 },
      });
      prisma.mockExamSubject.create.mockResolvedValue({
        id: 'sub-1',
        examId: 'e1',
        name: 'Reading',
        maxScore: 30,
        order: 2,
      });

      const result = await service.create(
        'e1',
        { name: 'Reading', maxScore: 30 },
        1001,
        1,
      );

      expect(result.order).toBe(2);
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'MockExamSubject' }),
      );
    });
  });

  describe('update', () => {
    it('rejects update when exam is GRADING', async () => {
      prisma.mockExamSubject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Old',
        maxScore: 30,
        exam: { status: MockExamStatus.GRADING },
      });
      await expect(
        service.update('sub-1', { name: 'New' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates name + records history when exam is still editable', async () => {
      prisma.mockExamSubject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Old',
        maxScore: 30,
        exam: { status: MockExamStatus.REGISTRATION_OPEN },
      });
      prisma.mockExamSubject.update.mockResolvedValue({
        id: 'sub-1',
        name: 'New',
        maxScore: 30,
        order: 0,
      });

      const result = await service.update('sub-1', { name: 'New' }, 1001, 1);
      expect(result.name).toBe('New');
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('hard-deletes when exam still in editable status', async () => {
      prisma.mockExamSubject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Reading',
        maxScore: 30,
        exam: { status: MockExamStatus.REGISTRATION_OPEN },
      });

      const result = await service.remove('sub-1', 1001, 1);

      expect(prisma.mockExamSubject.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
      expect(result.message).toBeDefined();
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });
});
