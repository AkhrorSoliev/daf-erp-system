import { Injectable } from '@nestjs/common';
import { Prisma, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  narrowPayrollScope,
  resolvePayrollBranchScope,
} from './shared/payroll-branch-scope';

export interface StaffConfigQuery {
  search?: string;
  /**
   * The branch picked in the header. It can only ever NARROW — the caller's own
   * payroll scope is the ceiling. Not a DTO field; the controller reads it from
   * `X-Branch-Id` via `@BranchScope()`, exactly as `/salary/overview` does.
   */
  branchId?: number;
}

export interface StaffConfigRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    /**
     * Every role, ids included — the editor needs them (`SalaryConfigRowSheet`
     * offers PERCENTAGE only to role 4), and the list labels the "Lavozim" from
     * the same array. A flattened `position` string would have forced the
     * editor to work from a fake role id.
     */
    roles: { id: number; name: string }[];
    /**
     * The job title. It is the ONLY label a role-less employee has — a
     * cleaner or a guard carries no role by design, so a roles-derived label
     * would render them as "—" on the one screen that exists to give them a
     * rate. Null for employees created before this column, who fall back to
     * their role label on the client.
     */
    position: string | null;
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  configs: {
    id: string;
    salaryType: SalaryType;
    value: number;
    groupId: string | null;
    group: { id: string; name: string } | null;
  }[];
}

/**
 * The non-teaching staff (administrator, cashier, branch director, CEO) and the
 * salary rate each one currently has — the list behind the "Xodimlar stavkalari"
 * section of the ⚙ Sozlamalar sheet.
 *
 * **Why this is not `SalaryOverviewService` with a widened role filter.** That
 * service answers a different question: per teacher it computes lessons,
 * groups, active students and `actualEarned` (unpaid accruals). A FIXED_MONTHLY
 * administrator has none of those by construction, so every one of those
 * columns would read 0 next to a salary that is in fact owed in full — a row
 * that says "earned nothing" about someone who earned their whole month. This
 * service returns the two things a rate editor needs and nothing else.
 *
 * **Why it exists at all.** `SalaryStaffMonthlyService` has surfaced staff on
 * the monthly report since 2026-07, but it starts from the FIXED_MONTHLY
 * configs — and no UI could create one. `/salary/overview` (the only rate list)
 * is teacher-only, and `/payments/salary/config` redirects into it. So the
 * report's empty state told the CEO to go to a screen where no staff member was
 * listed, and production carried 13 staff with zero salary configs between
 * them. This list is the missing write side.
 *
 * Read-only. Writing a rate is the existing `POST /salary/config` (CEO-only),
 * driven by the same `SalaryConfigRowSheet` the teacher rows use — it already
 * offers FIXED_MONTHLY alone when the target is not a teacher.
 */
@Injectable()
export class SalaryStaffConfigService {
  constructor(private prisma: PrismaService) {}

  async listStaff(
    query: StaffConfigQuery,
    companyId: number,
    performedById: number,
  ): Promise<{ data: StaffConfigRow[] }> {
    // Same ceiling-then-narrow rule as `/salary/overview` and `/salary/monthly`.
    // A confined caller with no branch sees NOTHING, and one naming another
    // branch is refused rather than quietly served their own.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    const { branchId, blocked } = narrowPayrollScope(scope, query.branchId);
    if (blocked) return { data: [] };

    const search = query.search?.trim();
    const searchId = search && /^\d+$/.test(search) ? Number(search) : null;

    // Student accounts are Users too — 873 of this company's 886 non-teacher
    // users are students — so excluding Teacher alone would bury the 13 real
    // employees. Payroll is about staff; both portals are filtered out.
    //
    // `status` is deliberately NOT filtered (a TERMINATED employee's final
    // prorated month still has to be payable, and the report already pays it);
    // `deletedAt` is the hard exclusion. `isActive` rides along on the row so
    // the UI can mark them rather than hide them.
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      companyId,
      roles: { none: { role: { name: { in: ['Teacher', 'Student'] } } } },
      ...(branchId !== undefined && { branches: { some: { branchId } } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          ...(searchId !== null ? [{ id: searchId }] : []),
        ],
      }),
    };

    const staff = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        isActive: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    });
    if (staff.length === 0) return { data: [] };

    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: { userId: { in: staff.map((s) => s.id) }, isActive: true, companyId },
      select: {
        id: true,
        userId: true,
        salaryType: true,
        value: true,
        groupId: true,
        group: { select: { id: true, name: true } },
      },
    });
    const byUser = new Map<number, typeof configs>();
    for (const c of configs) {
      const list = byUser.get(c.userId) ?? [];
      list.push(c);
      byUser.set(c.userId, list);
    }

    const rows: StaffConfigRow[] = staff.map((s) => ({
      user: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        roles: s.roles.map((r) => r.role),
        position: s.position,
        isActive: s.isActive,
        branch: s.branches[0]?.branch ?? null,
      },
      configs: (byUser.get(s.id) ?? []).map((c) => ({
        id: c.id,
        salaryType: c.salaryType,
        value: c.value,
        groupId: c.groupId,
        group: c.group,
      })),
    }));

    // Rate-less staff first: they are the only actionable rows, and they are
    // the reason this list exists. Then by name, so the order is stable.
    rows.sort((a, b) => {
      const aSet = a.configs.length > 0 ? 1 : 0;
      const bSet = b.configs.length > 0 ? 1 : 0;
      if (aSet !== bSet) return aSet - bSet;
      const fn = a.user.firstName.localeCompare(b.user.firstName);
      return fn !== 0 ? fn : a.user.lastName.localeCompare(b.user.lastName);
    });

    return { data: rows };
  }
}
