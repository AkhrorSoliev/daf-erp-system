import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  let settingsMock: any;

  const mockCourse = {
    id: 'course-1',
    name: 'English',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
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
      // `create` checks the caller against the course's branch. The create
      // tests below are about other fields, so their caller is a CEO; the
      // branch rule has its own block at the end of this file.
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
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
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
