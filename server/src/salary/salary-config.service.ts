import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseTashkentDateStart,
  tashkentStartOfToday,
} from './shared/resolve-current-period';
import {
  Prisma,
  SalaryType,
  EmployeeSalaryConfig,
  SalaryPaymentStatus,
} from '@prisma/client';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';

/**
 * Salary config writes always create a new EmployeeSalaryConfigVersion row
 * (SCD2). The parent EmployeeSalaryConfig keeps the *current* values as a
 * fast-read mirror. Accruals look up the version active on the lesson
 * date so a rate change applies forward, not retroactively.
 */
@Injectable()
export class SalaryConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(userId: number, companyId: number) {
    return this.prisma.employeeSalaryConfig.findMany({
      where: { userId, companyId, isActive: true },
      select: {
        id: true,
        salaryType: true,
        value: true,
        isActive: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Bulk-fetch active configs for many users in one query. Powers the
   * "Joriy oylik" column on the /payments/salary/config page where the
   * UI needs a summary for every visible row without N parallel calls.
   */
  async getConfigsForUsers(userIds: number[], companyId: number) {
    if (userIds.length === 0) return {};
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: { userId: { in: userIds }, companyId, isActive: true },
      select: {
        id: true,
        userId: true,
        salaryType: true,
        value: true,
        groupId: true,
        group: { select: { id: true, name: true } },
      },
    });
    const byUser: Record<
      number,
      Array<{
        id: string;
        salaryType: string;
        value: number;
        groupId: string | null;
        group: { id: string; name: string } | null;
      }>
    > = {};
    for (const c of configs) {
      const list = byUser[c.userId] ?? [];
      list.push({
        id: c.id,
        salaryType: c.salaryType,
        value: c.value,
        groupId: c.groupId,
        group: c.group,
      });
      byUser[c.userId] = list;
    }
    return byUser;
  }

  async createConfig(
    dto: CreateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    if (dto.salaryType === SalaryType.FIXED_MONTHLY && dto.groupId) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
      );
    }

