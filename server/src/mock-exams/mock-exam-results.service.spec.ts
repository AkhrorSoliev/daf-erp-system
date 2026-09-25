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
        deleteMany: jest.fn(),
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
      await expect(service.matrix('missing', 1001, null)).rejects.toThrow(
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

      const result = await service.matrix('e1', 1001, null);
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
          null,
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
          null,
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
          null,
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
      // validation → [p1]; ranking (totalScore filter) and matrix → []
      prisma.mockExamParticipant.findMany.mockImplementation(
        async ({ where, include }: any) =>
          where?.totalScore || include ? [] : [{ id: 'p1' }],
      );
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
        null,
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

      const result = await service.recalculateRanks('e1', 1001, 1, null);

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

      const result = await service.recalculateRanks('e1', 1001, 1, null);

      expect(result.graded).toBe(0);
      expect(prisma.mockExamParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rank: null },
        }),
      );
    });
  });

  // Natijalar bo'limi imtihonni faqat id bo'yicha qidirardi: bir filial admini
  // boshqa filial imtihonining ism/telefon/baholarini ko'rib, ularni o'zgartira
  // olardi (id'lar o'quvchi profilidagi mock tab'ida ko'rinadi).
  describe('filial qamrovi', () => {
    it('imtihonni kompaniya va filial bilan qidiradi', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);

      await expect(service.matrix('e1', 1001, [5])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mockExam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'e1',
            deletedAt: null,
            companyId: 1001,
            branchId: { in: [5] },
          }),
        }),
      );
    });

    it("boshqa filial imtihoniga baho yozib bo'lmaydi", async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkSave(
          'e1',
          { participants: [{ participantId: 'p1', scores: [] }] },
          1001,
          1,
          [5],
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.mockExamSubjectScore.upsert).not.toHaveBeenCalled();
    });
  });

  describe("bulkSave — qo'shimcha", () => {
    const gradingExam = {
      id: 'e1',
      title: 'IELTS',
      status: MockExamStatus.GRADING,
      maxScore: 60,
      passingScore: null,
    };

    beforeEach(() => {
      prisma.mockExam.findFirst.mockResolvedValue(gradingExam);
      prisma.mockExamSubject.findMany.mockResolvedValue([
        { id: 'sub-r', maxScore: 30 },
        { id: 'sub-w', maxScore: 30 },
      ]);
      prisma.mockExamParticipant.findMany.mockImplementation(
        async ({ where }: any) =>
          where?.totalScore
            ? [
                { id: 'p2', totalScore: 50 },
                { id: 'p1', totalScore: 40 },
              ]
            : [
                { id: 'p1', subjectScores: [] },
                { id: 'p2', subjectScores: [] },
              ],
      );
      prisma.mockExamSubjectScore.findMany.mockResolvedValue([{ score: 20 }]);
    });

    // O'rin faqat "O'rinlarni qayta hisoblash" tugmasi bilan yozilardi. Tugma
    // bosilmasa, e'lon qilingan PDF'da o'rin "—" yoki eski qiymat chiqardi.
    it("baholar saqlanganda o'rinlarni o'zi qayta hisoblaydi", async () => {
      await service.bulkSave(
        'e1',
        {
          participants: [
            {
              participantId: 'p1',
              scores: [{ subjectId: 'sub-r', score: 20 }],
            },
          ],
        },
        1001,
        1,
        null,
      );

      const rankOf = (id: string) =>
        prisma.mockExamParticipant.update.mock.calls
          .map((c: any) => c[0])
          .find((c: any) => c.where.id === id && c.data.rank !== undefined)
          ?.data.rank;
      expect(rankOf('p2')).toBe(1);
      expect(rankOf('p1')).toBe(2);
    });

    // Kelmagan odamga xato kiritilgan bahoni o'chirib bo'lmasdi: server faqat
    // upsert qilardi, klient esa bo'shatilgan katakni yubormasdi.
    it("score: null o'sha fan bahosini o'chiradi", async () => {
      await service.bulkSave(
        'e1',
        {
          participants: [
            {
              participantId: 'p1',
              scores: [{ subjectId: 'sub-w', score: null }],
            },
          ],
        } as any,
        1001,
        1,
        null,
      );

      expect(prisma.mockExamSubjectScore.deleteMany).toHaveBeenCalledWith({
        where: { participantId: 'p1', subjectId: 'sub-w' },
      });
      expect(prisma.mockExamSubjectScore.upsert).not.toHaveBeenCalled();
    });

    it("barcha baholari o'chirilgan ishtirokchi baholanmagan bo'lib qoladi", async () => {
      prisma.mockExamSubjectScore.findMany.mockResolvedValue([]);

      await service.bulkSave(
        'e1',
        {
          participants: [
            {
              participantId: 'p1',
              scores: [{ subjectId: 'sub-r', score: null }],
            },
          ],
        } as any,
        1001,
        1,
        null,
      );

      const row = prisma.mockExamParticipant.update.mock.calls
        .map((c: any) => c[0])
        .find((c: any) => c.where.id === 'p1' && 'totalScore' in c.data);
      expect(row.data.totalScore).toBeNull();
      expect(row.data.percentage).toBeNull();
      expect(row.data.passed).toBeNull();
    });
  });
});
