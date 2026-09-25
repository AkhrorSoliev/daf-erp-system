import { ForbiddenException } from '@nestjs/common';
import { Prisma, SalaryType, UserStatus } from '@prisma/client';
import { whereUserMayAct } from '../../common/auth/blocked-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseEffectiveFromOrThrow,
  resolveCurrentPeriod,
} from './resolve-current-period';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Who may write a teacher's salary rate (ADR-0034: "Ustoz roli bor hammaga").
 *
 * The CEO may set any rate; this module only runs for a caller who is not.
 * A Branch Director may set a rate for an own-branch employee who holds the
 * Teacher role — including an administrator or cashier who ALSO teaches
 * (ADR-0022 puts every one of a person's staff roles on a single account, so
 * excluding a multi-role teacher would just push their rate back onto the
 * CEO for no reason). A target who additionally holds CEO or Branch Director
 * stays CEO-only regardless of the Teacher role, and so does anyone the
 * director cannot reach: themselves, another branch's staff, an inactive
 * account, a FIXED_MONTHLY rate, a date before the open payroll period, or a
 * group outside their branch.
 *
 * `teacherRateRefusal` is the pure decision (unit-tested without Prisma);
 * `assertCallerMaySetTeacherRate` is the one DB-backed gate `POST
 * /salary/config` calls.
 */
export interface RateTarget {
  id: number;
  mainBranch: number | null;
  branches: { branchId: number }[];
  roles: { role: { name: string } }[];
  status: UserStatus;
  isActive: boolean;
}

/**
 * Refusal text, or `null` to allow. The CEO never reaches this function.
 *
 * Checked in order — the first matching rule wins:
 *   1. the target is the caller;
 *   2. the target shares no branch with the caller (a `null` target — not
 *      found, or found in another company — reads the same way, so a
 *      director cannot use the response to probe whether an id exists);
 *   3. the target does not hold Teacher, or also holds CEO or Branch
 *      Director;
 *   4. the target is not ACTIVE / not `isActive`;
 *   5. the rate is FIXED_MONTHLY (CEO-only regardless of the target);
 *   6. the target's existing ACTIVE config (same userId + group) is already
 *      FIXED_MONTHLY — a director may not silently convert a CEO-set monthly
 *      salary into a lesson-based one by reusing that config;
 *   7. `effectiveFrom` falls before the currently open payroll period;
 *   8. a per-group rate whose group is missing, archived, or outside the
 *      caller's branch set.
 */
export function teacherRateRefusal(input: {
  callerId: number;
  callerBranchIds: number[];
  target: RateTarget | null;
  salaryType: SalaryType;
  effectiveFrom: Date;
  periodStart: Date;
  /** `undefined` — the rate has no group; `null` — the group was not found. */
  groupBranchId?: number | null;
  /**
   * The `salaryType` of the target's existing ACTIVE config for this same
   * `(userId, groupId ?? null, companyId)`, or `null`/`undefined` when there
   * is none. Only meaningful on the director path — the CEO may always
   * replace any rate, so the caller never loads this for a CEO.
   */
  existingType?: SalaryType | null;
}): string | null {
  const {
    callerId,
    callerBranchIds,
    target,
    salaryType,
    effectiveFrom,
    periodStart,
    groupBranchId,
    existingType,
  } = input;

  if (target && target.id === callerId) {
    return "O'zingizga stavka qo'ya olmaysiz";
  }

  const mine = new Set(callerBranchIds);
  const targetBranches = target
    ? [
        ...target.branches.map((b) => b.branchId),
        ...(target.mainBranch != null ? [target.mainBranch] : []),
      ]
    : [];
  // Empty set — nothing, never "everything" (ADR-0002). A target that was not
  // found at all lands here too, since `targetBranches` is then empty.
  if (!targetBranches.some((b) => mine.has(b))) {
    return 'Bu ustoz sizning filialingizda emas';
  }
  // `target` is never null past this point — an empty `targetBranches` array
  // never intersects a non-empty `mine`, so the branch check above already
  // returned for a null target.
  const t = target as RateTarget;

  const roleNames = t.roles.map((r) => r.role.name);
  const hasTeacherRole = roleNames.includes('Teacher');
  const hasCeoOrDirectorRole =
    roleNames.includes('CEO') || roleNames.includes('Branch Director');
  if (!hasTeacherRole || hasCeoOrDirectorRole) {
    return 'Bu xodimning oyligini CEO belgilaydi';
  }

  if (t.status !== UserStatus.ACTIVE || t.isActive === false) {
    return "Faol bo'lmagan xodimga stavka qo'yib bo'lmaydi";
  }

  if (salaryType === SalaryType.FIXED_MONTHLY) {
    return 'Oylik (FIXED_MONTHLY) stavkani faqat CEO belgilaydi';
  }

  if (existingType === SalaryType.FIXED_MONTHLY) {
    return "Bu xodimning oylik (FIXED_MONTHLY) stavkasini faqat CEO o'zgartiradi";
  }

  if (effectiveFrom < periodStart) {
    return "Stavka sanasi joriy oylik davridan oldin bo'lishi mumkin emas";
  }

  if (
    groupBranchId !== undefined &&
    (groupBranchId === null || !mine.has(groupBranchId))
  ) {
    return 'Bu guruh sizning filialingizda emas';
  }

  return null;
}

