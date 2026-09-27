import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudentDeparturePreviewService } from './student-departure-preview.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';

const companyId = 1001;
const studentId = 10453;
const ceo = {
  mainBranch: null,
  branches: [],
  roles: [{ role: { name: 'CEO' } }],
};
const administrator = {
  mainBranch: 1,
  branches: [{ branchId: 1 }],
  roles: [{ role: { name: 'Administrator' } }],
};

const monthly = {
  id: 'enr-monthly',
  status: 'ACTIVE',
  groupId: 'group-monthly',
  group: { name: 'A1-12', course: { paymentModel: 'MONTHLY' } },
};
const pack = {
  id: 'enr-pack',
  status: 'FROZEN',
  groupId: 'group-pack',
  group: { name: 'B1-3', course: { paymentModel: 'LESSON_PACK' } },
};
const october = {
  period: '2026-10',
  departureDay: '2026-10-14',
  lessonDates: ['2026-10-02', '2026-10-05'],
  held: 6,
  covered: 13,
  heldPercent: 46,
  threshold: 40,
  contractApplies: true,
  chargedAmount: 1040000,
  outcomes: {
    STUDENT_CANCELLED: { lessons: 0, amount: 0, withheld: true },
    CENTER_INITIATIVE: { lessons: 7, amount: 560000, withheld: false },
    QUALITY_CLAIM: { lessons: 13, amount: 1040000, withheld: false },
  },
};

describe('StudentDeparturePreviewService (ADR-0043)', () => {
  let prisma: {
    student: { findFirst: jest.Mock };
    studentBranch: { findFirst: jest.Mock };
    enrollment: { findMany: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let previewDepartureOutcomes: jest.Mock;
  let service: StudentDeparturePreviewService;

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: studentId, balance: -1 }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue([monthly, pack]) },
      user: { findFirst: jest.fn().mockResolvedValue(ceo) },
    };
    previewDepartureOutcomes = jest.fn().mockResolvedValue(october);
    service = new StudentDeparturePreviewService(
      prisma as unknown as PrismaService,
      { previewDepartureOutcomes } as unknown as MonthlyChargeService,
    );
  });

  it("shows each open enrollment's month under the three policies, a lesson pack with none", async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: studentId,
      balance: -150000,
    });

    const r = await service.preview(studentId, companyId, 10001);

    expect(r.balance).toBe(-150000);
    expect(r.defaultPolicy).toBe('STUDENT_CANCELLED');
    expect(r.departureDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.enrollments).toEqual([
      {
        enrollmentId: 'enr-monthly',
        groupId: 'group-monthly',
        groupName: 'A1-12',
        status: 'ACTIVE',
        month: october,
      },
      {
        enrollmentId: 'enr-pack',
        groupId: 'group-pack',
        groupName: 'B1-3',
        status: 'FROZEN',
        month: null,
      },
    ]);
    expect(previewDepartureOutcomes).toHaveBeenCalledTimes(1);
    expect(previewDepartureOutcomes).toHaveBeenCalledWith(prisma, {
      enrollmentId: 'enr-monthly',
      departureDate: expect.any(Date),
      companyId,
    });
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
      }),
    );
  });

  it('narrows to one enrollment of this student for a removal', async () => {
    prisma.enrollment.findMany.mockResolvedValue([monthly]);

    await service.preview(studentId, companyId, 10001, 'enr-monthly');

    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId, id: 'enr-monthly' }),
      }),
    );
  });

  it("answers 404 for an enrollment that is not this student's open one", async () => {
    prisma.enrollment.findMany.mockResolvedValue([]);

    await expect(
      service.preview(studentId, companyId, 10001, 'enr-elsewhere'),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets a CEO or branch director choose, and says so', async () => {
    const r = await service.preview(studentId, companyId, 10001);
    expect(r.mayChoosePolicy).toBe(true);
  });

  it('shows an administrator the default only', async () => {
    // The branch check reads the caller first, then the policy check.
    prisma.user.findFirst
      .mockResolvedValueOnce(administrator)
      .mockResolvedValueOnce(null);

    const r = await service.preview(studentId, companyId, 10002);

    expect(r.mayChoosePolicy).toBe(false);
  });

  it("refuses another branch's student before reading their money", async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...administrator,
      mainBranch: 2,
      branches: [{ branchId: 2 }],
    });

    await expect(service.preview(studentId, companyId, 10002)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    expect(previewDepartureOutcomes).not.toHaveBeenCalled();
  });
});
