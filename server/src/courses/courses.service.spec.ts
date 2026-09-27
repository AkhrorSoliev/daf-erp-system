import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CourseStatus } from '@prisma/client';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { SettingsService } from '../settings/settings.service';

describe('CoursesService — status methods', () => {
  let service: CoursesService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;
  let entityHistoryService: any;
  let settingsMock: any;

  const mockCourse = {
    id: 'course-1',
    name: 'English',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    branchId: 1,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      course: {
        findFirst: jest.fn().mockResolvedValue(mockCourse),
        update: jest.fn().mockResolvedValue(mockCourse),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
      coursePriceSnapshot: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      // Every id-addressed method checks the caller against the course's
      // branch. The tests above the branch block are about other things, so
      // their caller is a CEO; the branch rule has its own block at the end.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: 1,
        statusChangeReason: null,
      }),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        {
          provide: SettingsService,
          useValue: (settingsMock = {
            get: jest.fn().mockResolvedValue('MONTHLY'),
          }),
        },
      ],
    }).compile();

    service = module.get(CoursesService);
  });

  describe('changeStatus', () => {
    it('updates status and sets isActive=true for ACTIVE', async () => {
      prisma.course.findFirst.mockResolvedValue({
        ...mockCourse,
        status: 'INACTIVE',
      });

      await service.changeStatus(
        'course-1',
        { status: 'ACTIVE' as any },
        1,
        1001,
      );

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE', isActive: true }),
        }),
      );
    });

    it('cascades on status change', async () => {
      await service.changeStatus(
        'course-1',
        { status: 'DEPRECATED' as any },
        1,
        1001,
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Course',
        'course-1',
        'DEPRECATED',
        1,
      );
    });

    it('throws NotFoundException for missing course', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus('missing', { status: 'INACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives course with ARCHIVED status', async () => {
      await service.delete('course-1', 1, 1001);

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(
        'course-1',
        { status: 'INACTIVE' as any },
        1,
        1001,
      );
      expect(prisma.course.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'course-1',
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });

    it('delete scopes lookup to companyId', async () => {
      await service.delete('course-1', 1, 1001);
      expect(prisma.course.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'course-1',
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });

  describe('findOne — the schedule its running groups add up to', () => {
    it("reads only running groups' days and summarises them", async () => {
      prisma.group = {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { exactDays: ['monday', 'wednesday', 'friday'] },
          ]),
      };
      const out = await service.findOne('course-1', 1001, null);

      expect(prisma.group.findMany).toHaveBeenCalledWith({
        where: {
          courseId: 'course-1',
          deletedAt: null,
          statusEnum: { in: ['FORMING', 'ACTIVE', 'PAUSED'] },
        },
        select: { exactDays: true },
      });
      expect(out.schedule.weeklyLessons).toEqual([3]);
      expect(out.schedule.monthLessons).toEqual({
        min: expect.any(Number),
        max: expect.any(Number),
      });
    });
  });

  describe('create — lessonPaymentCount passthrough', () => {
    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, companyId: 1001 });
      prisma.course.create.mockResolvedValue({
        ...mockCourse,
        lessonPaymentCount: 8,
        price: 600_000,
        createdAt: new Date(),
      });
      prisma.coursePriceSnapshot = { create: jest.fn().mockResolvedValue({}) };
    });

    it('persists lessonPaymentCount when provided in create DTO', async () => {
      await service.create(
        {
          name: 'Intensive',
          price: 600_000,
          branchId: 1,
          lessonPaymentCount: 8,
        } as any,
        1,
        1001,
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lessonPaymentCount: 8 }),
        }),
      );
    });

    it('passes undefined when lessonPaymentCount omitted (DB default applies)', async () => {
      await service.create(
        { name: 'Standard', price: 400_000, branchId: 1 } as any,
        1,
        1001,
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lessonPaymentCount: undefined }),
        }),
      );
    });
  });

  describe('create — payment.defaultModel wiring', () => {
    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({ id: 1, companyId: 1001 });
      prisma.course.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...mockCourse, ...data, createdAt: new Date() }),
      );
      prisma.coursePriceSnapshot = { create: jest.fn().mockResolvedValue({}) };
    });

    it('DTOda paymentModel ko`rsatilmasa — payment.defaultModel sozlamasi ishlatiladi', async () => {
      settingsMock.get.mockResolvedValueOnce('MONTHLY');

      await service.create(
        { name: 'Standard', price: 400_000, branchId: 1 } as any,
        1001,
        1,
      );

      expect(settingsMock.get).toHaveBeenCalledWith(
        1001,
        'payment.defaultModel',
        1,
      );
      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentModel: 'MONTHLY' }),
        }),
      );
    });

    it('DTOda paymentModel aniq ko`rsatilsa — sozlamadan qat`i nazar shu qiymat yoziladi', async () => {
      await service.create(
        {
          name: 'Eski uslub',
          price: 400_000,
          branchId: 1,
          paymentModel: 'LESSON_PACK',
        } as any,
        1001,
        1,
      );

      expect(settingsMock.get).not.toHaveBeenCalled();
      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentModel: 'LESSON_PACK' }),
        }),
      );
    });
  });

  /**
   * `@Roles()` proves the caller is staff, not that the course is theirs. These
   * methods looked the course up by `companyId` alone, and a course carries
   * money: every per-lesson charge for its students is derived from `price`
   * (`common/finance/per-lesson-price.ts`), `paymentModel` moves every group on
   * it onto other billing rules, and archiving it cascades — its groups are
   * cancelled and their enrolments dropped. A Branch Director of one branch
   * could do all of that to another branch's course by passing its id.
   */
  describe("id-addressed methods — the caller must hold the course's branch", () => {
    const COMPANY = 1001;
    const FARGONA = 1;
    const NAMANGAN = 2;
    const COURSE_ID = 'course-1';
    const CEO_ID = 10001;
    const FARGONA_DIRECTOR_ID = 10011;
    const NAMANGAN_DIRECTOR_ID = 10022;
    const DELETED_USER_ID = 10099;

    // The shape `resolveCallerBranchScope` selects. Keyed by id, so a service
    // that looked up anyone other than the caller finds nobody.
    const CALLERS: Record<number, unknown> = {
      [CEO_ID]: {
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      },
      [FARGONA_DIRECTOR_ID]: {
        mainBranch: FARGONA,
        branches: [{ branchId: FARGONA }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
      [NAMANGAN_DIRECTOR_ID]: {
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
    };

    const fargonaCourse = { ...mockCourse, branchId: FARGONA, price: 600_000 };

    type Call = (caller: number | undefined) => Promise<unknown>;

    // Each method called the way its controller calls it, paired with the
    // effect the method exists to have. The status change is ARCHIVED, the
    // one that cascades into groups and enrolments.
    const METHODS: [string, Call, () => jest.Mock][] = [
      [
        'update',
        (caller) =>
          service.update(COURSE_ID, { price: 700_000 }, caller, COMPANY),
        () => prisma.course.update,
      ],
      [
        'changeStatus',
        (caller) =>
          service.changeStatus(
            COURSE_ID,
            { status: CourseStatus.ARCHIVED },
            caller as number,
            COMPANY,
          ),
        () => prisma.course.update,
      ],
      [
        'delete',
        (caller) => service.delete(COURSE_ID, caller as number, COMPANY),
        () => prisma.course.update,
      ],
      [
        'getStatusHistory',
        (caller) =>
          service.getStatusHistory(COURSE_ID, COMPANY, caller as number),
        () => statusHistoryService.getHistory,
      ],
    ];

    /** Every write these methods can make, plus the one read that returns data. */
    const sideEffects = () => ({
      courseUpdates: prisma.course.update.mock.calls.length,
      priceSnapshots: prisma.coursePriceSnapshot.create.mock.calls.length,
      statusRows: statusHistoryService.changeStatus.mock.calls.length,
      cascades: statusCascadeService.cascade.mock.calls.length,
      auditRows:
        entityHistoryService.recordUpdate.mock.calls.length +
        entityHistoryService.recordStatusChange.mock.calls.length +
        entityHistoryService.recordDelete.mock.calls.length,
      historyReads: statusHistoryService.getHistory.mock.calls.length,
    });
    const NOTHING = {
      courseUpdates: 0,
      priceSnapshots: 0,
      statusRows: 0,
      cascades: 0,
      auditRows: 0,
      historyReads: 0,
    };

    beforeEach(() => {
      prisma.course.findFirst.mockResolvedValue(fargonaCourse);
      prisma.user.findFirst.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve(CALLERS[where.id] ?? null),
      );
    });

    it.each(METHODS)(
      '%s refuses a Branch Director of another branch and changes nothing',
      async (_name, call) => {
        const err = await call(NAMANGAN_DIRECTOR_ID).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as Error).message).toMatch(/kurs boshqa filialga tegishli/);
        expect(sideEffects()).toEqual(NOTHING);
      },
    );

    it.each(METHODS)(
      '%s refuses a caller who cannot be identified (fail closed)',
      async (_name, call) => {
        await expect(call(undefined)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        await expect(call(DELETED_USER_ID)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(sideEffects()).toEqual(NOTHING);
      },
    );

    it.each(METHODS)(
      "%s lets a Branch Director of the course's own branch through",
      async (_name, call, effect) => {
        await call(FARGONA_DIRECTOR_ID);
        expect(effect()).toHaveBeenCalledTimes(1);
      },
    );

    it.each(METHODS)(
      '%s lets a CEO, who holds no branch, act on any course',
      async (_name, call, effect) => {
        await call(CEO_ID);
        expect(effect()).toHaveBeenCalledTimes(1);
      },
    );

    it.each(METHODS)(
      '%s still answers 404, not 403, for a course that does not exist',
      async (_name, call) => {
        prisma.course.findFirst.mockResolvedValue(null);
        await expect(call(NAMANGAN_DIRECTOR_ID)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      },
    );

    /**
     * `Course.branchId` is nullable. Production has no such course and the
     * create DTO requires a branch, but the column allows it, so the rule has
     * to say something. A course in no branch is in no branch's catalogue —
     * `branchIdWhere` already hides it from every branch-confined list and
     * from `findOne` — while groups of any branch could point at it, so a
     * change to it reaches every branch. Only a caller spanning all of them
     * may make it.
     */
    describe('a course that belongs to no branch', () => {
      beforeEach(() => {
        prisma.course.findFirst.mockResolvedValue({
          ...fargonaCourse,
          branchId: null,
        });
      });

      it.each(METHODS)(
        '%s refuses a Branch Director and changes nothing',
        async (_name, call) => {
          const err = await call(FARGONA_DIRECTOR_ID).catch((e: unknown) => e);

          expect(err).toBeInstanceOf(ForbiddenException);
          expect((err as Error).message).toMatch(
            /hech bir filialga biriktirilmagan/,
          );
          expect(sideEffects()).toEqual(NOTHING);
        },
      );

      it.each(METHODS)(
        '%s lets a CEO act on it',
        async (_name, call, effect) => {
          await call(CEO_ID);
          expect(effect()).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  /**
   * `POST /courses` names its branch in the body. "The branch exists in this
   * company" is not the same question as "the caller may act in it": a
   * Branch Director of one branch could send another branch's id and put a
   * course, with a price of their choosing, into that branch's catalogue.
   */
  describe('create — the caller must hold the branch', () => {
    const COMPANY = 1001;
    const FARGONA = 1;
    const NAMANGAN = 2;
    const CEO_ID = 10001;
    const FARGONA_DIRECTOR_ID = 10011;
    const NAMANGAN_DIRECTOR_ID = 10022;

    // The shape `resolveCallerBranchScope` selects. Keyed by id, so a service
    // that looked up anyone other than the caller finds nobody.
    const CALLERS: Record<number, unknown> = {
      [CEO_ID]: {
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      },
      [FARGONA_DIRECTOR_ID]: {
        mainBranch: FARGONA,
        branches: [{ branchId: FARGONA }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
      [NAMANGAN_DIRECTOR_ID]: {
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
    };

    const dto = { name: 'A1 intensiv', price: 600_000, branchId: FARGONA };

    beforeEach(() => {
      prisma.user.findFirst.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve(CALLERS[where.id] ?? null),
      );
      prisma.branch.findFirst.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve({
            id: where.id,
            companyId: COMPANY,
            deletedAt: null,
          }),
      );
      prisma.course.create.mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'course-new', ...data, createdAt: new Date() }),
      );
      prisma.coursePriceSnapshot = { create: jest.fn().mockResolvedValue({}) };
    });

    it('refuses a caller who does not hold the branch, and writes nothing', async () => {
      const err = await service
        .create(dto, COMPANY, NAMANGAN_DIRECTOR_ID)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as Error).message).toMatch(/kurs yaratish huquqingiz yo'q/);
      expect(prisma.course.create).not.toHaveBeenCalled();
    });

    it('lets a caller who holds the branch create the course in it', async () => {
      await service.create(dto, COMPANY, FARGONA_DIRECTOR_ID);

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: FARGONA,
            companyId: COMPANY,
          }),
        }),
      );
    });

    it('lets a CEO, who holds no branch, create a course in any branch', async () => {
      await service.create({ ...dto, branchId: NAMANGAN }, COMPANY, CEO_ID);

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: NAMANGAN }),
        }),
      );
    });

    it('refuses a caller who cannot be identified (fail closed)', async () => {
      await expect(
        service.create(dto, COMPANY, undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.course.create).not.toHaveBeenCalled();
    });
  });
});
