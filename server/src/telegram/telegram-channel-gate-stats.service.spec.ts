import { Test } from '@nestjs/testing';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COMPANY_ID } from './constants';

describe('TelegramChannelGateStatsService', () => {
  let service: TelegramChannelGateStatsService;
  let prisma: {
    telegramChannelGateEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  const USER = { id: 555, username: 'ali', first_name: 'Ali' };

  /** Bazadagi mavjud qatorning to'liq shakli (testlarda qismini almashtiramiz). */
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    companyId: DEFAULT_COMPANY_ID,
    telegramUserId: '555',
    username: 'ali',
    firstName: 'Ali',
    blockedAt: null,
    joinedAt: null,
    leftAt: null,
    rejoinCount: 0,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      telegramChannelGateEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelegramChannelGateStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TelegramChannelGateStatsService);
  });

  describe('recordBlocked', () => {
    it("yangi odam to'silganda blockedAt bilan qator yaratadi", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(null);

      await service.recordBlocked(USER);

      expect(prisma.telegramChannelGateEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: DEFAULT_COMPANY_ID,
          telegramUserId: '555',
          username: 'ali',
          firstName: 'Ali',
          blockedAt: expect.any(Date),
        }),
      });
    });

    it("birinchi blockedAt ni keyingi to'siqlar o'zgartirmaydi", async () => {
      const first = new Date('2026-07-01T10:00:00Z');
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({ blockedAt: first, username: 'yangi', firstName: 'Yangi' }),
      );

      await service.recordBlocked(USER);

      expect(prisma.telegramChannelGateEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blockedAt: first }),
        }),
      );
    });

    it("a'zo bo'lgan odam qayta to'silsa — chiqib ketgan deb yoziladi", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({
          blockedAt: new Date('2026-07-01'),
          joinedAt: new Date('2026-07-02'),
        }),
      );

      await service.recordBlocked(USER);

      expect(prisma.telegramChannelGateEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leftAt: expect.any(Date) }),
        }),
      );
    });

    it("hech narsa o'zgarmagan takroriy to'siqda yozmaydi", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({ blockedAt: new Date('2026-07-01') }),
      );

      await service.recordBlocked(USER);

      expect(prisma.telegramChannelGateEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('recordJoined', () => {
    it("to'silgan odam a'zo bo'lsa joinedAt yoziladi (asosiy metrika)", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({ blockedAt: new Date('2026-07-01') }),
      );

      await service.recordJoined(USER);

      expect(prisma.telegramChannelGateEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ joinedAt: expect.any(Date) }),
        }),
      );
    });

    it("to'silmagan (o'z-o'zidan kelgan) odamda blockedAt NULL qoladi", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(null);

      await service.recordJoined(USER);

      const arg = prisma.telegramChannelGateEvent.create.mock.calls[0][0];
      expect(arg.data.joinedAt).toBeInstanceOf(Date);
      expect(arg.data.blockedAt).toBeUndefined();
    });

    it('qayta kirganda leftAt tozalanadi va rejoinCount oshadi', async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({
          blockedAt: new Date('2026-07-01'),
          joinedAt: new Date('2026-07-02'),
          leftAt: new Date('2026-07-03'),
          rejoinCount: 1,
        }),
      );

      await service.recordJoined(USER);

      expect(prisma.telegramChannelGateEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leftAt: null, rejoinCount: 2 }),
        }),
      );
    });

    it("barqaror a'zoda keraksiz yozuv qilmaydi", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockResolvedValue(
        row({
          blockedAt: new Date('2026-07-01'),
          joinedAt: new Date('2026-07-02'),
        }),
      );

      await service.recordJoined(USER);

      expect(prisma.telegramChannelGateEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('recordLeft', () => {
    it('faqat hali chiqib ketmagan qatorni belgilaydi', async () => {
      prisma.telegramChannelGateEvent.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.recordLeft(555);

      expect(prisma.telegramChannelGateEvent.updateMany).toHaveBeenCalledWith({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          telegramUserId: '555',
          leftAt: null,
        },
        data: { leftAt: expect.any(Date) },
      });
    });
  });

  describe('getSummary', () => {
    const rows = [
      // Stopped in August, joined in September: belongs to AUGUST's cohort only.
      {
        blockedAt: new Date('2026-08-20T10:00:00Z'),
        joinedAt: new Date('2026-09-02T10:00:00Z'),
        leftAt: null,
      },
      // September's cohort.
      {
        blockedAt: new Date('2026-09-03T10:00:00Z'),
        joinedAt: new Date('2026-09-04T10:00:00Z'),
        leftAt: null,
      },
      {
        blockedAt: new Date('2026-09-05T10:00:00Z'),
        joinedAt: new Date('2026-09-06T10:00:00Z'),
        leftAt: new Date('2026-09-20T10:00:00Z'),
      },
      {
        blockedAt: new Date('2026-09-07T10:00:00Z'),
        joinedAt: null,
        leftAt: null,
      },
    ];

    it("counts only the month's cohort and the standing waiting list", async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue(rows);

      const res = await service.getSummary('2026-09');

      expect(res).toEqual({
        blocked: 3,
        joined: 2,
        left: 1,
        conversionRate: 67,
        waiting: 1,
      });
    });

    it('a stranger who joined on their own is never in a cohort', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);

      await service.getSummary('2026-09');

      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledWith({
        where: { companyId: DEFAULT_COMPANY_ID, blockedAt: { not: null } },
        select: { blockedAt: true, joinedAt: true, leftAt: true },
      });
    });

    it('the month edge is Tashkent midnight, the upper bound excluded', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([
        // 30.09 18:59:59Z = 30.09 23:59:59 Tashkent → September.
        {
          blockedAt: new Date('2026-09-30T18:59:59Z'),
          joinedAt: null,
          leftAt: null,
        },
        // 30.09 19:00:00Z = 01.10 00:00 Tashkent → October.
        {
          blockedAt: new Date('2026-09-30T19:00:00Z'),
          joinedAt: null,
          leftAt: null,
        },
      ]);

      expect((await service.getSummary('2026-09')).blocked).toBe(1);
      expect((await service.getSummary('2026-10')).blocked).toBe(1);
    });

    it('an empty month is zeros', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);
      expect(await service.getSummary('2026-09')).toEqual({
        blocked: 0,
        joined: 0,
        left: 0,
        conversionRate: 0,
        waiting: 0,
      });
    });
  });

  describe('getList', () => {
    it("lists the month's cohort with the server's state, newest first", async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([
        {
          id: 3,
          telegramUserId: '30',
          username: 'c',
          firstName: 'C',
          blockedAt: new Date('2026-09-07T10:00:00Z'),
          joinedAt: null,
          leftAt: null,
        },
        {
          id: 2,
          telegramUserId: '20',
          username: null,
          firstName: 'B',
          blockedAt: new Date('2026-09-05T10:00:00Z'),
          joinedAt: new Date('2026-09-06T10:00:00Z'),
          leftAt: new Date('2026-09-20T10:00:00Z'),
        },
      ]);
      prisma.telegramChannelGateEvent.count.mockResolvedValue(2);

      const res = await service.getList({
        month: '2026-09',
        page: 2,
        pageSize: 10,
      });

      expect(prisma.telegramChannelGateEvent.findMany).toHaveBeenCalledWith({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          blockedAt: {
            gte: new Date('2026-08-31T19:00:00Z'),
            lt: new Date('2026-09-30T19:00:00Z'),
          },
        },
        orderBy: [{ blockedAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
        select: {
          id: true,
          telegramUserId: true,
          username: true,
          firstName: true,
          blockedAt: true,
          joinedAt: true,
          leftAt: true,
        },
      });
      expect(res.total).toBe(2);
      expect(res.page).toBe(2);
      expect(res.data.map((r) => [r.id, r.state])).toEqual([
        [3, 'waiting'],
        [2, 'left'],
      ]);
    });

    it('counts the same cohort the rows come from', async () => {
      prisma.telegramChannelGateEvent.findMany.mockResolvedValue([]);
      prisma.telegramChannelGateEvent.count.mockResolvedValue(0);

      await service.getList({ month: '2026-09', page: 1, pageSize: 10 });

      expect(prisma.telegramChannelGateEvent.count).toHaveBeenCalledWith({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          blockedAt: {
            gte: new Date('2026-08-31T19:00:00Z'),
            lt: new Date('2026-09-30T19:00:00Z'),
          },
        },
      });
    });
  });

  describe('xatolarga chidamlilik', () => {
    it("baza xatosida ham otmaydi (bot to'xtamasligi kerak)", async () => {
      prisma.telegramChannelGateEvent.findUnique.mockRejectedValue(
        new Error('DB down'),
      );
      prisma.telegramChannelGateEvent.updateMany.mockRejectedValue(
        new Error('DB down'),
      );

      await expect(service.recordBlocked(USER)).resolves.toBeUndefined();
      await expect(service.recordJoined(USER)).resolves.toBeUndefined();
      await expect(service.recordLeft(555)).resolves.toBeUndefined();
    });
  });
});