/**
 * `POST /salary/config` gate. Loads the caller ONCE (never
 * `resolveCallerBranchScope`, which would load them a second time) and
 * derives their branch set from that same query, so a demoted director whose
 * JWT still claims the role is caught here rather than trusted. The query goes
 * through `whereUserMayAct()`, so a suspended, terminated or archived caller
 * sets no rate even while Redis is down and their token still passes the
 * guard (ADR-0028).
 */
export async function assertCallerMaySetTeacherRate(
  prisma: PrismaLike,
  callerId: number | undefined,
  companyId: number,
  dto: {
    userId: number;
    groupId?: string | null;
    salaryType: SalaryType;
    effectiveFrom?: string;
  },
  now: Date = new Date(),
): Promise<void> {
  if (callerId == null) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }

  const caller = await prisma.user.findFirst({
    where: { id: callerId, ...whereUserMayAct() },
    select: {
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!caller) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }

  const callerRoleNames = caller.roles.map((r) => r.role.name);
  if (callerRoleNames.includes('CEO')) return;
  if (!callerRoleNames.includes('Branch Director')) {
    // The role guard already requires CEO or Branch Director; reaching here
    // with neither means the JWT is stale — e.g. a demoted director.
    throw new ForbiddenException("Stavka qo'yish huquqingiz yo'q");
  }

  const callerBranchIds = [
    ...new Set<number>([
      ...caller.branches.map((b) => b.branchId),
      ...(caller.mainBranch != null ? [caller.mainBranch] : []),
    ]),
  ];

  // Company-scoped so a director cannot probe another company's user ids;
  // `deletedAt: null` so an archived account never gets a rate. The
  // `employeeSalaryConfig` lookup is the target's current ACTIVE config for
  // this exact (userId, group) pair — loaded ONLY here (never for a CEO) so
  // `teacherRateRefusal` can refuse a director reusing that config to convert
  // an existing FIXED_MONTHLY salary into a lesson-based one (R1).
  const [target, groupBranchId, period, existingConfig] = await Promise.all([
    prisma.user.findFirst({
      where: { id: dto.userId, companyId, deletedAt: null },
      select: {
        id: true,
        mainBranch: true,
        branches: { select: { branchId: true } },
        roles: { select: { role: { select: { name: true } } } },
        status: true,
        isActive: true,
      },
    }),
    dto.groupId
      ? prisma.group
          .findFirst({
            where: { id: dto.groupId, deletedAt: null },
            select: { branchId: true },
          })
          .then((g) => g?.branchId ?? null)
      : Promise.resolve(undefined),
    resolveCurrentPeriod(prisma, companyId, now),
    prisma.employeeSalaryConfig.findFirst({
      where: {
        userId: dto.userId,
        groupId: dto.groupId ?? null,
        companyId,
        isActive: true,
      },
      select: { salaryType: true },
    }),
  ]);

  // Same parser `SalaryConfigService` uses — refuses (400) a value that is
  // not a plain YYYY-MM-DD (e.g. a full ISO instant) instead of silently
  // producing an Invalid Date that would compare `false` to every guard below.
  const effectiveFrom = parseEffectiveFromOrThrow(dto.effectiveFrom, now);

  const refusal = teacherRateRefusal({
    callerId,
    callerBranchIds,
    target,
    salaryType: dto.salaryType,
    effectiveFrom,
    periodStart: period.periodStart,
    groupBranchId,
    existingType: existingConfig?.salaryType ?? null,
  });
  if (refusal) throw new ForbiddenException(refusal);
}
