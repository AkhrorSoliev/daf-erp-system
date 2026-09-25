import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from '../common/student-origin/student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * One student = one branch (docs/branch-decisions.md D5).
 *
 * Before this guard `branchIds` was an unvalidated array: `[]`, a foreign
 * company's branch or a non-existent id all went through, producing a student
 * who shows up in no branch-filtered list and whose first payment cannot be
 * booked to any branch.
 */
describe('StudentsWriteService — branch validation', () => {
  let service: StudentsWriteService;
  let prisma: any;

  const COMPANY = 1001;
  const baseDto = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
  } as any;

  beforeEach(async () => {
    prisma = {
      // The caller is now checked against the student's branch
      // (`assertCallerMayTouchStudent`) — editing or expelling
      // another branch's student was open. A CEO spans all.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: RedisService, useValue: { set: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: {} },
        {
          provide: StudentLeadOriginService,
          useValue: { recordDirectOrigin: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(StudentsWriteService);
  });

  // Bu testlar filial tekshiruvi haqida, lid kelib chiqishi haqida emas —
  // tranzaksiyaga yetib bormasdan yiqiladi, shuning uchun LEAD origin
  // ishlatiladi (u lid yozuvi yaratmaydi).
  const LEAD_ORIGIN = { kind: 'LEAD' as const, leadId: 'lead-test' };

  it('refuses to create a student with no branch', async () => {
    await expect(
      service.create(baseDto, COMPANY, undefined, LEAD_ORIGIN),
    ).rejects.toThrow(/filial tanlanishi shart/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an empty branch list', async () => {
    await expect(
      service.create(
        { ...baseDto, branchIds: [] },
        COMPANY,
        undefined,
        LEAD_ORIGIN,
      ),
    ).rejects.toThrow(/filial tanlanishi shart/);
  });

  it('refuses two branches at once', async () => {
    await expect(
      service.create(
        { ...baseDto, branchIds: [1, 2] },
        COMPANY,
        undefined,
        LEAD_ORIGIN,
      ),
    ).rejects.toThrow(/faqat bitta filialga/);
  });

  it("refuses a branch that does not belong to the caller's company", async () => {
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...baseDto, branchIds: [99] },
        COMPANY,
        undefined,
        LEAD_ORIGIN,
      ),
    ).rejects.toThrow(/Filial #99 topilmadi/);
    expect(prisma.branch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99, companyId: COMPANY, deletedAt: null },
      }),
    );
  });

  it('lets exactly one valid branch through to the write', async () => {
    prisma.$transaction.mockResolvedValue({ id: 10500 });

    // The write itself needs far more of Prisma than this unit test mocks;
    // what matters here is that validation passed and the write was reached.
    // The caller is a CEO (see the mock above): an anonymous create is now
    // refused, which the block below covers.
    await service
      .create({ ...baseDto, branchIds: [1] }, COMPANY, 10001, LEAD_ORIGIN)
      .catch(() => undefined);

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

/**
 * The branch a student is created in, or moved to, must be one the caller
 * holds. `assertSingleValidBranch` only asked whether the branch was real and
 * in the company, so a Branch Director of one branch could create a student in
 * another — or create one in their own and then move it with `PATCH`, which
 * ends in the same place.
 */
describe('StudentsWriteService — the caller must hold the branch', () => {
  let service: StudentsWriteService;
  let prisma: any;
  let tx: any;
  let createStudentUser: jest.SpyInstance;

  const COMPANY = 1001;
  const FARGONA = 1;
  const NAMANGAN = 2;
  const CEO_ID = 10001;
  const FARGONA_ADMIN_ID = 10011;
  const NAMANGAN_DIRECTOR_ID = 10022;
  const TWO_BRANCH_ADMIN_ID = 10033;
  const STUDENT_ID = 10555;

  // The shape `resolveCallerBranchScope` selects. Keyed by id, so a service
  // that looked up anyone other than the caller finds nobody.
  const CALLERS: Record<number, unknown> = {
    [CEO_ID]: {
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    },
    [FARGONA_ADMIN_ID]: {
      mainBranch: FARGONA,
      branches: [{ branchId: FARGONA }],
      roles: [{ role: { name: 'Administrator' } }],
    },
    [NAMANGAN_DIRECTOR_ID]: {
      mainBranch: NAMANGAN,
      branches: [{ branchId: NAMANGAN }],
      roles: [{ role: { name: 'Branch Director' } }],
    },
    [TWO_BRANCH_ADMIN_ID]: {
      mainBranch: NAMANGAN,
      branches: [{ branchId: NAMANGAN }, { branchId: FARGONA }],
      roles: [{ role: { name: 'Administrator' } }],
    },
  };

  const LEAD_ORIGIN = { kind: 'LEAD' as const, leadId: 'lead-test' };
  const newStudent = {
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    branchIds: [FARGONA],
  } as any;
  const namanganStudent = {
    id: STUDENT_ID,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    photo: null,
    userId: 20555,
    companyId: COMPANY,
    deletedAt: null,
  };

  beforeEach(async () => {
    tx = {
      student: {
        create: jest
          .fn()
          .mockResolvedValue({ id: STUDENT_ID, firstName: 'Ali' }),
        update: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: STUDENT_ID,
          firstName: 'Ali',
          lastName: 'Valiyev',
          branches: [{ branch: { id: FARGONA, name: "Farg'ona filiali" } }],
          enrollments: [],
        }),
      },
      studentBranch: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma = {
      // Phone-uniqueness lookup on create; the student record on update.
      student: { findFirst: jest.fn().mockResolvedValue(null) },
      // The student's CURRENT branch, read by `assertCallerMayTouchStudent`.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve({ id: where.id }),
        ),
      },
      user: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(CALLERS[where.id] ?? null),
        ),
      },
      $transaction: jest.fn((cb: (client: unknown) => unknown) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: RedisService, useValue: { set: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: {} },
        {
          provide: StudentLeadOriginService,
          useValue: {
            recordDirectOrigin: jest.fn(),
            assertSourceUsable: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(StudentsWriteService);
    // The portal account is a separate write with its own tests; here it only
    // has to be observable, so a refused create can be shown to mint none.
    createStudentUser = jest
      .spyOn(service, 'createStudentUser')
      .mockResolvedValue({ userId: 20555, plainPassword: 'x' });
  });

  describe('create', () => {
    it('refuses a caller who does not hold the branch, and writes nothing', async () => {
      const err = await service
        .create(newStudent, COMPANY, NAMANGAN_DIRECTOR_ID, LEAD_ORIGIN)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as Error).message).toMatch(
        /o'quvchi qo'shish huquqingiz yo'q/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(createStudentUser).not.toHaveBeenCalled();
    });

    it('lets a caller who holds the branch create the student in it', async () => {
      await service.create(newStudent, COMPANY, FARGONA_ADMIN_ID, LEAD_ORIGIN);

      expect(tx.studentBranch.createMany).toHaveBeenCalledWith({
        data: [{ studentId: STUDENT_ID, branchId: FARGONA }],
      });
    });

    it('lets a CEO, who holds no branch, create a student in any branch', async () => {
      await service.create(newStudent, COMPANY, CEO_ID, LEAD_ORIGIN);

      expect(tx.studentBranch.createMany).toHaveBeenCalledWith({
        data: [{ studentId: STUDENT_ID, branchId: FARGONA }],
      });
    });

    it('refuses a caller who cannot be identified (fail closed)', async () => {
      await expect(
        service.create(newStudent, COMPANY, undefined, LEAD_ORIGIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update — moving a student to another branch', () => {
    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue(namanganStudent);
    });

    it("refuses to move the caller's own student into a branch they do not hold", async () => {
      const err = await service
        .update(
          STUDENT_ID,
          { branchIds: [FARGONA] } as any,
          NAMANGAN_DIRECTOR_ID,
          COMPANY,
        )
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as Error).message).toMatch(
        /o'quvchi qo'shish huquqingiz yo'q/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a caller who holds both branches move the student', async () => {
      await service.update(
        STUDENT_ID,
        { branchIds: [FARGONA] } as any,
        TWO_BRANCH_ADMIN_ID,
        COMPANY,
      );

      expect(tx.studentBranch.createMany).toHaveBeenCalledWith({
        data: [{ studentId: STUDENT_ID, branchId: FARGONA }],
      });
    });
  });
});

// F-01 regression: changing a student's discount writes a single signed
// DISCOUNT_ADJUSTMENT for the delta. LESSON_DEDUCTION rows store `amount`
// NEGATIVE, so the previous code summed negatives and compared against the
// positive targetCharge — inverting the sign (and inflating the magnitude),
// debiting students on a discount increase instead of crediting them.
