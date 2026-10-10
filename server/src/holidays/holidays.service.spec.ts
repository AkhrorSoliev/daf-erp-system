import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { GroupHolidayCascadeService } from '../groups/group-holiday-cascade.service';

describe('HolidaysService', () => {
  // Every id-addressed method is company-scoped; the fixtures below belong
  // to this company.
  const COMPANY_ID = 1001;
  // Every write checks the caller against the holiday's branch. The tests
  // outside «branch rule» are about other things, so their caller is a CEO.
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const CENTRE_WIDE = 'Butun markaz bayrami bilan faqat CEO ishlay oladi';
  const BRANCH_REFUSAL = 'Bu filial sizning ruxsatingizda emas';
  let service: HolidaysService;
  let prisma: any;
  let entityHistoryService: any;
  let statusHistoryService: any;
  let cascadeService: any;

  const mockHoliday = {
    id: 'h-1',
    name: 'Mustaqillik kuni',
    date: new Date('2026-09-01'),
    endDate: new Date('2026-09-01'),
    status: 'ACTIVE',
    deletedAt: null,
    deletedById: null,
    deletionBatchId: null,
    statusChangedAt: null,
    statusChangedById: null,
    statusChangeReason: null,
    companyId: 1001,
    // null = company-wide (Navro'z, Mustaqillik kuni) — what nearly every row
    // is. A non-null value is a single branch closing.
    branchId: null as number | null,
  };

  beforeEach(async () => {
    prisma = {
      holiday: {
        findFirst: jest.fn().mockResolvedValue(mockHoliday),
        findMany: jest.fn().mockResolvedValue([mockHoliday]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockHoliday),
        update: jest.fn().mockResolvedValue(mockHoliday),
      },
      group: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupHolidayExtension: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findFirst: jest.fn().mockResolvedValue(CEO_CALLER) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: 1,
      }),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    cascadeService = {
      extendGroupEndDateForHoliday: jest
        .fn()
        .mockResolvedValue({ extended: false }),
      revertGroupEndDateForHoliday: jest.fn(),
      applyHolidayImpactOnNewGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidaysService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: GroupHolidayCascadeService, useValue: cascadeService },
      ],
    }).compile();

    service = module.get(HolidaysService);
  });

  describe('findAll', () => {
    it('returns paginated holidays with defaults page=1, pageSize=10', async () => {
      const result = await service.findAll({}, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, companyId: COMPANY_ID },
          skip: 0,
          take: 10,
          orderBy: { date: 'asc' },
        }),
      );
      expect(result).toEqual({
        data: [mockHoliday],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it('applies search filter (case-insensitive contains)', async () => {
      await service.findAll({ search: 'navro' }, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            companyId: COMPANY_ID,
            name: { contains: 'navro', mode: 'insensitive' },
          },
        }),
      );
    });

    it('honours page and pageSize', async () => {
      await service.findAll({ page: 3, pageSize: 20 }, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the holiday when found', async () => {
      const result = await service.findOne('h-1', COMPANY_ID, 7);
      expect(result).toEqual(mockHoliday);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing', COMPANY_ID, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('coerces endDate to date when not provided', async () => {
      await service.create({ name: 'Yangi yil', date: '2026-01-01' }, 42, 1001);

      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Yangi yil',
          date: new Date('2026-01-01'),
          endDate: new Date('2026-01-01'),
        }),
      });
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
    });

    it('stores explicit endDate when provided', async () => {
      await service.create(
        { name: "Navro'z", date: '2026-03-21', endDate: '2026-03-23' },
        7,
        1001,
      );
      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Navro'z",
          date: new Date('2026-03-21'),
          endDate: new Date('2026-03-23'),
        }),
      });
    });

    it('rejects endDate before date', async () => {
      await expect(
        service.create(
          { name: 'X', date: '2026-03-23', endDate: '2026-03-21' },
          1,
          1001,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects holiday ranges longer than 60 days', async () => {
      await expect(
        service.create(
          { name: 'Too long', date: '2026-01-01', endDate: '2026-04-01' },
          1,
          1001,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('triggers cascade for active overlapping groups', async () => {
      prisma.group.findMany.mockResolvedValue([{ id: 'g-1' }, { id: 'g-2' }]);
      await service.create({ name: 'X', date: '2026-05-27' }, 1, 1001);
      expect(cascadeService.extendGroupEndDateForHoliday).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('update', () => {
    it('updates name even when extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(3);
      await service.update('h-1', { name: 'New name' }, 7, COMPANY_ID);
      expect(prisma.holiday.update).toHaveBeenCalled();
    });

    it('rejects date change when extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(1);
      await expect(
        service.update('h-1', { date: '2026-10-01' }, 7, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows date change when no extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(0);
      await service.update('h-1', { date: '2026-10-01' }, 7, COMPANY_ID);
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: {
          date: new Date('2026-10-01'),
          endDate: new Date('2026-10-01'),
        },
      });
    });

    it('regression: name-only edit does NOT trigger date-change block (bug #1)', async () => {
      // Frontend always sends `date` in payload even when only the name
      // changes. The service must compare Tashkent calendar strings so
      // "2026-09-01" matches a DB row stored as Date(2026-09-01T00:00:00Z).
      prisma.groupHolidayExtension.count.mockResolvedValue(5);
      // Same calendar day as the existing mockHoliday — should NOT trigger
      // the extension-block error.
      await service.update(
        'h-1',
        { name: 'Renamed', date: '2026-09-01', endDate: '2026-09-01' },
        7,
        COMPANY_ID,
      );
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: expect.objectContaining({ name: 'Renamed' }),
      });
    });

    // The settings form drops `endDate` once it is cleared, and the write then
    // sets `endDate = date`. With `date` unchanged that still shortens a
    // multi-day holiday, so it is a date change too.
    describe('a multi-day holiday sent back with no endDate', () => {
      beforeEach(() => {
        prisma.holiday.findFirst.mockResolvedValue({
          ...mockHoliday,
          date: new Date('2026-03-20'),
          endDate: new Date('2026-03-22'),
        });
      });

      it('is refused once the holiday has moved group schedules', async () => {
        prisma.groupHolidayExtension.count.mockResolvedValue(2);
        await expect(
          service.update('h-1', { date: '2026-03-20' }, 7, COMPANY_ID),
        ).rejects.toThrow(/allaqachon guruh jadvallariga/);
        expect(prisma.holiday.update).not.toHaveBeenCalled();
      });

      it('shortens it to one day when nothing was moved yet', async () => {
        prisma.groupHolidayExtension.count.mockResolvedValue(0);
        await service.update('h-1', { date: '2026-03-20' }, 7, COMPANY_ID);
        expect(prisma.holiday.update).toHaveBeenCalledWith({
          where: { id: 'h-1' },
          data: {
            date: new Date('2026-03-20'),
            endDate: new Date('2026-03-20'),
          },
        });
      });

      it('a name-only edit still goes through', async () => {
        prisma.groupHolidayExtension.count.mockResolvedValue(2);
        await service.update('h-1', { name: "Navro'z" }, 7, COMPANY_ID);
        expect(prisma.holiday.update).toHaveBeenCalled();
      });
    });

    it('throws NotFoundException when holiday is missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, 1, COMPANY_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (soft delete)', () => {
    it('reverses extensions before soft-deleting', async () => {
      prisma.groupHolidayExtension.findMany.mockResolvedValue([
        { id: 'ext-1', groupId: 'g-1', holidayId: 'h-1' },
      ]);
      const result = await service.remove('h-1', 5, COMPANY_ID);

      expect(cascadeService.revertGroupEndDateForHoliday).toHaveBeenCalled();
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: 5,
        }),
      });
      expect(entityHistoryService.recordDelete).toHaveBeenCalled();
      expect(result).toEqual({ message: "Bayram muvaffaqiyatli o'chirildi" });
    });

    it('throws NotFoundException when holiday is missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 1, COMPANY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('changeStatus', () => {
    it('reverses extensions on ACTIVE → CANCELLED', async () => {
      prisma.holiday.findFirst.mockResolvedValue({
        ...mockHoliday,
        status: 'ACTIVE',
      });
      await service.changeStatus(
        'h-1',
        { status: 'CANCELLED' as any },
        1,
        COMPANY_ID,
      );
      expect(cascadeService.revertGroupEndDateForHoliday).toHaveBeenCalledTimes(
        0, // none in this test's findMany mock
      );
    });

    it('applies extensions on CANCELLED → ACTIVE', async () => {
      prisma.holiday.findFirst.mockResolvedValue({
        ...mockHoliday,
        status: 'CANCELLED',
      });
      prisma.group.findMany.mockResolvedValue([{ id: 'g-1' }]);
      await service.changeStatus(
        'h-1',
        { status: 'ACTIVE' as any },
        1,
        COMPANY_ID,
      );
      expect(cascadeService.extendGroupEndDateForHoliday).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  // The cascade moves real group end dates. It used to select groups with
  // neither a company nor a branch predicate, so a holiday declared for one
  // branch pushed every branch's groups — and every other company's.
  describe('cascade scope', () => {
    beforeEach(() => {
      prisma.group.findMany.mockResolvedValue([]);
    });

    it('confines a company-wide holiday to its own company, all branches', async () => {
      prisma.holiday.create.mockResolvedValue({ ...mockHoliday });

      await service.create(
        { name: "Navro'z", date: '2026-09-01' } as any,
        7,
        COMPANY_ID,
      );

      const where = prisma.group.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(COMPANY_ID);
      // No branch predicate at all — a null branchId means every branch.
      expect(where.branchId).toBeUndefined();
    });

    it('confines a branch holiday to that branch', async () => {
      prisma.holiday.create.mockResolvedValue({ ...mockHoliday, branchId: 2 });

      await service.create(
        { name: 'Namangan yopiq', date: '2026-09-01' } as any,
        7,
        COMPANY_ID,
      );

      const where = prisma.group.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(COMPANY_ID);
      expect(where.branchId).toBe(2);
    });

    it('keeps the overlap window while adding the scope', async () => {
      prisma.holiday.create.mockResolvedValue({ ...mockHoliday });

      await service.create(
        { name: 'X', date: '2026-09-01' } as any,
        7,
        COMPANY_ID,
      );

      const where = prisma.group.findMany.mock.calls[0][0].where;
      expect(where.statusEnum).toEqual({ in: ['FORMING', 'ACTIVE'] });
      expect(where.startDate).toBeDefined();
      expect(where.endDate).toBeDefined();
    });
  });

  describe('company scope on id-addressed reads', () => {
    it("looks a holiday up within the caller's company", async () => {
      prisma.holiday.findFirst.mockResolvedValue(mockHoliday);

      await service.findOne('h-1', COMPANY_ID, 7);

      expect(prisma.holiday.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'h-1', companyId: COMPANY_ID }),
        }),
      );
    });

    it("reports another company's holiday as not found", async () => {
      // The scoped `where` is what makes this miss; the service turns a miss
      // into 404 rather than leaking that the row exists elsewhere.
      prisma.holiday.findFirst.mockResolvedValue(null);

      await expect(service.findOne('h-1', 2002, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // CEO decision 10.10.2026: a holiday of the whole centre (`branchId` null)
  // is the CEO's alone; a director or administrator manages only their own
  // branch's. The caller here is a Fargona administrator.
  describe('branch rule', () => {
    const FARGONA_ADMIN = {
      mainBranch: 1,
      branches: [{ branchId: 1 }],
      roles: [{ role: { name: 'Administrator' } }],
    };
    const fargona = { ...mockHoliday, branchId: 1 };
    const namangan = { ...mockHoliday, branchId: 2 };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(FARGONA_ADMIN);
    });

    describe('create', () => {
      it('refuses an Administrator a centre-wide holiday and moves nothing', async () => {
        const done = service.create(
          { name: "Navro'z", date: '2026-03-21' },
          5,
          COMPANY_ID,
        );
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(CENTRE_WIDE);
        expect(prisma.holiday.create).not.toHaveBeenCalled();
        expect(prisma.group.findMany).not.toHaveBeenCalled();
        expect(entityHistoryService.recordCreate).not.toHaveBeenCalled();
      });

      it("writes an Administrator's holiday to their branch and moves only that branch's groups", async () => {
        prisma.holiday.create.mockResolvedValue(fargona);

        await service.create(
          { name: 'Filial yopiq', date: '2026-09-01', branchId: 1 },
          5,
          COMPANY_ID,
        );

        expect(prisma.branch.findFirst).toHaveBeenCalledWith({
          where: { id: 1, companyId: COMPANY_ID, deletedAt: null },
          select: { id: true },
        });
        expect(prisma.holiday.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ branchId: 1, companyId: COMPANY_ID }),
        });
        expect(prisma.group.findMany.mock.calls[0][0].where.branchId).toBe(1);
      });

      it("refuses an Administrator another branch's holiday", async () => {
        prisma.branch.findFirst.mockResolvedValue({ id: 2 });
        const done = service.create(
          { name: 'Namangan yopiq', date: '2026-09-01', branchId: 2 },
          5,
          COMPANY_ID,
        );
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(BRANCH_REFUSAL);
        expect(prisma.holiday.create).not.toHaveBeenCalled();
      });

      it('answers 404 for a branch outside the company, before reading the caller', async () => {
        prisma.branch.findFirst.mockResolvedValue(null);
        await expect(
          service.create(
            { name: 'X', date: '2026-09-01', branchId: 9 },
            5,
            COMPANY_ID,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
        expect(prisma.holiday.create).not.toHaveBeenCalled();
      });

      it('lets the CEO declare one for the whole centre or for any branch', async () => {
        prisma.user.findFirst.mockResolvedValue(CEO_CALLER);

        await service.create(
          { name: "Navro'z", date: '2026-03-21' },
          7,
          COMPANY_ID,
        );
        expect(prisma.holiday.create.mock.calls[0][0].data.branchId).toBeNull();

        prisma.branch.findFirst.mockResolvedValue({ id: 2 });
        await service.create(
          { name: 'Namangan yopiq', date: '2026-03-25', branchId: 2 },
          7,
          COMPANY_ID,
        );
        expect(prisma.holiday.create.mock.calls[1][0].data.branchId).toBe(2);
      });
    });

    describe.each([
      [
        'update',
        (s: HolidaysService) =>
          s.update('h-1', { name: 'Yangi nom' }, 5, COMPANY_ID),
      ],
      [
        'changeStatus',
        (s: HolidaysService) =>
          s.changeStatus('h-1', { status: 'CANCELLED' as any }, 5, COMPANY_ID),
      ],
      ['remove', (s: HolidaysService) => s.remove('h-1', 5, COMPANY_ID)],
    ])('%s', (_name, call) => {
      it('refuses an Administrator a centre-wide holiday before anything moves', async () => {
        prisma.holiday.findFirst.mockResolvedValue(mockHoliday);
        const done = call(service);
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(CENTRE_WIDE);
        expect(prisma.holiday.update).not.toHaveBeenCalled();
        expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
        expect(prisma.groupHolidayExtension.findMany).not.toHaveBeenCalled();
      });

      it("refuses an Administrator another branch's holiday", async () => {
        prisma.holiday.findFirst.mockResolvedValue(namangan);
        const done = call(service);
        await expect(done).rejects.toThrow(BRANCH_REFUSAL);
        expect(prisma.holiday.update).not.toHaveBeenCalled();
        expect(prisma.groupHolidayExtension.findMany).not.toHaveBeenCalled();
      });

      it("lets an Administrator manage their own branch's holiday", async () => {
        prisma.holiday.findFirst.mockResolvedValue(fargona);
        await call(service);
        expect(prisma.holiday.update).toHaveBeenCalled();
      });
    });

    describe('reads', () => {
      it("shows a centre-wide holiday and the caller's own branch's, refuses another branch's", async () => {
        prisma.holiday.findFirst.mockResolvedValue(mockHoliday);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).resolves.toEqual(
          mockHoliday,
        );

        prisma.holiday.findFirst.mockResolvedValue(fargona);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).resolves.toEqual(
          fargona,
        );

        prisma.holiday.findFirst.mockResolvedValue(namangan);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).rejects.toThrow(
          BRANCH_REFUSAL,
        );
      });

      it("refuses another branch's status trail without reading it", async () => {
        prisma.holiday.findFirst.mockResolvedValue({ id: 'h-1', branchId: 2 });
        await expect(
          service.getStatusHistory('h-1', COMPANY_ID, 5),
        ).rejects.toThrow(BRANCH_REFUSAL);
        expect(statusHistoryService.getHistory).not.toHaveBeenCalled();
      });

      it("lists the centre-wide holidays and the scope's branches, with the branch name", async () => {
        await service.findAll({}, COMPANY_ID, [1]);
        expect(prisma.holiday.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              deletedAt: null,
              companyId: COMPANY_ID,
              OR: [{ branchId: null }, { branchId: { in: [1] } }],
            },
            include: { branch: { select: { name: true } } },
          }),
        );
      });
    });
  });

  describe('findActiveHolidayCovering', () => {
    it('queries by overlap (date <= X AND endDate >= X)', async () => {
      const probe = new Date('2026-05-28');
      await service.findActiveHolidayCovering(probe);
      expect(prisma.holiday.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          date: { lte: probe },
          endDate: { gte: probe },
        },
        select: { id: true, name: true, date: true, endDate: true },
      });
    });
  });

  describe('buildHolidayDateSet', () => {
    it('expands each holiday range to one Set entry per day', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        {
          id: 'h-1',
          name: "Navro'z",
          date: new Date('2026-03-21T00:00:00.000Z'),
          endDate: new Date('2026-03-23T00:00:00.000Z'),
        },
      ]);
      const set = await service.buildHolidayDateSet(
        new Date('2026-03-20T00:00:00.000Z'),
        new Date('2026-03-25T00:00:00.000Z'),
      );
      expect(set.has('2026-03-21')).toBe(true);
      expect(set.has('2026-03-22')).toBe(true);
      expect(set.has('2026-03-23')).toBe(true);
      expect(set.has('2026-03-20')).toBe(false);
      expect(set.has('2026-03-24')).toBe(false);
    });
  });
});
