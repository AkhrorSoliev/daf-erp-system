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
      mockExam: { findFirst: jest.fn(), update: jest.fn() },
      mockExamSubject: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { order: null },
          _sum: { maxScore: null },
        }),
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
        service.create('e1', { name: 'Reading', maxScore: 30 }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects subject creation in GRADING status', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
      });
      await expect(
        service.create('e1', { name: 'Reading', maxScore: 30 }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('appends to the end and records history', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamSubject.aggregate.mockResolvedValue({
        _max: { order: 1 },
        _sum: { maxScore: 90 },
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
        null,
      );

      expect(result.order).toBe(2);
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'MockExamSubject' }),
      );
    });
  });

  describe('update', () => {
    it('rejects update when exam is GRADING', async () => {
      prisma.mockExamSubject.findFirst.mockResolvedValue({
        id: 'sub-1',
        name: 'Old',
        maxScore: 30,
        exam: { status: MockExamStatus.GRADING },
      });
      await expect(
        service.update('sub-1', { name: 'New' }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates name + records history when exam is still editable', async () => {
      prisma.mockExamSubject.findFirst.mockResolvedValue({
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

      const result = await service.update(
        'sub-1',
        { name: 'New' },
        1001,
        1,
        null,
      );
      expect(result.name).toBe('New');
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('hard-deletes when exam still in editable status', async () => {
      prisma.mockExamSubject.findFirst.mockResolvedValue({
        id: 'sub-1',
        name: 'Reading',
        maxScore: 30,
        exam: { status: MockExamStatus.REGISTRATION_OPEN },
      });

      const result = await service.remove('sub-1', 1001, 1, null);

      expect(prisma.mockExamSubject.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
      expect(result.message).toBeDefined();
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });

  // Fanlar bo'limi imtihon/fanni faqat id bo'yicha qidirardi — boshqa filial
  // imtihonining fanlarini o'zgartirish yoki o'chirish mumkin edi.
  describe('filial qamrovi', () => {
    it('fanni imtihon kompaniyasi va filiali bilan qidiradi', async () => {
      prisma.mockExamSubject.findFirst.mockResolvedValue(null);

      await expect(
        service.update('sub-1', { name: 'X' }, 1001, 1, [5]),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.mockExamSubject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'sub-1',
            exam: { deletedAt: null, companyId: 1001, branchId: { in: [5] } },
          },
        }),
      );
    });

    it('imtihonni kompaniya va filial bilan qidiradi', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);

      await expect(service.list('e1', 1001, [5])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mockExam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'e1',
            companyId: 1001,
            branchId: { in: [5] },
          }),
        }),
      );
    });
  });

  // Imtihon `maxScore` yaratishda fanlar yig'indisidan olinadi, keyin esa fan
  // qo'shilsa/o'zgarsa yangilanmasdi: 75 lik imtihonga 25 lik fan qo'shilgach
  // 90 ball olgan ishtirokchi 120% ko'rinardi.
  describe("imtihon maxScore fanlar yig'indisiga teng", () => {
    const openExam = { id: 'e1', status: MockExamStatus.REGISTRATION_OPEN };

    it("fan qo'shilganda yangilanadi", async () => {
      prisma.mockExam.findFirst.mockResolvedValue(openExam);
      prisma.mockExamSubject.aggregate.mockResolvedValue({
        _max: { order: 2 },
        _sum: { maxScore: 100 },
      });
      prisma.mockExamSubject.create.mockResolvedValue({ id: 's4', order: 3 });

      await service.create(
        'e1',
        { name: 'Sprechen', maxScore: 25 },
        1001,
        1,
        null,
      );

      expect(prisma.mockExam.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { maxScore: 100 },
      });
    });

    it("fan o'chirilganda yangilanadi", async () => {
      prisma.mockExamSubject.findFirst.mockResolvedValue({
        id: 'sub-1',
        examId: 'e1',
        name: 'Sprechen',
        maxScore: 25,
        passingScore: null,
        exam: { status: MockExamStatus.REGISTRATION_OPEN },
      });
      prisma.mockExamSubject.aggregate.mockResolvedValue({
        _sum: { maxScore: 75 },
      });

      await service.remove('sub-1', 1001, 1, null);

      expect(prisma.mockExam.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { maxScore: 75 },
      });
    });
  });

  // 30/18 bo'lgan fanning maksimumi 15 ga tushirilsa, PDF'da hamma katak —
  // hatto to'liq ball ham — "o'tmadi" deb qizil bo'yalardi.
  it("maxScore ni o'tish balidan pastga tushirib bo'lmaydi", async () => {
    prisma.mockExamSubject.findFirst.mockResolvedValue({
      id: 'sub-1',
      examId: 'e1',
      name: 'Lesen',
      maxScore: 30,
      passingScore: 18,
      exam: { status: MockExamStatus.REGISTRATION_OPEN },
    });

    await expect(
      service.update('sub-1', { maxScore: 15 }, 1001, 1, null),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.mockExamSubject.update).not.toHaveBeenCalled();
  });
});
