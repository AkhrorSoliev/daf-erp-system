import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotificationResolverService } from './notification-resolver.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaService } from '../prisma/prisma.service';

const OPEN = { actionRequired: true, resolvedAt: null };

describe('NotificationResolverService (past lesson alerts)', () => {
  let resolver: NotificationResolverService;
  let prisma: any;
  let gateway: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 7 },
          { id: 'n2', userId: 7 },
          { id: 'n3', userId: 8 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    gateway = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        NotificationResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    resolver = mod.get(NotificationResolverService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const whereOf = (call = 0) =>
    prisma.notification.findMany.mock.calls[call][0].where;

  describe('the 03:00 sweep of past lesson alerts', () => {
    // 03:00 Tashkent on 11.10 is 22:00 UTC on 10.10: today is 11.10 here.
    const NIGHT = new Date('2026-10-10T22:00:00.000Z');
    const LESSON_TYPES = [
      'LESSON_STARTED',
      'ATTENDANCE_ADMIN_ALERT',
      'ATTENDANCE_TEACHER_WARNING',
      'ATTENDANCE_MISSING_TEACHER',
      'ATTENDANCE_MISSING_ADMIN',
    ];
    const found = (...r: [string, number][]) =>
      r.map(([id, companyId]) => ({ id, companyId }));

    beforeEach(() => {
      jest.useFakeTimers({ now: NIGHT });
    });

    it('runs at 03:00 Tashkent', () => {
      expect(
        Reflect.getMetadata(
          'SCHEDULE_CRON_OPTIONS',
          NotificationResolverService.prototype.closePastLessonAlerts,
        ),
      ).toEqual(
        expect.objectContaining({
          cronTime: '0 0 3 * * *',
          timeZone: 'Asia/Tashkent',
        }),
      );
    });

    it('asks for open lesson alerts of days before today, with no question waiting, and nothing else', async () => {
      await resolver.closePastLessonAlerts();

      const { sql, values } = prisma.$queryRaw.mock.calls[0][0];
      const flat = sql.replace(/\s+/g, ' ');
      // only the five lesson alert types, only rows that still wait
      expect(values).toEqual([...LESSON_TYPES, '2026-10-11']);
      expect(flat).toContain('n."actionRequired" AND n."resolvedAt" IS NULL');
      expect(flat).toContain(`n."relatedEntityType" = 'Group'`);
      expect(flat).toContain('n."type"::text IN (?,?,?,?,?)');
      // strictly before today (Tashkent), so today's alerts stay
      expect(flat).toContain(
        `split_part(n."groupKey", ':', 2)::date < ?::date`,
      );
      // that group-day's question, still PENDING, keeps them while the group lives
      expect(flat).toContain('NOT EXISTS');
      expect(flat).toContain(
        'FROM "UnmarkedLesson" u JOIN "Group" g ON g."id" = u."groupId"',
      );
      expect(flat).toContain(
        `u."groupId" = n."relatedEntityId" AND u."date" = split_part(n."groupKey", ':', 2)::date`,
      );
      expect(flat).toContain(
        `u."status" = 'PENDING' AND g."deletedAt" IS NULL`,
      );
    });

    it("closes what it found through the resolve path, per company, and tells each owner's bells", async () => {
      prisma.$queryRaw.mockResolvedValue(found(['a', 1], ['b', 1], ['c', 2]));
      prisma.notification.findMany.mockImplementation(({ where }: any) =>
        where.id.in.map((id: string) => ({ id, userId: id === 'c' ? 8 : 7 })),
      );
      prisma.notification.updateMany.mockImplementation(({ where }: any) => ({
        count: where.id.in.length,
      }));

      await expect(resolver.closePastLessonAlerts()).resolves.toBe(3);

      // a write carries the row's own company and re-checks that it is still open
      expect(whereOf(0)).toEqual({
        companyId: 1,
        id: { in: ['a', 'b'] },
        ...OPEN,
      });
      expect(whereOf(1)).toEqual({ companyId: 2, id: { in: ['c'] }, ...OPEN });
      expect(gateway.sendToUser).toHaveBeenCalledWith(7, {
        type: 'notification.resolved',
        ids: ['a', 'b'],
        resolvedAt: expect.any(String),
      });
      expect(gateway.sendToUser).toHaveBeenCalledWith(8, {
        type: 'notification.resolved',
        ids: ['c'],
        resolvedAt: expect.any(String),
      });
    });

    it('writes a long list in chunks', async () => {
      prisma.$queryRaw.mockResolvedValue(
        Array.from({ length: 1_200 }, (_, i) => ({
          id: `n${i}`,
          companyId: 1,
        })),
      );
      prisma.notification.findMany.mockResolvedValue([]);

      await resolver.closePastLessonAlerts();

      expect(
        prisma.notification.findMany.mock.calls.map(
          (c: any) => c[0].where.id.in.length,
        ),
      ).toEqual([500, 500, 200]);
    });

    it('finding nothing writes nothing and tells nobody', async () => {
      await expect(resolver.closePastLessonAlerts()).resolves.toBe(0);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('rows another resolver closed first tell nobody', async () => {
      prisma.$queryRaw.mockResolvedValue(found(['a', 1]));
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(resolver.closePastLessonAlerts()).resolves.toBe(0);

      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });

    it('never throws when the lookup fails', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));

      await expect(resolver.closePastLessonAlerts()).resolves.toBe(0);
      expect(gateway.sendToUser).not.toHaveBeenCalled();
    });
  });
});
