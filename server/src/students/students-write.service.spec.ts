import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { PrismaService } from '../prisma/prisma.service';
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
      ],
    }).compile();

    service = module.get(StudentsWriteService);
  });

  it('refuses to create a student with no branch', async () => {
    await expect(service.create(baseDto, COMPANY)).rejects.toThrow(
      /filial tanlanishi shart/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an empty branch list', async () => {
    await expect(
      service.create({ ...baseDto, branchIds: [] }, COMPANY),
    ).rejects.toThrow(/filial tanlanishi shart/);
  });

  it('refuses two branches at once', async () => {
    await expect(
      service.create({ ...baseDto, branchIds: [1, 2] }, COMPANY),
    ).rejects.toThrow(/faqat bitta filialga/);
  });

  it("refuses a branch that does not belong to the caller's company", async () => {
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ ...baseDto, branchIds: [99] }, COMPANY),
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
    await service
      .create({ ...baseDto, branchIds: [1] }, COMPANY)
      .catch(() => undefined);

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// F-01 regression: changing a student's discount writes a single signed
// DISCOUNT_ADJUSTMENT for the delta. LESSON_DEDUCTION rows store `amount`
// NEGATIVE, so the previous code summed negatives and compared against the
// positive targetCharge — inverting the sign (and inflating the magnitude),
// debiting students on a discount increase instead of crediting them.
