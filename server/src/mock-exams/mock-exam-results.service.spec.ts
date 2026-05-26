import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockExamStatus } from '@prisma/client';
import { MockExamResultsService } from './mock-exam-results.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('MockExamResultsService', () => {
  let service: MockExamResultsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      mockExam: { findFirst: jest.fn() },
      mockExamSubject: { findMany: jest.fn() },
      mockExamParticipant: {
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      mockExamSubjectScore: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (arg) => {
        // Support both array form (used by recalculateRanks) and callback form
        // (used by bulkSave).
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.all(arg);
      }),
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
        MockExamResultsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = mod.get(MockExamResultsService);
  });

  describe('matrix', () => {
    it('throws NotFound when exam missing', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);
      await expect(service.matrix('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns subjects + participants with scoresBySubjectId', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: 60,
      });
      prisma.mockExamSubject.findMany.mockResolvedValue([
        { id: 'sub-r', name: 'Reading', maxScore: 30, order: 0 },
        { id: 'sub-w', name: 'Writing', maxScore: 30, order: 1 },
      ]);
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        {
          id: 'p1',
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          totalScore: 50,
          percentage: 50,
          passed: false,
          rank: 1,
          feedback: null,
          gradedAt: null,
          subjectScores: [
            { subjectId: 'sub-r', score: 25, feedback: null },
            { subjectId: 'sub-w', score: 25, feedback: null },
          ],
        },
      ]);

      const result = await service.matrix('e1');
      expect(result.subjects).toHaveLength(2);
      expect(result.participants[0].scoresBySubjectId).toEqual({
        'sub-r': 25,
        'sub-w': 25,
      });
    });
  });

  describe('bulkSave', () => {
    it('rejects when exam is not GRADING', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
        maxScore: 100,
        passingScore: null,
      });
      await expect(
        service.bulkSave(
          'e1',
          { participants: [{ participantId: 'p1', scores: [] }] },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown subject id', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: null,
      });
      prisma.mockExamSubject.findMany.mockResolvedValue([
        { id: 'sub-r', maxScore: 30 },
      ]);
      prisma.mockExamParticipant.findMany.mockResolvedValue([{ id: 'p1' }]);

      await expect(
        service.bulkSave(
          'e1',
          {
            participants: [
              {
                participantId: 'p1',
                scores: [{ subjectId: 'unknown', score: 10 }],
              },
            ],
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects score above subject maxScore', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: null,
      });
      prisma.mockExamSubject.findMany.mockResolvedValue([
        { id: 'sub-r', maxScore: 30 },
      ]);
      prisma.mockExamParticipant.findMany.mockResolvedValue([{ id: 'p1' }]);

      await expect(
        service.bulkSave(
          'e1',
          {
            participants: [
              {
                participantId: 'p1',
                scores: [{ subjectId: 'sub-r', score: 35 }],
              },
            ],
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists and recomputes total + percentage + passed', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: 60,
      });
      prisma.mockExamSubject.findMany
        .mockResolvedValueOnce([
          { id: 'sub-r', maxScore: 30 },
          { id: 'sub-w', maxScore: 30 },
        ])
        // matrix() at the end also calls findMany
        .mockResolvedValueOnce([]);
      prisma.mockExamParticipant.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([]);
      prisma.mockExamSubjectScore.findMany.mockResolvedValue([
        { score: 25 },
        { score: 30 },
      ]);

      await service.bulkSave(
        'e1',
        {
          participants: [
            {
              participantId: 'p1',
              scores: [
                { subjectId: 'sub-r', score: 25 },
                { subjectId: 'sub-w', score: 30 },
              ],
            },
          ],
        },
        1001,
        1,
      );

      const updateCall = prisma.mockExamParticipant.update.mock.calls.find(
        ([arg]: any) => arg.where?.id === 'p1',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0].data.totalScore).toBe(55);
      expect(updateCall[0].data.percentage).toBeCloseTo(55, 2);
      // passingScore=60, total=55 → not passed
      expect(updateCall[0].data.passed).toBe(false);
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('recalculateRanks', () => {
    it('assigns standard competition ranks (ties share, next skips)', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: null,
      });
      // Sorted DESC by totalScore: 90, 80, 80, 70 → ranks 1, 2, 2, 4
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        { id: 'p1', totalScore: 90 },
        { id: 'p2', totalScore: 80 },
        { id: 'p3', totalScore: 80 },
        { id: 'p4', totalScore: 70 },
      ]);
      prisma.mockExamParticipant.update.mockImplementation((arg: any) =>
        Promise.resolve(arg),
      );

      const result = await service.recalculateRanks('e1', 1001, 1);

      expect(result.graded).toBe(4);
      // Inspect the rank assignment calls
      const calls = prisma.mockExamParticipant.update.mock.calls.map(
        (c: any) => c[0],
      );
      const rankOf = (id: string) =>
        calls.find((c: any) => c.where.id === id)?.data.rank;
      expect(rankOf('p1')).toBe(1);
      expect(rankOf('p2')).toBe(2);
      expect(rankOf('p3')).toBe(2);
      expect(rankOf('p4')).toBe(4);
    });

    it('clears ranks when nothing graded', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
        maxScore: 100,
        passingScore: null,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);

      const result = await service.recalculateRanks('e1', 1001, 1);

      expect(result.graded).toBe(0);
      expect(prisma.mockExamParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rank: null },
        }),
      );
    });
  });
});