    const effectiveFrom = this.parseEffectiveFrom(dto.effectiveFrom);

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.employeeSalaryConfig.findFirst({
          where: {
            userId: dto.userId,
            groupId: dto.groupId ?? null,
            companyId,
          },
          include: {
            versions: {
              where: { effectiveTo: null },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        });

        const config = existing
          ? await this.upsertNewVersion(tx, existing, {
              salaryType: dto.salaryType,
              value: dto.value,
              effectiveFrom,
              changedById,
              companyId,
            })
          : await this.createWithInitialVersion(tx, {
              userId: dto.userId,
              groupId: dto.groupId ?? null,
              salaryType: dto.salaryType,
              value: dto.value,
              effectiveFrom,
              changedById,
              companyId,
            });

        return config;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  async applyGlobalConfig(
    dto: GlobalSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    if (dto.salaryType === SalaryType.FIXED_MONTHLY) {
      throw new BadRequestException(
        "FIXED_MONTHLY oylik turini global qo'llab bo'lmaydi — har xodim uchun alohida belgilang",
      );
    }

    const effectiveFrom = this.parseEffectiveFrom(dto.effectiveFrom);

    const teachers = await this.prisma.groupTeacher.findMany({
      where: {
        group: { deletedAt: null, companyId },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });

    // Each teacher's config is updated atomically. We don't wrap the whole
    // batch in one transaction — that would lock the entire teachers table
    // for a potentially long time. Per-user atomicity is enough since each
    // global apply is a single rate change shared across N users.
    let updated = 0;
    for (const t of teachers) {
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.employeeSalaryConfig.findFirst({
            where: { userId: t.teacherId, groupId: null, companyId },
            include: {
              versions: {
                where: { effectiveTo: null },
                orderBy: { effectiveFrom: 'desc' },
                take: 1,
              },
            },
          });

          if (existing) {
            await this.upsertNewVersion(tx, existing, {
              salaryType: dto.salaryType,
              value: dto.value,
              effectiveFrom,
              changedById,
              companyId,
            });
          } else {
            await this.createWithInitialVersion(tx, {
              userId: t.teacherId,
              groupId: null,
              salaryType: dto.salaryType,
              value: dto.value,
              effectiveFrom,
              changedById,
              companyId,
            });
          }
          updated++;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 15_000,
        },
      );
    }

    return { updated };
  }

  async updateConfig(
    id: string,
    dto: UpdateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    const effectiveFrom = this.parseEffectiveFrom(dto.effectiveFrom);

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.employeeSalaryConfig.findFirst({
          where: { id, companyId },
          include: {
            versions: {
              where: { effectiveTo: null },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        });
        if (!existing) throw new NotFoundException('Salary config topilmadi');

        if (dto.salaryType === SalaryType.FIXED_MONTHLY && existing.groupId) {
          throw new BadRequestException(
            "FIXED_MONTHLY oylik turi guruh bilan bog'lab bo'lmaydi",
          );
        }

        // Write a new version only when something rate-affecting changed
        // (salaryType or value). isActive flips don't need a version row —
        // they're a deactivation, not a rate change.
        const rateChanged =
          (dto.salaryType !== undefined &&
            dto.salaryType !== existing.salaryType) ||
          (dto.value !== undefined && dto.value !== existing.value);

        if (rateChanged) {
          await this.upsertNewVersion(tx, existing, {
            salaryType: dto.salaryType ?? existing.salaryType,
            value: dto.value ?? existing.value,
            effectiveFrom,
            changedById,
            companyId,
          });
        }

        // Deactivating a config MUST close its open version so proration /
        // version-resolution sees a clean end. Otherwise a deactivated
        // FIXED_MONTHLY config with an open version would keep paying forever
        // (the report/cron queries include configs by version overlap, not by
        // isActive). Invariant: a deactivated config never has an open version.
        if (dto.isActive === false) {
          await tx.employeeSalaryConfigVersion.updateMany({
            where: { configId: id, effectiveTo: null },
            data: { effectiveTo: effectiveFrom },
          });
        }

        return tx.employeeSalaryConfig.update({
          where: { id },
          data: {
            ...(dto.salaryType && { salaryType: dto.salaryType }),
            ...(dto.value !== undefined && { value: dto.value }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  /**
   * Versioned history for one user's configs (per-group + global).
   * Used by the teacher profile timeline tab.
   */
  async getHistory(userId: number, companyId: number) {
    return this.prisma.employeeSalaryConfigVersion.findMany({
      where: {
        config: { userId, companyId },
      },
      select: {
        id: true,
        configId: true,
        salaryType: true,
        value: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        config: {
          select: {
            groupId: true,
            group: { select: { id: true, name: true } },
          },
        },
        changedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Close a deactivated / terminated / archived employee's FIXED_MONTHLY salary
   * so the payroll cron stops paying them. Sets each active FIXED_MONTHLY config
   * inactive AND closes its open version (`effectiveTo = asOf`), so the final
   * (partial) month prorates correctly and every later month prorates to 0.
   *
   * Only FIXED_MONTHLY is touched — PERCENTAGE / FIXED_PER_STUDENT (teacher)
   * configs are attendance-gated (no work → no accrual), so leaving them active
   * carries no overpayment risk and avoids disturbing accrual rate resolution.
   *
   * Idempotent: a second call once everything is closed is a no-op (returns 0).
   * Invoked by `SalaryUserLifecycleListener` on the `user.deactivated` event.
   */
  async deactivateConfigsForUser(
    userId: number,
    companyId: number,
    asOf: Date = new Date(),
  ): Promise<number> {
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: {
        userId,
        companyId,
        isActive: true,
        salaryType: SalaryType.FIXED_MONTHLY,
      },
      select: { id: true },
    });
    if (configs.length === 0) return 0;

    const ids = configs.map((c) => c.id);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.employeeSalaryConfigVersion.updateMany({
          where: { configId: { in: ids }, effectiveTo: null },
          data: { effectiveTo: asOf },
        });
        await tx.employeeSalaryConfig.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
    return configs.length;
  }

  // ---------- internals ----------

  /**
   * YYYY-MM-DD → 00:00 Tashkent. Default = today @ 00:00 Tashkent.
   *
   * Both branches delegate to `shared/resolve-current-period`, which is also
   * what `computePeriodBounds` and `SalaryPeriodSettingsService` use — a rate
   * version's start and the period boundary it has to line up with must not be
   * computed two different ways. The default branch used to build the date via
   * `toLocaleString` + `setHours`, which reads the PROCESS timezone and so gave
   * a different answer on a UTC host than on a Tashkent one.
   */
  private parseEffectiveFrom(input?: string): Date {
    return input ? parseTashkentDateStart(input) : tashkentStartOfToday();
  }

  private async createWithInitialVersion(
    tx: Prisma.TransactionClient,
    params: {
      userId: number;
      groupId: string | null;
      salaryType: SalaryType;
      value: number;
      effectiveFrom: Date;
      changedById?: number;
      companyId: number;
    },
  ): Promise<EmployeeSalaryConfig> {
    const config = await tx.employeeSalaryConfig.create({
      data: {
        userId: params.userId,
        groupId: params.groupId,
        salaryType: params.salaryType,
        value: params.value,
        companyId: params.companyId,
      },
    });
    await tx.employeeSalaryConfigVersion.create({
      data: {
        configId: config.id,
        salaryType: params.salaryType,
        value: params.value,
        effectiveFrom: params.effectiveFrom,
        effectiveTo: null,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });
    return config;
  }

  private async upsertNewVersion(
    tx: Prisma.TransactionClient,
    existing: EmployeeSalaryConfig & {
      versions: Array<{
        id: string;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>;
    },
    params: {
      salaryType: SalaryType;
      value: number;
      effectiveFrom: Date;
      changedById?: number;
      companyId: number;
    },
  ): Promise<EmployeeSalaryConfig> {
    const latest = existing.versions[0];

    if (latest && params.effectiveFrom < latest.effectiveFrom) {
      throw new BadRequestException(
        `Yangi sana eski versiyaning sanasidan oldin bo'la olmaydi (${latest.effectiveFrom.toISOString().slice(0, 10)} dan keyin)`,
      );
    }

    // Reject when effectiveFrom lands inside an already-paid period.
    // Otherwise the rate change would silently miss the cutoff.
    const closedPeriod = await tx.salaryPayment.findFirst({
      where: {
        userId: existing.userId,
        companyId: params.companyId,
        status: {
          in: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.PAID],
        },
        periodStart: { lte: params.effectiveFrom },
        periodEnd: { gte: params.effectiveFrom },
      },
      select: { id: true, periodStart: true, periodEnd: true, status: true },
    });
    if (closedPeriod) {
      throw new BadRequestException(
        `Bu sana yopiq oylik davriga (${closedPeriod.status}, ${closedPeriod.periodStart.toISOString().slice(0, 10)}..${closedPeriod.periodEnd.toISOString().slice(0, 10)}) tushadi`,
      );
    }

    if (latest) {
      // Close the current open version. effectiveFrom == effectiveTo means
      // the old version covers up to (but not including) the new one.
      await tx.employeeSalaryConfigVersion.update({
        where: { id: latest.id },
        data: { effectiveTo: params.effectiveFrom },
      });
    }

    await tx.employeeSalaryConfigVersion.create({
      data: {
        configId: existing.id,
        salaryType: params.salaryType,
        value: params.value,
        effectiveFrom: params.effectiveFrom,
        effectiveTo: null,
        changedById: params.changedById,
        companyId: params.companyId,
      },
    });

    return tx.employeeSalaryConfig.update({
      where: { id: existing.id },
      data: {
        salaryType: params.salaryType,
        value: params.value,
        isActive: true,
      },
    });
  }
}
