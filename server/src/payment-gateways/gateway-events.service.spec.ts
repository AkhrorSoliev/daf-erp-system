import { Test } from '@nestjs/testing';
import { GatewayEventsService } from './gateway-events.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GatewayEventsService', () => {
  let service: GatewayEventsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      paymentGatewayEvent: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      paymeTransaction: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      clickTransaction: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        GatewayEventsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(GatewayEventsService);
  });

  describe('findAll', () => {
    const baseFilters = { companyId: 1001, page: 1, pageSize: 20 };

    it('returns paginated events with student info for PAYME', async () => {
      const event = {
        id: 'evt-1',
        provider: 'PAYME',
        externalId: 'payme-tx-id',
        eventType: 'PerformTransaction',
        payload: { method: 'PerformTransaction' },
        signatureValid: true,
        processed: true,
        processedAt: new Date(),
        errorMessage: null,
        createdAt: new Date(),
        companyId: 1001,
      };
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([event]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);
      prisma.paymeTransaction.findFirst.mockResolvedValue({
        studentId: 10003,
        amountInSom: 1000,
      });
      prisma.student.findFirst.mockResolvedValue({
        id: 10003,
        firstName: 'Ahror',
        lastName: 'Soliyev',
      });

      const result = await service.findAll(baseFilters);

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].student).toEqual({
        id: 10003,
        firstName: 'Ahror',
        lastName: 'Soliyev',
      });
      expect(result.data[0].amount).toBe(1000);
    });

    it('enriches PerformTransaction with amount from PaymeTransaction even when payload has only {id}', async () => {
      // PerformTransaction webhook body is `{method, params: {id}}` — no amount.
      // We must pull the amount from PaymeTransaction so the UI shows it.
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([
        {
          id: 'evt-perform',
          provider: 'PAYME',
          externalId: 'perform-tx-id',
          eventType: 'PerformTransaction',
          payload: { method: 'PerformTransaction', params: { id: 'perform-tx-id' } },
          signatureValid: true,
          processed: true,
          processedAt: new Date(),
          errorMessage: null,
          createdAt: new Date(),
          companyId: 1001,
        },
      ]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);
      prisma.paymeTransaction.findFirst.mockResolvedValue({
        studentId: 10003,
        amountInSom: 1000,
      });
      prisma.student.findFirst.mockResolvedValue({
        id: 10003,
        firstName: 'Ahror',
        lastName: 'Soliyev',
      });

      const result = await service.findAll(baseFilters);

      expect(result.data[0].amount).toBe(1000);
    });

    it('falls back to payload amount for PAYME CheckPerformTransaction (no DB row yet)', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([
        {
          id: 'evt-check',
          provider: 'PAYME',
          externalId: 'some-id',
          eventType: 'CheckPerformTransaction',
          payload: {
            method: 'CheckPerformTransaction',
            params: {
              amount: 100000, // tiyin → 1000 so'm
              account: { student_id: '10003' },
            },
          },
          signatureValid: true,
          processed: true,
          processedAt: new Date(),
          errorMessage: null,
          createdAt: new Date(),
          companyId: 1001,
        },
      ]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);
      prisma.paymeTransaction.findFirst.mockResolvedValue(null);
      prisma.student.findFirst.mockResolvedValue({
        id: 10003,
        firstName: 'Ahror',
        lastName: 'Soliyev',
      });

      const result = await service.findAll(baseFilters);

      expect(result.data[0].amount).toBe(1000);
      expect(result.data[0].student?.id).toBe(10003);
    });

    it('excludes CheckPerformTransaction events when hideChecks=true', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({ ...baseFilters, hideChecks: true });

      expect(prisma.paymentGatewayEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: { notIn: ['CheckPerformTransaction'] },
          }),
        }),
      );
    });

    it('does NOT apply eventType filter when hideChecks is false/undefined', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll(baseFilters);

      const call = prisma.paymentGatewayEvent.findMany.mock.calls[0][0];
      expect(call.where.eventType).toBeUndefined();
    });

    it('returns null student when Payme transaction is missing', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([
        {
          id: 'evt-2',
          provider: 'PAYME',
          externalId: 'unknown',
          eventType: 'CheckPerformTransaction',
          payload: {},
          signatureValid: false,
          processed: false,
          processedAt: null,
          errorMessage: null,
          createdAt: new Date(),
          companyId: 1001,
        },
      ]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);
      prisma.paymeTransaction.findFirst.mockResolvedValue(null);

      const result = await service.findAll(baseFilters);

      expect(result.data[0].student).toBeNull();
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });

    it('resolves student for CLICK provider via BigInt clickTransId', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([
        {
          id: 'evt-3',
          provider: 'CLICK',
          externalId: '123456789',
          eventType: 'Complete',
          payload: {},
          signatureValid: true,
          processed: true,
          processedAt: new Date(),
          errorMessage: null,
          createdAt: new Date(),
          companyId: 1001,
        },
      ]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);
      prisma.clickTransaction.findFirst.mockResolvedValue({
        studentId: 10005,
        amountInSom: 500000,
      });
      prisma.student.findFirst.mockResolvedValue({
        id: 10005,
        firstName: 'Dilshod',
        lastName: 'Karimov',
      });

      const result = await service.findAll(baseFilters);

      expect(result.data[0].student?.id).toBe(10005);
      expect(result.data[0].amount).toBe(500000);
      expect(prisma.clickTransaction.findFirst).toHaveBeenCalledWith({
        where: { clickTransId: BigInt(123456789), companyId: 1001 },
        select: { studentId: true, amountInSom: true },
      });
    });

    it('applies provider, processed, and signatureValid filters', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({
        ...baseFilters,
        provider: 'PAYME',
        processed: false,
        signatureValid: false,
      });

      expect(prisma.paymentGatewayEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1001,
            provider: 'PAYME',
            processed: false,
            signatureValid: false,
          }),
        }),
      );
    });

    it('applies date range filter', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({
        ...baseFilters,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      });

      const call = prisma.paymentGatewayEvent.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2026-04-01'));
      expect(call.where.createdAt.lte).toEqual(new Date('2026-04-30'));
    });

    it('paginates correctly', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({ ...baseFilters, page: 3, pageSize: 10 });

      expect(prisma.paymentGatewayEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('searches by numeric student ID exactly', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 10003 }]);
      prisma.paymeTransaction.findMany.mockResolvedValue([
        { paymeId: 'payme-tx-1' },
      ]);
      prisma.clickTransaction.findMany.mockResolvedValue([
        { clickTransId: BigInt(456) },
      ]);
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({ ...baseFilters, search: '10003' });

      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: { id: 10003, companyId: 1001 },
        select: { id: true },
      });
      expect(prisma.paymentGatewayEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            externalId: { in: ['payme-tx-1', '456'] },
          }),
        }),
      );
    });

    it('searches by student name (firstName/lastName contains)', async () => {
      prisma.student.findMany.mockResolvedValue([{ id: 10003 }, { id: 10007 }]);
      prisma.paymeTransaction.findMany.mockResolvedValue([]);
      prisma.clickTransaction.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      await service.findAll({ ...baseFilters, search: 'Ahror' });

      expect(prisma.student.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 1001,
          OR: [
            { firstName: { contains: 'Ahror', mode: 'insensitive' } },
            { lastName: { contains: 'Ahror', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
    });

    it('returns empty result when search matches no students', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(0);

      const result = await service.findAll({
        ...baseFilters,
        search: 'NonexistentName',
      });

      expect(result.total).toBe(0);
      expect(prisma.paymeTransaction.findMany).not.toHaveBeenCalled();
      expect(prisma.paymentGatewayEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            externalId: { in: [] },
          }),
        }),
      );
    });

    it('returns null student for UZUM (not implemented)', async () => {
      prisma.paymentGatewayEvent.findMany.mockResolvedValue([
        {
          id: 'evt-4',
          provider: 'UZUM',
          externalId: 'uzum-id',
          eventType: 'Something',
          payload: {},
          signatureValid: true,
          processed: true,
          processedAt: new Date(),
          errorMessage: null,
          createdAt: new Date(),
          companyId: 1001,
        },
      ]);
      prisma.paymentGatewayEvent.count.mockResolvedValue(1);

      const result = await service.findAll(baseFilters);

      expect(result.data[0].student).toBeNull();
      expect(prisma.paymeTransaction.findFirst).not.toHaveBeenCalled();
      expect(prisma.clickTransaction.findFirst).not.toHaveBeenCalled();
    });
  });
});
