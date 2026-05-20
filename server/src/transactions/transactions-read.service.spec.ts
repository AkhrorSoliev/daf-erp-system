import { Test } from '@nestjs/testing';
import { TransactionsReadService } from './transactions-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';

describe('TransactionsReadService', () => {
  let service: TransactionsReadService;
  let prisma: {
    transaction: { findMany: jest.Mock; count: jest.Mock };
    attendance: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsReadService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TransactionsReadService);
  });

  describe('findByStudent', () => {
    it('filters by the comma-separated types list including LESSON_DEDUCTION', async () => {
      await service.findByStudent(
        10329,
        { types: 'PAYMENT,REFUND,LESSON_DEDUCTION' } as TransactionQueryDto,
        1001,
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: 10329,
            companyId: 1001,
            type: { in: ['PAYMENT', 'REFUND', 'LESSON_DEDUCTION'] },
          }),
        }),
      );
    });

    it('selects metadata so LESSON_DEDUCTION rows can be labelled on the tab', async () => {
      await service.findByStudent(10329, {} as TransactionQueryDto, 1001);

      const arg = prisma.transaction.findMany.mock.calls[0][0];
      expect(arg.select.metadata).toBe(true);
    });

    it('falls back to the single `type` param when `types` is absent', async () => {
      await service.findByStudent(
        10329,
        { type: 'PAYMENT' } as TransactionQueryDto,
        1001,
      );

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: { in: ['PAYMENT'] } }),
        }),
      );
    });

    it('returns the paginated envelope', async () => {
      prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }]);
      prisma.transaction.count.mockResolvedValue(1);

      const res = await service.findByStudent(
        10329,
        { page: 2, pageSize: 5 } as TransactionQueryDto,
        1001,
      );

      expect(res).toEqual({
        data: [{ id: 't1' }],
        total: 1,
        page: 2,
        pageSize: 5,
      });
    });
  });

  describe('getLessonTrail', () => {
    it('scopes strictly to LESSON_DEDUCTION + LESSON_CONSUMPTION', async () => {
      await service.getLessonTrail(10329, 1001, {});

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: ['LESSON_DEDUCTION', 'LESSON_CONSUMPTION'] },
          }),
        }),
      );
    });
  });
});
