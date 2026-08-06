import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentEnrollmentService } from './student-enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import { DebtWriteOffService } from '../billing/debt-write-off.service';

/**
 * Enrollment moves money, and three of its four routes are addressed by an
 * ENROLLMENT id whose `:id` path parameter the service has always ignored
 * (`_studentId`).
 *
 * That ignored parameter is the trap. Guarding it would let a caller pass one
 * of their OWN students' ids alongside another branch's enrollment id and
 * satisfy the check while acting on someone else's record. Every case here
 * anchors on the enrollment's own student instead.
 *
 * What each route actually does to another branch:
 *   - `POST .../enroll` — puts a student on another branch's roster, and on a
 *     transfer refunds their unused prepaid lessons to balance.
 *   - `DELETE .../enroll/:enrollmentId` — closes the enrollment and refunds
 *     the prepaid remainder.
 *   - `POST .../write-off-cycle-debt` — writes a DEBT_WRITE_OFF ledger row.
 *     Real money, and the path-prefix money sweep never reached it because it
 *     lives under `/students`.
 */
describe('StudentEnrollmentService — branch confinement', () => {
  let service: StudentEnrollmentService;
  let prisma: any;
  let debtWriteOff: any;

  const FARGONA = 1;
  const NAMANGAN = 2;
  const FARGONA_DIRECTOR = 7;

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 10264, status: 'ACTIVE', companyId: 1001 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'A', lastName: 'B', companyId: 1001 }),
      },
      // The student and the group both sit in NAMANGAN — a consistent pair
      // that the D5 rule accepts. The only thing wrong is who is asking.
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
        findMany: jest.fn().mockResolvedValue([{ branchId: NAMANGAN }]),
        create: jest.fn(),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group-nam',
          name: 'A1',
          deletedAt: null,
          statusEnum: 'ACTIVE',
          branchId: NAMANGAN,
          course: { name: 'Deutsch A1' },
          teachers: [],
        }),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enr-nam',
          studentId: 10264,
          status: 'DROPPED',
          deletedAt: null,
        }),
      },
      // The caller is a Fargona director.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: FARGONA,
          branches: [{ branchId: FARGONA }],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      },
    };

    debtWriteOff = {
      computeEligibility: jest.fn().mockResolvedValue({ eligible: true }),
      executeWriteOff: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
        {
          provide: EnrollmentBillingService,
          useValue: { refundPrepaidToBalance: jest.fn() },
        },
        { provide: DebtWriteOffService, useValue: debtWriteOff },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<StudentEnrollmentService>(StudentEnrollmentService);
  });

  it('refuses enrolling into another branch group — before assigning a branch', async () => {
    await expect(
      service.enrollToGroup(10264, 'group-nam', FARGONA_DIRECTOR, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The check sits ahead of the `StudentBranch` write, so a refused call
    // cannot leave a branch-less student adopted into a branch on the way out.
    expect(prisma.studentBranch.create).not.toHaveBeenCalled();
  });

  it('checks the GROUP branch on enroll, not the student branch', async () => {
    // A student with no branch adopts the group's, so there would be nothing to
    // check on the student side. The group's branch is the one that decides
    // where every downstream lesson fee and accrual lands either way.
    prisma.studentBranch.findMany.mockResolvedValue([]);
    await expect(
      service.enrollToGroup(10264, 'group-nam', FARGONA_DIRECTOR, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.studentBranch.create).not.toHaveBeenCalled();
  });

  it('refuses removing another branch enrollment — no prepaid refund runs', async () => {
    prisma.enrollment.findFirst.mockResolvedValue({
      id: 'enr-nam',
      studentId: 10264,
      status: 'ACTIVE',
      deletedAt: null,
    });
    await expect(
      service.removeFromGroup(99999, 'enr-nam', FARGONA_DIRECTOR, 1001, {
        reason: 'test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses writing off another branch debt', async () => {
    await expect(
      service.writeOffDroppedEnrollmentDebt(
        99999,
        'enr-nam',
        FARGONA_DIRECTOR,
        1001,
        { reason: 'yoʻqolgan', confirmAmount: 100000 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(debtWriteOff.executeWriteOff).not.toHaveBeenCalled();
  });

  it('refuses the eligibility READ that precedes the write-off', async () => {
    await expect(
      service.getDebtWriteOffEligibility(
        99999,
        'enr-nam',
        1001,
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(debtWriteOff.computeEligibility).not.toHaveBeenCalled();
  });

  it('the ignored `:id` path parameter cannot buy access', async () => {
    // 99999 above is a student id the caller does not own either; the point is
    // that the guard never consults it. Passing a student the caller DOES own
    // must not open another branch's enrollment.
    await expect(
      service.writeOffDroppedEnrollmentDebt(
        10001, // a Fargona student — the caller's own
        'enr-nam', // …but a Namangan enrollment
        FARGONA_DIRECTOR,
        1001,
        { reason: 'test', confirmAmount: 1 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(debtWriteOff.executeWriteOff).not.toHaveBeenCalled();
  });

  it('lets the branch own director through', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: NAMANGAN,
      branches: [{ branchId: NAMANGAN }],
      roles: [{ role: { name: 'Branch Director' } }],
    });
    await service.getDebtWriteOffEligibility(99999, 'enr-nam', 1001, 8);
    expect(debtWriteOff.computeEligibility).toHaveBeenCalledWith(
      'enr-nam',
      1001,
    );
  });
});
