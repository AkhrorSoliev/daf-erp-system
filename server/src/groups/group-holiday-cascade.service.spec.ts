import { Test, TestingModule } from '@nestjs/testing';
import { GroupHolidayCascadeService } from './group-holiday-cascade.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { HolidaysService } from '../holidays/holidays.service';

describe('GroupHolidayCascadeService', () => {
  let service: GroupHolidayCascadeService;
  let prisma: any;
  let entityHistoryService: any;
  let holidaysService: any;

  // Per the user's plan:
  //   - 12-lesson group, M/W/F schedule, startDate Mar 2 (Mon), endDate May 29 (Fri).
  //   - Holiday range May 27 (Wed) — Jun 1 (Mon).
  //   - Eaten lessons inside [startDate, endDate] matching exactDays:
  //     May 27 (Wed) and May 29 (Fri) → daysExtended = 2.
  //   - Walking forward from May 30:
  //     May 30 Sat (skip), May 31 Sun (skip), Jun 1 Mon (in future holiday set, skip),
  //     Jun 3 Wed (count=1), Jun 5 Fri (count=2) → newEndDate = Jun 5.
  const group = {
    id: 'g-1',
    startDate: new Date('2026-03-02T00:00:00.000Z'),
    endDate: new Date('2026-05-29T00:00:00.000Z'),
    exactDays: ['monday', 'wednesday', 'friday'],
  };

  const holiday = {
    id: 'h-1',
    date: new Date('2026-05-27T00:00:00.000Z'),
    endDate: new Date('2026-06-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      groupHolidayExtension: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        delete: jest.fn(),
      },
      group: {
        findUnique: jest.fn().mockResolvedValue(group),
        update: jest.fn(),
      },
      holiday: {
        findUnique: jest.fn().mockResolvedValue(holiday),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return Promise.all(cb as any[]);
      }),
    };

    entityHistoryService = {
      recordUpdate: jest.fn(),
    };

    holidaysService = {
      buildHolidayDateSet: jest.fn().mockImplementation(async (start, end) => {
        // Eaten window: 2026-05-27..2026-05-29 (Tashkent dates).
        // Future window: 2026-05-30..2027-05-30. We need Jun 1 in the set
        // (it is in the holiday's range), nothing else.
        const set = new Set<string>();
        const startMs = start.getTime();
        const endMs = end.getTime();
        const holidayStart = new Date('2026-05-27T00:00:00.000Z').getTime();
        const holidayEnd = new Date('2026-06-01T00:00:00.000Z').getTime();
        let cursor = Math.max(holidayStart, startMs);
        const stop = Math.min(holidayEnd, endMs);
        while (cursor <= stop) {
          const d = new Date(cursor);
          const tzStr = d.toISOString().slice(0, 10);
          set.add(tzStr);
          cursor += 24 * 60 * 60 * 1000;
        }
        return set;
      }),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([holiday]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupHolidayCascadeService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: HolidaysService, useValue: holidaysService },
      ],
    }).compile();

    service = module.get(GroupHolidayCascadeService);
  });

  describe('extendGroupEndDateForHoliday', () => {
    it("extends endDate to Jun 5 for the user's example", async () => {
      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );

      expect(result.extended).toBe(true);
      expect(result.daysExtended).toBe(2);
      expect(result.oldEndDate?.toISOString()).toBe(
        '2026-05-29T00:00:00.000Z',
      );
      expect(result.newEndDate?.toISOString()).toBe(
        '2026-06-05T00:00:00.000Z',
      );

      expect(prisma.group.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { endDate: new Date('2026-06-05T00:00:00.000Z') },
      });
      expect(prisma.groupHolidayExtension.create).toHaveBeenCalledWith({
        data: {
          groupId: 'g-1',
          holidayId: 'h-1',
          daysExtended: 2,
          oldEndDate: new Date('2026-05-29T00:00:00.000Z'),
          newEndDate: new Date('2026-06-05T00:00:00.000Z'),
          createdById: 99,
        },
      });
      expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'g-1',
        }),
      );
    });

    it('is idempotent — returns extended=false on second call', async () => {
      prisma.groupHolidayExtension.findUnique.mockResolvedValue({
        id: 'ext-1',
        oldEndDate: new Date('2026-05-29'),
        newEndDate: new Date('2026-06-05'),
        daysExtended: 2,
      });
      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );
      expect(result.extended).toBe(false);
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('no-ops when group has no startDate/endDate', async () => {
      prisma.group.findUnique.mockResolvedValue({
        ...group,
        startDate: null,
        endDate: null,
      });
      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );
      expect(result.extended).toBe(false);
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('no-ops when no scheduled days fall in the eaten window', async () => {
      // Holiday range is Saturday only — not in M/W/F.
      prisma.holiday.findUnique.mockResolvedValue({
        id: 'h-2',
        date: new Date('2026-05-30T00:00:00.000Z'),
        endDate: new Date('2026-05-30T00:00:00.000Z'),
      });
      holidaysService.buildHolidayDateSet.mockResolvedValue(
        new Set(['2026-05-30']),
      );
      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-2',
        99,
      );
      expect(result.extended).toBe(false);
    });
  });

  describe('revertGroupEndDateForHoliday', () => {
    it('restores oldEndDate and deletes the extension row', async () => {
      const extension: any = {
        id: 'ext-1',
        groupId: 'g-1',
        holidayId: 'h-1',
        daysExtended: 2,
        oldEndDate: new Date('2026-05-29T00:00:00.000Z'),
        newEndDate: new Date('2026-06-05T00:00:00.000Z'),
        createdAt: new Date(),
        createdById: 99,
      };
      prisma.group.findUnique.mockResolvedValue({
        id: 'g-1',
        endDate: new Date('2026-06-05T00:00:00.000Z'),
      });

      await service.revertGroupEndDateForHoliday(extension, 5);

      expect(prisma.group.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { endDate: new Date('2026-05-29T00:00:00.000Z') },
      });
      expect(prisma.groupHolidayExtension.delete).toHaveBeenCalledWith({
        where: { id: 'ext-1' },
      });
      expect(entityHistoryService.recordUpdate).toHaveBeenCalled();
    });

    it("skips revert when admin manually changed endDate (logs warn)", async () => {
      const extension: any = {
        id: 'ext-1',
        groupId: 'g-1',
        holidayId: 'h-1',
        daysExtended: 2,
        oldEndDate: new Date('2026-05-29T00:00:00.000Z'),
        newEndDate: new Date('2026-06-05T00:00:00.000Z'),
        createdAt: new Date(),
        createdById: 99,
      };
      prisma.group.findUnique.mockResolvedValue({
        id: 'g-1',
        endDate: new Date('2026-06-10T00:00:00.000Z'),
      });

      await service.revertGroupEndDateForHoliday(extension, 5);

      // No group update; only the extension row is removed.
      expect(prisma.group.update).not.toHaveBeenCalled();
      expect(prisma.groupHolidayExtension.delete).toHaveBeenCalled();
    });
  });
});
