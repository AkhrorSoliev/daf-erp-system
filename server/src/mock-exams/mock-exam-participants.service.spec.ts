import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from './mock-exam-billing.service';

describe('MockExamParticipantsService', () => {
  let service: MockExamParticipantsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      mockExam: { findFirst: jest.fn() },
      mockExamParticipant: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 10500 }),
      },
      // nextval(Student_id_seq) mock — returns a fresh id from the shared
      // sequence each time the service allocates a publicId for an
      // outsider. Default value matches the legacy "10500" stub.
      $queryRaw: jest.fn().mockResolvedValue([{ next: BigInt(10500) }]),
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };
    const billing = { tryDeductForStudent: jest.fn().mockResolvedValue({ paidCount: 0, deductedAmount: 0 }) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: MockExamBillingService, useValue: billing },
      ],
    }).compile();
    service = mod.get(MockExamParticipantsService);
  });

  describe('list', () => {
    it('throws NotFound when exam is missing', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);
      await expect(service.list('missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns paginated participants', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      const result = await service.list('e1', { page: 2, pageSize: 5 });
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(prisma.mockExamParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('applies search filter to name / phone / username', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      await service.list('e1', { search: 'Aziz' });

      expect(prisma.mockExamParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('addManual', () => {
    it('rejects manual add in GRADING', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.GRADING,
      });
      await expect(
        service.addManual(
          'e1',
          { firstName: 'A', lastName: 'B', phone: '901234567' },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty first/last name', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      await expect(
        service.addManual(
          'e1',
          { firstName: '  ', lastName: 'B', phone: '901234567' },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allocates a fresh publicId from the shared sequence for outsiders', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      // Student lookup misses — this person is not a DaF student.
      prisma.student.findFirst.mockResolvedValue(null);
      // nextval returns the next id from Student_id_seq.
      prisma.$queryRaw.mockResolvedValue([{ next: BigInt(10500) }]);
      prisma.mockExamParticipant.create.mockResolvedValue({
        id: 'p1',
        publicId: 10500,
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        telegramChatId: null,
        telegramUsername: null,
        registeredAt: new Date(),
        studentId: null,
        totalScore: null,
        percentage: null,
        passed: null,
        rank: null,
      });

      const result = await service.addManual(
        'e1',
        { firstName: 'Aziz', lastName: 'Karimov', phone: '901234567' },
        1001,
        1,
      );

      // No Student row should be created — mock participants are not students.
      expect(prisma.student.create).not.toHaveBeenCalled();

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.publicId).toBe(10500);
      expect(callArg.data.studentId).toBeNull();
      expect(callArg.data.telegramChatId).toBeNull();
      expect(result.id).toBe('p1');
      expect(history.recordCreate).toHaveBeenCalled();
    });

    it('reuses Student.id as publicId when phone matches a DaF student', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.student.findFirst.mockResolvedValue({ id: 10117 });
      prisma.mockExamParticipant.create.mockResolvedValue({
        id: 'p2',
        publicId: 10117,
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        telegramChatId: null,
        telegramUsername: null,
        registeredAt: new Date(),
        studentId: 10117,
        totalScore: null,
        percentage: null,
        passed: null,
        rank: null,
      });

      await service.addManual(
        'e1',
        { firstName: 'Aziz', lastName: 'Karimov', phone: '901234567' },
        1001,
        1,
      );

      // No sequence allocation — we reuse the existing Student.id.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.publicId).toBe(10117);
      expect(callArg.data.studentId).toBe(10117);
    });

    it('translates P2002 unique violation into BadRequest', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      const err = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7',
      });
      prisma.mockExamParticipant.create.mockRejectedValue(err);

      await expect(
        service.addManual(
          'e1',
          {
            firstName: 'Aziz',
            lastName: 'Karimov',
            phone: '901234567',
            telegramChatId: '12345',
          },
          1001,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('soft-deletes a participant', async () => {
      prisma.mockExamParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      await service.remove('p1', 1001, 1);
      expect(prisma.mockExamParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });
});
