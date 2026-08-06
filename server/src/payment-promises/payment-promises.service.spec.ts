import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentPromisesService } from './payment-promises.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('PaymentPromisesService', () => {
  let service: PaymentPromisesService;
  let prisma: {
    student: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
    studentBranch: { findFirst: jest.Mock };
    paymentPromise: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let history: {
    recordCreate: jest.Mock;
    recordStatusChange: jest.Mock;
    recordUpdate: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: 10264, balance: -50000 }),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ group: { branchId: 3 } }),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue(null) },
      paymentPromise: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'p1', ...data })),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'p1', status: 'CANCELLED' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    history = {
      recordCreate: jest.fn().mockResolvedValue(undefined),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentPromisesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(PaymentPromisesService);
  });

  describe('create', () => {
    it('snapshots balance, resolves branch from active enrollment, records history', async () => {
      const res = await service.create(
        { studentId: 10264, promiseDate: '2026-06-12', comment: 'Maoshdan keyin' },
        99,
        1001,
       null);
      expect(prisma.paymentPromise.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 10264,
          status: 'OPEN',
          balanceAtPromise: -50000,
          createdById: 99,
          branchId: 3,
          companyId: 1001,
          comment: 'Maoshdan keyin',
        }),
      });
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Student', entityId: '10264' }),
      );
      expect(res.id).toBe('p1');
    });

    it('throws NotFound when the student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create(
          { studentId: 1, promiseDate: '2026-06-12', comment: 'x' },
          99,
          1001,
         null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps the OPEN-per-student unique violation (P2002) to a friendly 400', async () => {
      prisma.paymentPromise.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.create(
          { studentId: 10264, promiseDate: '2026-06-12', comment: 'x' },
          99,
          1001,
         null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels an OPEN promise and records history', async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce({
        id: 'p1',
        studentId: 10264,
        status: 'OPEN',
      });
      const res = await service.cancel('p1', 99, 1001, null);
      expect(prisma.paymentPromise.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ status: 'CANCELLED', resolvedById: 99 }),
      });
      expect(history.recordStatusChange).toHaveBeenCalled();
      expect(res.status).toBe('CANCELLED');
    });

    it('throws NotFound when there is no open promise', async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce(null);
      await expect(service.cancel('nope', 99, 1001, null)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('upsertOpenPromise', () => {
    it('creates a new OPEN promise when none exists', async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce(null);
      await service.upsertOpenPromise(
        { studentId: 10264, promiseDate: '2026-06-15', comment: '15-iyun' },
        99,
        1001,
      );
      expect(prisma.paymentPromise.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 10264,
          status: 'OPEN',
          comment: '15-iyun',
          createdById: 99,
          branchId: 3,
          companyId: 1001,
        }),
      });
      expect(prisma.paymentPromise.update).not.toHaveBeenCalled();
      expect(history.recordCreate).toHaveBeenCalled();
    });

    it('updates the existing OPEN promise date instead of creating', async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce({
        id: 'p1',
        promiseDate: new Date('2026-06-10'),
      });
      await service.upsertOpenPromise(
        { studentId: 10264, promiseDate: '2026-06-20', comment: 'yangi sana' },
        99,
        1001,
      );
      expect(prisma.paymentPromise.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({
          comment: 'yangi sana',
          reminderFiredAt: null,
        }),
      });
      expect(prisma.paymentPromise.create).not.toHaveBeenCalled();
      expect(history.recordUpdate).toHaveBeenCalled();
    });

    it('throws NotFound when the student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.upsertOpenPromise(
          { studentId: 1, promiseDate: '2026-06-20', comment: 'x' },
          99,
          1001,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  /**
   * Every method here was keyed on `(studentId, companyId)` alone, so naming an
   * id was enough: a Namangan director could read a Fargona debtor's promise
   * history, record a new promise on them, or cancel one. The identical gate
   * already existed on the payment and transaction reads — the promises module
   * was written alongside them and simply did not get it.
   */
  describe('confines the caller to their own branch', () => {
    const NAMANGAN = [2];

    /** The student lookup finds nothing once the branch predicate is applied. */
    function studentOutOfScope() {
      prisma.student.findFirst.mockResolvedValue(null);
    }

    it('refuses to read another branch student\'s promises', async () => {
      studentOutOfScope();
      await expect(
        service.findByStudent(10264, 1001, NAMANGAN),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.paymentPromise.findMany).not.toHaveBeenCalled();
    });

    it('refuses to record a promise on another branch student', async () => {
      studentOutOfScope();
      await expect(
        service.create(
          { studentId: 10264, promiseDate: '2026-06-12', comment: '' },
          99,
          1001,
          NAMANGAN,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.paymentPromise.create).not.toHaveBeenCalled();
    });

    it('applies the branch predicate to the student lookup itself', async () => {
      // The gate has to be IN the query. Fetching the student and comparing
      // afterwards would still have loaded the row, and 404 rather than 403
      // because a 403 confirms the id exists in the other branch.
      studentOutOfScope();
      await service.findByStudent(10264, 1001, NAMANGAN).catch(() => undefined);

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 10264,
            branches: { some: { branchId: { in: NAMANGAN } } },
          }),
        }),
      );
    });

    it('lets a CEO through — `null` means every branch', async () => {
      await service.findByStudent(10264, 1001, null);
      // No student lookup at all: the gate short-circuits rather than running a
      // query whose predicate would be empty.
      expect(prisma.paymentPromise.findMany).toHaveBeenCalled();
    });
  });
});
