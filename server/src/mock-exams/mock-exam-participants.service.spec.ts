import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MockExamStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from './mock-exam-billing.service';

describe('MockExamParticipantsService', () => {
  let service: MockExamParticipantsService;
  let prisma: any;
  let history: any;
  let billingMock: any;

  beforeEach(async () => {
    prisma = {
      mockExam: {
        // `ensureExam` is now the company/branch gate for everything reached
        // through an exam, so a participant write resolves it too. Default to
        // an open exam in this company so existing cases are unaffected.
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'REGISTRATION_OPEN',
          branchId: 1,
        }),
        // Pricing lookup used by addManual to compute the DaF-discounted
        // fee. Defaults to a free exam so existing tests are unaffected.
        findUnique: jest
          .fn()
          .mockResolvedValue({ price: 0, studentPrice: null }),
      },
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
    const billing = {
      tryDeductForStudent: jest
        .fn()
        .mockResolvedValue({ paidCount: 0, deductedAmount: 0 }),
      refundParticipantFee: jest.fn().mockResolvedValue(0),
    };
    billingMock = billing;
    const eventEmitter = { emit: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MockExamParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
        { provide: MockExamBillingService, useValue: billing },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();
    service = mod.get(MockExamParticipantsService);
  });

  describe('list', () => {
    it('throws NotFound when exam is missing', async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);
      await expect(service.list('missing', {}, 1001, null)).rejects.toThrow(
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

      const result = await service.list(
        'e1',
        { page: 2, pageSize: 5 },
        1001,
        null,
      );
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

      await service.list('e1', { search: 'Aziz' }, 1001, null);

      expect(prisma.mockExamParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('applies time / level / cash filters to the query', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      await service.list(
        'e1',
        {
          examTime: ['14:00'],
          level: ['B1'],
          paidStatus: ['cash'],
        } as any,
        1001,
        null,
      );

      const arg = prisma.mockExamParticipant.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(
        expect.objectContaining({
          examTime: '14:00',
          level: 'B1',
          AND: [
            {
              OR: [
                {
                  paid: false,
                  formData: { path: ['__payIntent'], equals: 'CASH' },
                },
              ],
            },
          ],
        }),
      );
    });

    it('bir nechta vaqt va daraja tanlansa `in` bilan filtrlaydi', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      await service.list(
        'e1',
        { examTime: ['10:00', '14:00'], level: ['A2', 'B1'] } as any,
        1001,
        null,
      );

      const arg = prisma.mockExamParticipant.findMany.mock.calls[0][0];
      expect(arg.where).toEqual(
        expect.objectContaining({
          examTime: { in: ['10:00', '14:00'] },
          level: { in: ['A2', 'B1'] },
        }),
      );
    });

    it("bir nechta to'lov holati OR bilan birlashadi", async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      await service.list(
        'e1',
        { paidStatus: ['paid', 'cash'] } as any,
        1001,
        null,
      );

      const arg = prisma.mockExamParticipant.findMany.mock.calls[0][0];
      expect(arg.where.AND).toEqual([
        {
          OR: [
            { paid: true },
            {
              paid: false,
              formData: { path: ['__payIntent'], equals: 'CASH' },
            },
          ],
        },
      ]);
    });

    it('filters "pending" as unpaid without a cash intent', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([]);
      prisma.mockExamParticipant.count.mockResolvedValue(0);

      await service.list('e1', { paidStatus: ['pending'] } as any, 1001, null);

      const arg = prisma.mockExamParticipant.findMany.mock.calls[0][0];
      expect(arg.where.AND).toEqual([
        {
          OR: [
            {
              paid: false,
              NOT: { formData: { path: ['__payIntent'], equals: 'CASH' } },
            },
          ],
        },
      ]);
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
          null,
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
          null,
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
        null,
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
        null,
      );

      // No sequence allocation — we reuse the existing Student.id.
      expect(prisma.$queryRaw).not.toHaveBeenCalled();

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.publicId).toBe(10117);
      expect(callArg.data.studentId).toBe(10117);
    });

    it('applies the DaF discount + level when phone matches a student', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExam.findUnique.mockResolvedValue({
        price: 100000,
        studentPrice: 50000,
      });
      prisma.student.findFirst.mockResolvedValue({ id: 10117 });
      prisma.mockExamParticipant.create.mockResolvedValue({ id: 'p3' });

      await service.addManual(
        'e1',
        {
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          level: 'B1',
        },
        1001,
        1,
        null,
      );

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.studentId).toBe(10117);
      expect(callArg.data.feeAmount).toBe(50000); // DaF discounted price
      expect(callArg.data.level).toBe('B1');
    });

    it('charges full price + no student link for an outsider', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExam.findUnique.mockResolvedValue({
        price: 100000,
        studentPrice: 50000,
      });
      prisma.student.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([{ next: BigInt(10777) }]);
      prisma.mockExamParticipant.create.mockResolvedValue({ id: 'p4' });

      await service.addManual(
        'e1',
        { firstName: 'Aziz', lastName: 'Karimov', phone: '901234567' },
        1001,
        1,
        null,
      );

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.studentId).toBeNull();
      expect(callArg.data.feeAmount).toBe(100000); // full price for outsiders
    });

    it('uses an explicit studentId (admin pick) + applies the DaF discount', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExam.findUnique.mockResolvedValue({
        price: 100000,
        studentPrice: 40000,
      });
      // The explicit student lookup succeeds; the phone lookup must NOT run.
      prisma.student.findFirst.mockResolvedValue({ id: 10222 });
      prisma.mockExamParticipant.create.mockResolvedValue({ id: 'p5' });

      await service.addManual(
        'e1',
        {
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          studentId: 10222,
        },
        1001,
        1,
        null,
      );

      // Student was resolved by id + company scope, not by phone.
      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 10222, companyId: 1001 }),
        }),
      );
      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.studentId).toBe(10222);
      expect(callArg.data.feeAmount).toBe(40000);
    });

    it('rejects an explicit studentId that does not resolve', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.mockExam.findUnique.mockResolvedValue({
        price: 100000,
        studentPrice: 40000,
      });
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.addManual(
          'e1',
          {
            firstName: 'Aziz',
            lastName: 'Karimov',
            phone: '901234567',
            studentId: 99999,
          },
          1001,
          1,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
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
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markPaid', () => {
    it('flips paid + emits mock.participant.paid for the Telegram notice', async () => {
      const emit = jest.fn();
      (service as any).eventEmitter = { emit };
      prisma.mockExamParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        paid: false,
        feeAmount: 50000,
        exam: { price: 100000, title: 'Goethe B1' },
      });
      prisma.mockExamParticipant.update.mockResolvedValue({
        id: 'p1',
        publicId: 10117,
        telegramChatId: '555',
        feeAmount: 50000,
        paid: true,
      });

      await service.markPaid('p1', { method: 'CASH' } as any, 1001, 1, null);

      expect(prisma.mockExamParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paid: true }),
        }),
      );
      expect(emit).toHaveBeenCalledWith(
        'mock.participant.paid',
        expect.objectContaining({
          telegramChatId: '555',
          publicId: 10117,
          examTitle: 'Goethe B1',
          feeAmount: 50000,
        }),
      );
    });

    it('rejects a free exam (fee resolves to 0)', async () => {
      prisma.mockExamParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        paid: false,
        feeAmount: null,
        exam: { price: 0, title: 'Bepul' },
      });
      await expect(
        service.markPaid('p1', { method: 'CASH' } as any, 1001, 1, null),
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
      await service.remove('p1', 1001, 1, null);
      expect(prisma.mockExamParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });

    // Two students on the August 2026 exam were billed 30 000 so'm twice: the
    // admin deleted their registration (fee kept, `paid` still true on the dead
    // row) and they re-registered minutes later. The per-exam unique index only
    // counts live rows, so nothing stopped the second charge.
    it('returns the fee to the balance before the row is removed', async () => {
      prisma.mockExamParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      billingMock.refundParticipantFee.mockResolvedValue(30_000);

      const res = await service.remove('p1', 1001, 1, null);

      expect(billingMock.refundParticipantFee).toHaveBeenCalledWith('p1', 1);
      expect(res.refunded).toBe(30_000);
      expect(res.message).toContain('30');

      // The refund must happen BEFORE the soft delete — afterwards the fee's
      // participant is gone and nothing links the money back to it.
      const refundOrder =
        billingMock.refundParticipantFee.mock.invocationCallOrder[0];
      const deleteOrder =
        prisma.mockExamParticipant.update.mock.invocationCallOrder[0];
      expect(refundOrder).toBeLessThan(deleteOrder);
    });

    it('says nothing about money when the participant paid cash', async () => {
      prisma.mockExamParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
      });
      billingMock.refundParticipantFee.mockResolvedValue(0);

      const res = await service.remove('p1', 1001, 1, null);

      expect(res.refunded).toBe(0);
      expect(res.message).toBe("Ishtirokchi o'chirildi");
    });
  });
});
