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
      prisma.paymeTransaction.findFirst.mockResolvedValue({ studentId: 10003 });
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
      prisma.clickTransaction.findFirst.mockResolvedValue({ studentId: 10005 });
      prisma.student.findFirst.mockResolvedValue({
        id: 10005,
        firstName: 'Dilshod',
        lastName: 'Karimov',
      });

      const result = await service.findAll(baseFilters);

      expect(result.data[0].student?.id).toBe(10005);
      expect(prisma.clickTransaction.findFirst).toHaveBeenCalledWith({
        where: { clickTransId: BigInt(123456789), companyId: 1001 },
        select: { studentId: true },
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
