import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamStatus } from '@prisma/client';
import { MockExamsService } from './mock-exams.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamPdfService } from './mock-exam-pdf.service';

describe('MockExamsService', () => {
  let service: MockExamsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      mockExamSection: { findFirst: jest.fn(), findMany: jest.fn() },
      mockExam: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      mockExamParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const pdfService = { generate: jest.fn().mockResolvedValue({ url: 'http://x/pdf' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: MockExamPdfService, useValue: pdfService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(MockExamsService);
  });

  const sampleSubjects = [
    { name: 'Lesen', maxScore: 30 },
    { name: 'Hören', maxScore: 30 },
  ];

  describe('create', () => {
    it('rejects an empty title', async () => {
      await expect(
        service.create(
          {
            sectionId: 'sec-1',
            title: '   ',
            maxScore: 100,
            subjects: sampleSubjects,
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when section is missing', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          {
            sectionId: 'missing',
            title: 'IELTS',
            maxScore: 100,
            subjects: sampleSubjects,
          },
          1001,
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when passingScore exceeds maxScore', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      await expect(
        service.create(
          {
            sectionId: 'sec-1',
            title: 'IELTS',
            maxScore: 50,
            passingScore: 80,
            subjects: sampleSubjects,
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when deadline is after examDate', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      await expect(
        service.create(
          {
            sectionId: 'sec-1',
            title: 'IELTS',
            maxScore: 100,
            examDate: '2026-06-01T00:00:00.000Z',
            registrationDeadline: '2026-06-15T00:00:00.000Z',
            subjects: sampleSubjects,
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate subject names', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      await expect(
        service.create(
          {
            sectionId: 'sec-1',
            title: 'IELTS',
            maxScore: 100,
            subjects: [
              { name: 'Lesen', maxScore: 30 },
              { name: 'lesen', maxScore: 30 },
            ],
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the exam with a generated bot payload and records history', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.mockExam.create.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        description: null,
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 'sec-1',
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 60,
        passingScore: null,
        botStartPayload: 'abc',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 'sec-1', name: 'IELTS', color: null },
        subjects: [
          { id: 's1', name: 'Lesen', maxScore: 30, order: 0 },
          { id: 's2', name: 'Hören', maxScore: 30, order: 1 },
        ],
        _count: { participants: 0 },
      });

      const result = await service.create(
        {
          sectionId: 'sec-1',
          title: 'IELTS',
          subjects: sampleSubjects,
        },
        1001,
        1,
      );

      // Subjects are seeded by the create call now — verify the nested
      // create payload reflects the DTO order and per-subject maxScore.
      const createCall = prisma.mockExam.create.mock.calls[0][0];
      expect(createCall.data.subjects).toEqual({
        create: [
          { name: 'Lesen', maxScore: 30, passingScore: null, order: 0 },
          { name: 'Hören', maxScore: 30, passingScore: null, order: 1 },
        ],
      });
      // maxScore auto-sums to subject totals when admin didn't pass one
      expect(createCall.data.maxScore).toBe(60);

      expect(prisma.mockExam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'IELTS',
            status: MockExamStatus.REGISTRATION_OPEN,
            sectionId: 'sec-1',
            botStartPayload: expect.any(String),
            createdById: 1,
          }),
        }),
      );
      expect(result.botStartPayload).toBe('abc');
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'MockExam',
          entityId: 'e1',
        }),
      );
    });

    it('persists the DaF student price + sanitized offered levels', async () => {
      prisma.mockExamSection.findFirst.mockResolvedValue({ id: 'sec-1' });
      prisma.mockExam.create.mockResolvedValue({
        id: 'e2',
        title: 'Goethe B1',
        description: null,
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 'sec-1',
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 60,
        passingScore: null,
        price: 100000,
        studentPrice: 50000,
        offeredLevels: ['A1', 'B1'],
        botStartPayload: 'xyz',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 'sec-1', name: 'IELTS', color: null },
        subjects: [],
        _count: { participants: 0 },
      });

      await service.create(
        {
          sectionId: 'sec-1',
          title: 'Goethe B1',
          price: 100000,
          studentPrice: 50000,
          // Includes junk + a dup + wrong order — must be sanitized.
          offeredLevels: ['B1', 'A1', 'X', 'A1'],
          subjects: sampleSubjects,
        },
        1001,
        1,
      );

      const createCall = prisma.mockExam.create.mock.calls[0][0];
      expect(createCall.data.price).toBe(100000);
      expect(createCall.data.studentPrice).toBe(50000);
      expect(createCall.data.offeredLevels).toEqual(['A1', 'B1']);
    });
  });

  describe('revenueSummary', () => {
    it('sums the locked-in feeAmount (falling back to exam price)', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        { feeAmount: 50000, exam: { price: 100000 } }, // DaF discounted
        { feeAmount: 100000, exam: { price: 100000 } }, // full price
        { feeAmount: null, exam: { price: 80000 } }, // legacy → falls back
      ]);
      prisma.mockExamParticipant.count.mockResolvedValue(3);
      prisma.mockExam.count.mockResolvedValue(1);

      const result = await service.revenueSummary();

      expect(result.totalRevenue).toBe(230000);
      expect(result.totalPaid).toBe(3);
    });
  });

  describe('update', () => {
    it('allows description / dates / title updates after registration has opened', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 'sec-1',
        title: 'IELTS',
        maxScore: 100,
        passingScore: null,
        examDate: null,
        registrationDeadline: null,
      });
      prisma.mockExam.update.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        description: 'Yangi tavsif',
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 'sec-1',
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 100,
        passingScore: null,
        botStartPayload: 'abc',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 'sec-1', name: 'IELTS', color: null },
        _count: { participants: 0 },
      });

      await service.update('e1', { description: 'Yangi tavsif' }, 1001, 1);

      expect(prisma.mockExam.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e1' },
          data: expect.objectContaining({ description: 'Yangi tavsif' }),
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('rejects an invalid transition', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      await expect(
        service.changeStatus('e1', MockExamStatus.ANNOUNCED, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('moves REGISTRATION_OPEN → REGISTRATION_CLOSED and records history', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExam.update.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        description: null,
        status: MockExamStatus.REGISTRATION_CLOSED,
        sectionId: 'sec-1',
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 100,
        passingScore: null,
        botStartPayload: 'abc',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 'sec-1', name: 'IELTS', color: null },
        _count: { participants: 0 },
      });

      const result = await service.changeStatus(
        'e1',
        MockExamStatus.REGISTRATION_CLOSED,
        1001,
        1,
      );

      expect(result.status).toBe(MockExamStatus.REGISTRATION_CLOSED);
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'MockExam',
          entityId: 'e1',
          oldValues: { status: MockExamStatus.REGISTRATION_OPEN },
          newValues: { status: MockExamStatus.REGISTRATION_CLOSED },
        }),
      );
    });
  });

  describe('update formFields', () => {
    const existingDraft = {
      id: 'e1',
      status: MockExamStatus.REGISTRATION_OPEN,
      sectionId: 'sec-1',
      title: 'IELTS',
      maxScore: 100,
      passingScore: null,
      examDate: null,
      registrationDeadline: null,
    };

    function validFields() {
      return [
        {
          id: 'f1',
          type: 'text',
          label: 'Ismingiz',
          required: true,
          mapsTo: 'firstName',
        },
        {
          id: 'f2',
          type: 'text',
          label: 'Familyangiz',
          required: true,
          mapsTo: 'lastName',
        },
        {
          id: 'f3',
          type: 'phone',
          label: 'Telefon',
          required: true,
          mapsTo: 'phone',
        },
      ];
    }

    it('rejects duplicate field ids', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(existingDraft);
      const fields = validFields();
      fields[1].id = fields[0].id;
      await expect(
        service.update('e1', { formFields: fields as any }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when phone slot is missing', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(existingDraft);
      const fields = validFields().filter((f) => f.mapsTo !== 'phone');
      await expect(
        service.update('e1', { formFields: fields as any }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when phone is bound to a non-phone field', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(existingDraft);
      const fields = validFields();
      fields[2].type = 'text';
      await expect(
        service.update('e1', { formFields: fields as any }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects select fields with no options', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(existingDraft);
      const fields = validFields();
      fields.push({
        id: 'f4',
        type: 'select',
        label: 'Daraja',
        required: false,
      } as any);
      await expect(
        service.update('e1', { formFields: fields as any }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves a valid form fields array', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(existingDraft);
      prisma.mockExam.update.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        description: null,
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 'sec-1',
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 100,
        passingScore: null,
        botStartPayload: 'abc',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 'sec-1', name: 'IELTS', color: null },
        _count: { participants: 0 },
      });

      await service.update(
        'e1',
        { formFields: validFields() as any },
        1001,
        1,
      );

      expect(prisma.mockExam.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ formFields: expect.any(Array) }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes the exam', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        title: 'IELTS',
        status: MockExamStatus.REGISTRATION_OPEN,
      });

      const result = await service.remove('e1', 1001, 1);

      expect(result.message).toBeDefined();
      expect(prisma.mockExam.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });
});
