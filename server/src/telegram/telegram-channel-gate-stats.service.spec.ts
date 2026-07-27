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
        row({ blockedAt: new Date('2026-07-01'), joinedAt: new Date('2026-07-02') }),
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

    it("qayta kirganda leftAt tozalanadi va rejoinCount oshadi", async () => {
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
        row({ blockedAt: new Date('2026-07-01'), joinedAt: new Date('2026-07-02') }),
      );

      await service.recordJoined(USER);

      expect(prisma.telegramChannelGateEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('recordLeft', () => {
    it('faqat hali chiqib ketmagan qatorni belgilaydi', async () => {
      prisma.telegramChannelGateEvent.updateMany.mockResolvedValue({ count: 1 });

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

  describe('xatolarga chidamlilik', () => {
    it('baza xatosida ham otmaydi (bot to\'xtamasligi kerak)', async () => {
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
