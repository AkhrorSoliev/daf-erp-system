import { ForbiddenException } from '@nestjs/common';
import { SalaryType, UserStatus } from '@prisma/client';
import {
  assertCallerMaySetTeacherRate,
  RateTarget,
  teacherRateRefusal,
} from './teacher-rate-permission';

// Invented ids only — never a real production account id.
const CALLER_ID = 90010;
const CEO_ID = 90001;
const TEACHER_ID = 90020;

const teacher = (over: Partial<RateTarget> = {}): RateTarget => ({
  id: TEACHER_ID,
  mainBranch: 2,
  branches: [{ branchId: 2 }],
  roles: [{ role: { name: 'Teacher' } }],
  status: UserStatus.ACTIVE,
  isActive: true,
  ...over,
});

const PERIOD_START = new Date('2026-09-08T00:00:00.000Z');
const AFTER_PERIOD_START = new Date('2026-09-10T00:00:00.000Z');
const BEFORE_PERIOD_START = new Date('2026-09-01T00:00:00.000Z');

describe('teacherRateRefusal', () => {
  const base = {
    callerId: CALLER_ID,
    callerBranchIds: [2],
    salaryType: SalaryType.PERCENTAGE,
    effectiveFrom: AFTER_PERIOD_START,
    periodStart: PERIOD_START,
  };

  it('allows a pure teacher of the caller branch', () => {
    expect(teacherRateRefusal({ ...base, target: teacher() })).toBeNull();
  });

  it('allows a teacher who also holds Administrator (multi-role staff)', () => {
    // "Ustoz roli bor hammaga" (ADR-0034) — a second staff role no longer
    // pushes the rate back to the CEO (ADR-0022: one account per person).
    const adminTeacher = teacher({
      roles: [
        { role: { name: 'Teacher' } },
        { role: { name: 'Administrator' } },
      ],
    });
    expect(teacherRateRefusal({ ...base, target: adminTeacher })).toBeNull();
  });

  it('accepts membership through mainBranch alone', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher({ branches: [] }) }),
    ).toBeNull();
  });

  it('allows a per-group rate whose group is in the caller branch', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: 2 }),
    ).toBeNull();
  });

  it('refuses the caller own rate', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher({ id: CALLER_ID }) }),
    ).toBe("O'zingizga stavka qo'ya olmaysiz");
  });

  it('refuses a teacher of another branch', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher({ mainBranch: 1, branches: [{ branchId: 1 }] }),
      }),
    ).toBe('Bu ustoz sizning filialingizda emas');
  });

  it('refuses when the caller has no branch at all (fail closed, ADR-0002)', () => {
    expect(
      teacherRateRefusal({ ...base, callerBranchIds: [], target: teacher() }),
    ).toBe('Bu ustoz sizning filialingizda emas');
  });

  it('refuses a not-found target with the SAME text as another branch', () => {
    // No 404 — a director must not learn whether an id exists at all.
    expect(teacherRateRefusal({ ...base, target: null })).toBe(
      'Bu ustoz sizning filialingizda emas',
    );
  });

  it('refuses a target with no Teacher role at all', () => {
    const administrator = teacher({
      roles: [{ role: { name: 'Administrator' } }],
    });
    expect(teacherRateRefusal({ ...base, target: administrator })).toBe(
      'Bu xodimning oyligini CEO belgilaydi',
    );
  });

  it('refuses a target who also holds CEO', () => {
    const ceoTeacher = teacher({
      roles: [{ role: { name: 'Teacher' } }, { role: { name: 'CEO' } }],
    });
    expect(teacherRateRefusal({ ...base, target: ceoTeacher })).toBe(
      'Bu xodimning oyligini CEO belgilaydi',
    );
  });

  it('refuses a target who also holds Branch Director', () => {
    const directorTeacher = teacher({
      roles: [
        { role: { name: 'Teacher' } },
        { role: { name: 'Branch Director' } },
      ],
    });
    expect(teacherRateRefusal({ ...base, target: directorTeacher })).toBe(
      'Bu xodimning oyligini CEO belgilaydi',
    );
  });

  it('refuses an INACTIVE target', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher({ status: UserStatus.INACTIVE }),
      }),
    ).toBe("Faol bo'lmagan xodimga stavka qo'yib bo'lmaydi");
  });

  it('refuses a TERMINATED target', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher({ status: UserStatus.TERMINATED }),
      }),
    ).toBe("Faol bo'lmagan xodimga stavka qo'yib bo'lmaydi");
  });

  it('refuses isActive:false even when status still says ACTIVE', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher({ isActive: false }) }),
    ).toBe("Faol bo'lmagan xodimga stavka qo'yib bo'lmaydi");
  });

  it('refuses FIXED_MONTHLY regardless of the target', () => {
    expect(
      teacherRateRefusal({
        ...base,
        salaryType: SalaryType.FIXED_MONTHLY,
        target: teacher(),
      }),
    ).toBe('Oylik (FIXED_MONTHLY) stavkani faqat CEO belgilaydi');
  });

  it('refuses a lesson-based request when the existing active config is FIXED_MONTHLY', () => {
    // A director's `POST /salary/config` must not be the back door that turns
    // a CEO-set monthly salary into a per-lesson one.
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher(),
        existingType: SalaryType.FIXED_MONTHLY,
      }),
    ).toBe(
      "Bu xodimning oylik (FIXED_MONTHLY) stavkasini faqat CEO o'zgartiradi",
    );
  });

  it('allows replacing an existing PERCENTAGE config with another lesson-based type', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher(),
        existingType: SalaryType.PERCENTAGE,
      }),
    ).toBeNull();
  });

  it('allows when there is no existing active config at all', () => {
    expect(
      teacherRateRefusal({
        ...base,
        target: teacher(),
        existingType: null,
      }),
    ).toBeNull();
  });

  it('refuses an effectiveFrom before the current payroll period', () => {
    expect(
      teacherRateRefusal({
        ...base,
        effectiveFrom: BEFORE_PERIOD_START,
        target: teacher(),
      }),
    ).toBe("Stavka sanasi joriy oylik davridan oldin bo'lishi mumkin emas");
  });

  it('allows effectiveFrom exactly at the period start', () => {
    expect(
      teacherRateRefusal({
        ...base,
        effectiveFrom: PERIOD_START,
        target: teacher(),
      }),
    ).toBeNull();
  });

  it('refuses a per-group rate whose group is in another branch', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: 1 }),
    ).toBe('Bu guruh sizning filialingizda emas');
  });

  it('refuses a per-group rate whose group is missing or archived', () => {
    expect(
      teacherRateRefusal({ ...base, target: teacher(), groupBranchId: null }),
    ).toBe('Bu guruh sizning filialingizda emas');
  });
});

