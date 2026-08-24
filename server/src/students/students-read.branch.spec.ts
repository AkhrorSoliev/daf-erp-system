import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentsService } from './students.service';
import { StudentsReadService } from './students-read.service';
import { StudentsWriteService } from './students-write.service';
import { StudentsStatusService } from './students-status.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The student LIST is branch-scoped. Every tab on the profile behind it was
 * not.
 *
 * `findAll` and `findById` take a `ReportBranchIds`, so a Namangan director
 * browsing students sees Namangan students. But `balance-summary`,
 * `lessons-overview`, `closed-enrollments`, `active-enrollments-prepaid` and
 * `status-history` each answered on `companyId` alone — so typing a Fargona
 * student's id into the URL returned that student's balance, ledger summary,
 * lesson history and status trail in full. The five ids are sequential
 * five-digit integers.
 *
 * These are gated on the CALLER rather than filtered by a scope on purpose.
 * A scope predicate on a single-record read returns an empty tab, which reads
 * as "this student has no payments" — a wrong answer dressed as a real one.
 * A refusal says what actually happened.
 */
describe('StudentsService — profile reads are branch-gated', () => {
  let service: StudentsService;
  let prisma: any;
  let read: any;
  let transactions: any;

  const FARGONA = 1;
  const NAMANGAN = 2;
  const NAMANGAN_DIRECTOR = 7;
  const FARGONA_STUDENT = 10264;

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: FARGONA_STUDENT }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: FARGONA }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: NAMANGAN,
          branches: [{ branchId: NAMANGAN }],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      },
    };

    read = {
      getStatusHistory: jest.fn().mockResolvedValue([]),
      getActiveEnrollmentsWithPrepaid: jest.fn().mockResolvedValue([]),
      getClosedEnrollments: jest.fn().mockResolvedValue([]),
      getLessonsOverview: jest.fn().mockResolvedValue({}),
    };
    transactions = { getBalanceSummary: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: StudentsReadService, useValue: read },
        { provide: StudentsWriteService, useValue: {} },
        { provide: StudentsStatusService, useValue: {} },
        { provide: TransactionsService, useValue: transactions },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  const CASES: [string, () => Promise<unknown>, () => jest.Mock][] = [
    [
      'balance-summary',
      () => service.getBalanceSummary(FARGONA_STUDENT, 1001, NAMANGAN_DIRECTOR),
      () => transactions.getBalanceSummary,
    ],
    [
      'status-history',
      () => service.getStatusHistory(FARGONA_STUDENT, 1001, NAMANGAN_DIRECTOR),
      () => read.getStatusHistory,
    ],
    [
      'active-enrollments-prepaid',
      () =>
        service.getActiveEnrollmentsWithPrepaid(
          FARGONA_STUDENT,
          1001,
          NAMANGAN_DIRECTOR,
        ),
      () => read.getActiveEnrollmentsWithPrepaid,
    ],
    [
      'closed-enrollments',
      () =>
        service.getClosedEnrollments(FARGONA_STUDENT, 1001, NAMANGAN_DIRECTOR),
      () => read.getClosedEnrollments,
    ],
    [
      'lessons-overview',
      () =>
        service.getLessonsOverview(
          FARGONA_STUDENT,
          1001,
          false,
          NAMANGAN_DIRECTOR,
        ),
      () => read.getLessonsOverview,
    ],
  ];

  describe.each(CASES)('%s', (_name, call, delegate) => {
    it('refuses another branch student and never reaches the read', async () => {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
      expect(delegate()).not.toHaveBeenCalled();
    });

    it('allows the student own branch', async () => {
      prisma.studentBranch.findFirst.mockResolvedValue({ branchId: NAMANGAN });
      await call();
      expect(delegate()).toHaveBeenCalled();
    });

    it('404s a deleted student rather than leaking a 403', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('lets a CEO read across branches', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });
    await service.getBalanceSummary(FARGONA_STUDENT, 1001, 1);
    expect(transactions.getBalanceSummary).toHaveBeenCalled();
  });
});