describe('assertCallerMaySetTeacherRate', () => {
  const ceoCaller = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const director = {
    mainBranch: 2,
    branches: [{ branchId: 2 }],
    roles: [{ role: { name: 'Branch Director' } }],
  };
  const activeTeacher = {
    id: TEACHER_ID,
    mainBranch: 2,
    branches: [{ branchId: 2 }],
    roles: [{ role: { name: 'Teacher' } }],
    status: UserStatus.ACTIVE,
    isActive: true,
  };
  const dto = {
    userId: TEACHER_ID,
    salaryType: SalaryType.PERCENTAGE,
    value: 30,
  };

  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      group: { findFirst: jest.fn() },
      // Default cycle (DEFAULT_CYCLE_START_DAY=8) — no setting row.
      salaryPeriodSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      // Default: no existing active config — most tests don't care about the
      // FIXED_MONTHLY-protection lookup (R1).
      employeeSalaryConfig: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  });

  it('lets the CEO through without reading the target', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(ceoCaller);
    await expect(
      assertCallerMaySetTeacherRate(prisma, CEO_ID, 1001, dto),
    ).resolves.toBeUndefined();
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    // The CEO may always replace a FIXED_MONTHLY rate — this lookup exists
    // only to protect it from a DIRECTOR, so the CEO path must never run it.
    expect(prisma.employeeSalaryConfig.findFirst).not.toHaveBeenCalled();
  });

  it('lets a director set an own-branch teacher rate', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).resolves.toBeUndefined();
  });

  it('looks the target up scoped to companyId (and excludes soft-deleted)', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    await assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto);

    expect(prisma.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: TEACHER_ID,
          companyId: 1001,
          deletedAt: null,
        }),
      }),
    );
  });

  it('refuses a director on another branch teacher with 403', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce({
        ...activeTeacher,
        mainBranch: 1,
        branches: [{ branchId: 1 }],
      });
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403s (never 404) for an unknown target', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(null);
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, {
        ...dto,
        userId: 99999,
      }),
    ).rejects.toThrow('Bu ustoz sizning filialingizda emas');
  });

  it('reads the group branch for a per-group rate', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    prisma.group.findFirst.mockResolvedValue({ branchId: 1 });
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, {
        ...dto,
        groupId: 'g-1',
      }),
    ).rejects.toThrow('Bu guruh sizning filialingizda emas');
  });

  it('loads the existing active config scoped to userId/groupId/companyId/isActive (R1)', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    await assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto);

    expect(prisma.employeeSalaryConfig.findFirst).toHaveBeenCalledWith({
      where: {
        userId: TEACHER_ID,
        groupId: null,
        companyId: 1001,
        isActive: true,
      },
      select: { salaryType: true },
    });
  });

  it('refuses a director trying to replace an existing FIXED_MONTHLY rate with a lesson-based one', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    prisma.employeeSalaryConfig.findFirst.mockResolvedValue({
      salaryType: SalaryType.FIXED_MONTHLY,
    });

    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).rejects.toThrow(
      "Bu xodimning oylik (FIXED_MONTHLY) stavkasini faqat CEO o'zgartiradi",
    );
  });

  it('lets a director set a rate when the existing active config is lesson-based', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    prisma.employeeSalaryConfig.findFirst.mockResolvedValue({
      salaryType: SalaryType.PERCENTAGE,
    });

    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).resolves.toBeUndefined();
  });

  it('refuses when effectiveFrom predates the current payroll period', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    // cycleStartDay=8 (default) + now=2026-09-15 -> period starts 2026-09-08.
    const now = new Date('2026-09-15T00:00:00.000Z');
    await expect(
      assertCallerMaySetTeacherRate(
        prisma,
        CALLER_ID,
        1001,
        { ...dto, effectiveFrom: '2026-08-20' },
        now,
      ),
    ).rejects.toThrow(
      "Stavka sanasi joriy oylik davridan oldin bo'lishi mumkin emas",
    );
  });

  it('refuses an effectiveFrom that is not a plain YYYY-MM-DD with 400, not silently as Invalid Date (R5)', async () => {
    // `2026-08-20T00:00:00Z` passes the DTO's @IsDateString() but is not the
    // YYYY-MM-DD shape parseTashkentDateStart expects — it must be refused
    // here rather than compared as `NaN` against the period start.
    prisma.user.findFirst
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(activeTeacher);
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, {
        ...dto,
        effectiveFrom: '2026-08-20T00:00:00Z',
      }),
    ).rejects.toThrow("Sana noto'g'ri formatda");
  });

  it('refuses a demoted director whose DB roles no longer include Branch Director', async () => {
    // JWT may still say Branch Director; the DB is re-checked every time.
    prisma.user.findFirst.mockResolvedValueOnce({
      mainBranch: 2,
      branches: [{ branchId: 2 }],
      roles: [{ role: { name: 'Administrator' } }],
    });
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).rejects.toThrow(ForbiddenException);
    // Refused before the target is ever read.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed without a caller id', async () => {
    await expect(
      assertCallerMaySetTeacherRate(prisma, undefined, 1001, dto),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when the caller cannot be found in the DB', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      assertCallerMaySetTeacherRate(prisma, CALLER_ID, 1001, dto),
    ).rejects.toThrow(ForbiddenException);
  });
});
